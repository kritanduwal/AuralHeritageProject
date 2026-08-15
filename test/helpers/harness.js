'use strict';
/**
 * Loads the real application files into a sandbox with stubbed browser APIs.
 *
 * The app is plain script-tag JavaScript with no module system, so there is
 * nothing to import. Instead the files are concatenated exactly as index.html
 * loads them and evaluated in a vm context whose globals are test doubles for
 * the DOM, Web Audio, pannellum, fetch and timers.
 *
 * Top-level `let`/`const` bindings are not exposed on a vm context's global
 * object, so an epilogue publishes the ones tests need through accessors.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/** In the order index.html loads them */
const APP_FILES = ['ChurchData.js', 'Rooms.js', 'App.js', 'AudioEngine.js', 'SettingsMenu.js'];

const EPILOGUE = `
;globalThis.__state = {
    get room()            { return room; },            set room(v)            { room = v; },
    get rcvpos()          { return rcvpos; },          set rcvpos(v)          { rcvpos = v; },
    get srcpos()          { return srcpos; },          set srcpos(v)          { srcpos = v; },
    get viewer()          { return viewer; },
    get isPlaying()       { return isPlaying; },
    get source()          { return source; },
    get activeGraph()     { return activeGraph; },
    get sourceBuffer()    { return sourceBuffer; },    set sourceBuffer(v)    { sourceBuffer = v; },
    get currentIr()       { return currentIr; },
    get convolutionMix()  { return convolutionMix; },
    get compileSequence() { return compileSequence; },
};
;globalThis.__consts = {
    ROOMS, churchData, MissingResourceError, BUNDLED_SOURCE_FILES,
    DEFAULT_PANORAMA, PANORAMA_HFOV, DEFAULT_SOURCE_FILE, DEFAULT_ERROR_MESSAGE,
    DRY_GAIN_AT_FULL_WET, IR_CACHE_LIMIT, ctx,
};
`;

/** A fake AudioBuffer, enough for the code paths under test */
function fakeAudioBuffer(length = 4800, channels = 1, sampleRate = 48000) {
    const data = channels === 1 ? [new Float32Array(length)]
        : Array.from({ length: channels }, () => new Float32Array(length));
    return {
        length, sampleRate, numberOfChannels: channels,
        getChannelData: (ch) => data[ch],
    };
}

function createApp(options = {}) {
    // ── DOM ───────────────────────────────────────────────────────────────
    const elements = new Map();
    const makeElement = (id) => {
        const styleValues = {};
        return {
            id,
            disabled: false,
            textContent: '',
            innerHTML: '',
            innerText: '',
            value: id === 'convmix' ? '100' : '',
            classes: new Set(),
            style: {
                setProperty(name, value) { styleValues[name] = value; },
                getPropertyValue(name) { return styleValues[name]; },
            },
            classList: {
                add(c) { this._o.classes.add(c); },
                remove(c) { this._o.classes.delete(c); },
                contains(c) { return this._o.classes.has(c); },
                toggle(c, force) {
                    const on = force === undefined ? !this._o.classes.has(c) : force;
                    on ? this._o.classes.add(c) : this._o.classes.delete(c);
                    return on;
                },
            },
            appendChild(child) { (this.children ||= []).push(child); },
        };
    };
    const el = (id) => {
        if (!elements.has(id)) {
            const e = makeElement(id);
            e.classList._o = e;
            elements.set(id, e);
        }
        return elements.get(id);
    };

    const listeners = {};

    // ── timers (queued, never automatic, so tests control ordering) ───────
    const timerQueue = [];
    const timers = {
        queue: timerQueue,
        get pending() { return timerQueue.length; },
        /** Runs every queued callback, including any they queue in turn */
        flush() {
            let guard = 0;
            while (timerQueue.length && guard++ < 1000) timerQueue.shift().fn();
        },
    };

    // ── Web Audio ─────────────────────────────────────────────────────────
    const edges = [];
    const allNodes = [];
    let nodeSeq = 0;
    const makeNode = (kind, ctxLabel) => {
        const node = {
            kind, ctxLabel, nodeId: ++nodeSeq,
            buffer: null, loop: false, started: false, stopped: false,
            gain: {
                value: 1,
                _ramps: [],
                linearRampToValueAtTime(v, t) { this.value = v; this._ramps.push([v, t]); },
            },
            connect(dest, output = 0, input = 0) {
                edges.push({ from: node, to: dest, output, input });
                return dest;
            },
            disconnect(dest) { edges.push({ from: node, to: dest || null, disconnected: true }); },
            start() { node.started = true; },
            stop() {
                if (node.stopped) throw new Error('already stopped');
                node.stopped = true;
            },
        };
        allNodes.push(node);
        return node;
    };

    const makeContext = (label) => ({
        label,
        currentTime: 0,
        sampleRate: 48000,
        state: 'suspended',
        resumeCalls: 0,
        destination: makeNode('destination', label),
        createBufferSource: () => makeNode('source', label),
        createConvolver: () => makeNode('convolver', label),
        createGain: () => makeNode('gain', label),
        createChannelSplitter: (n) => Object.assign(makeNode('splitter', label), { outputs: n }),
        createChannelMerger: (n) => Object.assign(makeNode('merger', label), { inputs: n }),
        decodeAudioData: async () => fakeAudioBuffer(),
        async resume() { this.resumeCalls++; this.state = 'running'; },
        startRendering: async () => fakeAudioBuffer(9600, 2),
    });

    const contexts = [];
    function AudioContextStub() {
        const c = makeContext('live');
        contexts.push(c);
        return c;
    }
    function OfflineAudioContextStub(channels, length, sampleRate) {
        const c = makeContext('offline');
        Object.assign(c, { channels, length, sampleRate });
        contexts.push(c);
        return c;
    }

    // ── network ───────────────────────────────────────────────────────────
    const net = {
        log: [],
        /**
         * Overridable responder. The default answers from the real repository,
         * so path and filename-case mistakes show up as 404s the way they would
         * on a case-sensitive host.
         */
        respond(url, opts) {
            if (url === '/api/source-files') return { ok: false, status: 404 };
            const rel = decodeURIComponent(String(url).replace(/^\//, ''));
            const exists = fs.existsSync(path.join(ROOT, rel));
            return { ok: exists, status: exists ? 200 : 404 };
        },
    };

    const fetchStub = async (url, opts = {}) => {
        net.log.push({ url, method: opts.method || 'GET' });
        const res = await net.respond(url, opts);
        return {
            ok: res.ok,
            status: res.status,
            arrayBuffer: async () => res.body || new ArrayBuffer(64),
            json: async () => res.json ?? [],
        };
    };

    // ── pannellum ─────────────────────────────────────────────────────────
    const viewers = [];
    const pannellum = {
        viewer(container, config) {
            const v = {
                container, config,
                panorama: config.panorama,
                handlers: {},
                destroyed: false,
                aimed: null,
                on(event, fn) { (this.handlers[event] ||= []).push(fn); },
                emit(event, ...args) { (this.handlers[event] || []).forEach(fn => fn(...args)); },
                destroy() { this.destroyed = true; },
                lookAt(...args) { this.aimed = args; },
            };
            viewers.push(v);
            return v;
        },
    };

    // ── blobs / object urls ───────────────────────────────────────────────
    const blobs = [];
    function BlobStub(parts, opts) {
        const blob = { parts, type: opts && opts.type };
        blobs.push(blob);
        return blob;
    }
    const objectUrls = { created: [], revoked: [] };

    // ── sandbox ───────────────────────────────────────────────────────────
    const sandbox = {
        console,
        Math, JSON, Object, Array, Promise, Map, Set, Number, String, Error,
        ArrayBuffer, DataView, Float32Array, Uint8Array,
        AudioContext: AudioContextStub,
        OfflineAudioContext: OfflineAudioContextStub,
        Blob: BlobStub,
        URL: {
            createObjectURL(b) { const u = 'blob:' + objectUrls.created.length; objectUrls.created.push({ u, b }); return u; },
            revokeObjectURL(u) { objectUrls.revoked.push(u); },
        },
        Image: function () {
            const img = { onerror: null, onload: null };
            Object.defineProperty(img, 'src', {
                set(v) { img._src = v; probes.push(img); },
                get() { return img._src; },
            });
            return img;
        },
        fetch: fetchStub,
        setTimeout: (fn, ms) => { timerQueue.push({ fn, ms }); return timerQueue.length; },
        clearTimeout: () => { },
        location: { origin: 'http://localhost:8000' },
        getComputedStyle: () => ({ backgroundImage: options.backgroundImage ?? 'none' }),
        pannellum,
        document: {
            documentElement: el(':root'),
            body: el('body'),
            fullscreenElement: null,
            getElementById: el,
            querySelectorAll: (sel) => options.querySelectorAll ? options.querySelectorAll(sel) : [],
            createElement: (tag) => Object.assign(makeElement('<' + tag + '>'), {
                tag, clicked: 0, click() { this.clicked++; },
            }),
            addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
            exitFullscreen: () => { },
        },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const probes = [];

    vm.createContext(sandbox);

    const source = APP_FILES
        .map(f => fs.readFileSync(path.join(ROOT, 'Javascript', f), 'utf8'))
        .join('\n;\n');
    vm.runInContext(source + EPILOGUE, sandbox, { filename: 'app-bundle.js' });

    return {
        /** Every function the app declares */
        g: sandbox,
        /** Live read/write access to the app's module state */
        state: sandbox.__state,
        /** The app's constants, including ROOMS and churchData */
        data: sandbox.__consts,

        el,
        elements,
        listeners,
        viewers,
        get viewer() { return viewers[viewers.length - 1]; },
        contexts,
        get ctx() { return contexts[0]; },
        edges,
        nodes: allNodes,
        net,
        timers,
        probes,
        blobs,
        objectUrls,
        fakeAudioBuffer,

        /** Lets pending promise chains run to completion */
        async settle(turns = 6) {
            for (let i = 0; i < turns; i++) await new Promise(r => setImmediate(r));
        },

        /** Gives the engine a decoded source so playback can start */
        loadFakeSource(buffer = fakeAudioBuffer()) {
            sandbox.__state.sourceBuffer = buffer;
        },

        /** Connections recorded since the graph was last cleared */
        edgesFrom(node) { return edges.filter(e => e.from === node && !e.disconnected); },
        edgesTo(node) { return edges.filter(e => e.to === node && !e.disconnected); },
        clearEdges() { edges.length = 0; },
    };
}

module.exports = { createApp, fakeAudioBuffer, ROOT, APP_FILES };
