'use strict';
/** NetworkLog.js and server.js — seeing the requests the page makes */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { createApp, ROOT } = require('./helpers/harness.js');

/** A console that keeps what it is given, by level */
function recordingConsole() {
    const lines = { info: [], warn: [], error: [], log: [], table: [] };
    return {
        lines,
        info: (...a) => lines.info.push(a.join(' ')),
        warn: (...a) => lines.warn.push(a.join(' ')),
        error: (...a) => lines.error.push(a.join(' ')),
        log: (...a) => lines.log.push(a.join(' ')),
        table: (t) => lines.table.push(t),
    };
}

/**
 * Fetches through the app's fetch() and reads the body, as every call site in
 * the app does: a download is logged when its body has been read
 */
async function fetched(app, url, init) {
    const response = await app.g.fetch(url, init);
    if (response.ok) await response.arrayBuffer();
    return response;
}

/** An app with network logging on, and the console it writes to */
function logging(options = {}) {
    const out = recordingConsole();
    const app = createApp({ query: '?netlog', console: out, ...options });
    return { app, out, entries: () => app.data.netlogEntries };
}

// ── switching it on ───────────────────────────────────────────────────────

test('a plain visit logs nothing and leaves fetch alone', async () => {
    const out = recordingConsole();
    const app = createApp({ console: out });

    await app.g.impulseResponseExists('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-');

    assert.equal(app.data.netlogEntries.length, 0);
    assert.equal(out.lines.info.filter(l => l.startsWith('[net]')).length, 0, 'a visitor’s console stays quiet');
    assert.equal(app.state.netlogActive, false);
});

test('?netlog switches it on for the page load, and says so once', () => {
    const { app, out } = logging();
    assert.equal(app.state.netlogActive, true);
    assert.equal(out.lines.info.filter(l => /logging network requests/.test(l)).length, 1);
});

test('the flag is read as a whole name, in any case', () => {
    assert.equal(createApp({ query: '?NetLog', console: recordingConsole() }).state.netlogActive, true);
    assert.equal(createApp({ query: '?5&netlog=1', console: recordingConsole() }).state.netlogActive, true);
    assert.equal(createApp({ query: '?netlogs', console: recordingConsole() }).state.netlogActive, false);
});

test('netlog(true) starts it now and remembers it for the next visit', () => {
    const storage = {};
    const first = createApp({ storage, console: recordingConsole() });
    assert.equal(first.state.netlogActive, false);

    first.g.netlog(true);
    assert.equal(first.state.netlogActive, true);
    assert.equal(storage.netlog, '1');

    const next = createApp({ storage, console: recordingConsole() });
    assert.equal(next.state.netlogActive, true, 'remembered without the query');
});

test('netlog(false) forgets it, from the next load', () => {
    const storage = { netlog: '1' };
    const app = createApp({ storage, console: recordingConsole() });
    app.g.netlog(false);
    assert.equal('netlog' in storage, false);
    assert.equal(createApp({ storage, console: recordingConsole() }).state.netlogActive, false);
});

test('blocked storage costs the memory, not the logging', () => {
    const app = createApp({ storageFails: true, console: recordingConsole() });
    assert.equal(app.state.netlogActive, false, 'and reading it must not throw');
    assert.doesNotThrow(() => app.g.netlog(true));
    assert.equal(app.state.netlogActive, true);
});

test('switching it on twice wraps fetch once', async () => {
    const { app, entries } = logging();
    app.g.netlog(true);
    await fetched(app, 'Source Files/Clarinet.wav');
    assert.equal(entries().length, 1, 'a doubled wrapper would log every request twice');
});

// ── what fetch() reports ──────────────────────────────────────────────────

test('an app request is logged with its method, status and readable path', async () => {
    const { app, out, entries } = logging();
    await app.g.impulseResponseExists('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-');

    const [entry] = entries();
    assert.equal(entry.kind, 'probe', 'labelled for what it is');
    assert.equal(entry.method, 'HEAD', 'the availability probe is a HEAD, and the log should say so');
    assert.equal(entry.status, 200);
    assert.equal(entry.url, 'IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-1.wav');
    assert.ok(Number.isFinite(entry.ms));
    assert.ok(out.lines.info.some(l => /\[net\] probe 200 HEAD IR\/Cane Ridge/.test(l)));
});

test('a HEAD is logged as headers only, not as a download of the file', async () => {
    // The availability probe asks for the same -1.wav playback later fetches.
    // Logged with the file's size, the two read as the file downloaded twice.
    const { app, out, entries } = logging();
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200,
        headers: { get: (h) => (h === 'Content-Length' ? '720179' : null) },
    }));
    await logged('IR/x-1.wav', { method: 'HEAD' });

    assert.equal(entries().at(-1).bytes, 0, 'nothing but headers crossed the wire');
    assert.match(entries().at(-1).note, /headers only, file is 703\.3 KB/);
    assert.ok(out.lines.info.some(l => /HEAD IR\/x-1\.wav 0 B .*headers only/.test(l)));
});

test('a percent-encoded request is shown decoded, as the error banner shows it', async () => {
    const { app, entries } = logging();
    await fetched(app, '/Source%20Files/Sermon_Dr.%20William%20Barber.wav');
    assert.equal(entries()[0].url, '/Source Files/Sermon_Dr. William Barber.wav');
});

test('a request to this site is shown relative to it', async () => {
    const { app, entries } = logging();
    await app.g.fetch('http://localhost:8000/Source Files/Clarinet.wav');
    assert.equal(entries()[0].url, 'Source Files/Clarinet.wav');
});

test('a 404 is logged as a warning, not lost among the rest', async () => {
    const { app, out, entries } = logging();
    await app.g.impulseResponseExists('IR/Nowhere/missing-');

    assert.equal(entries()[0].status, 404);
    assert.equal(entries()[0].failed, true);
    assert.ok(out.lines.warn.some(l => /\[net\] probe 404 HEAD IR\/Nowhere\/missing-1\.wav/.test(l)));
});

test('a request that never got an answer is logged with why, and still fails for the caller', async () => {
    const { app, out, entries } = logging();
    app.net.respond = () => { throw new TypeError('Failed to fetch'); };

    assert.equal(await app.g.impulseResponseExists('IR/Anything/x-'), false,
        'the app has to see the same failure it would without the log');
    assert.equal(entries()[0].status, 'failed');
    assert.ok(out.lines.warn.some(l => /failed .*Failed to fetch/.test(l)));
});

test('the log only watches: playback works the same with it on', async () => {
    const { app, entries } = logging();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R1-', 0, '');

    await app.g.playpause();

    assert.equal(app.state.isPlaying, true);
    const urls = entries().map(e => e.url);
    assert.ok(urls.some(u => u.endsWith('MIC_IN_R1-1.wav')));
    assert.ok(urls.some(u => u.endsWith('MIC_IN_R1-2.wav')));
});

test('the size comes from Content-Length where the server sends one', async () => {
    const { app, entries } = logging();
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200,
        headers: { get: (h) => (h === 'Content-Length' ? '1468006' : null) },
    }));
    await logged('IR/x-1.wav');
    assert.equal(entries().at(-1).bytes, 1468006);
});

/** A clock the test moves by hand, and the Resource Timing entries it chooses */
function fakePerformance(timings = []) {
    const perf = {
        t: 0,
        now: () => perf.t,
        getEntriesByName: (name) => timings.filter(e => e.name === name),
    };
    return perf;
}

test('a download is timed to its last byte, with its first response beside it', async () => {
    // fetch() resolves on the headers; a 2.7 MB B-format is still on its way
    const perf = fakePerformance();
    const { app, out, entries } = logging({ performance: perf });
    const logged = app.g.wrapFetchForLog(async () => {
        perf.t = 40;
        return {
            ok: true, status: 200,
            headers: { get: (h) => (h === 'Content-Length' ? '2831155' : null) },
            arrayBuffer: async () => { perf.t = 640; return { byteLength: 2831155 }; },
        };
    });

    const response = await logged('IR/x/Not Normalized/x_R3-Bformat.wav');
    assert.equal(entries().length, 0, 'nothing yet: timed now, it would read as 40 ms');

    await response.arrayBuffer();
    const entry = entries().at(-1);
    assert.equal(entry.ms, 640);
    assert.match(entry.note, /first response 40 ms/);
    assert.ok(out.lines.info.some(l => /\[net\] bformat 200 GET .*Bformat\.wav 2\.7 MB 640 ms — first response 40 ms/.test(l)));

    await response.arrayBuffer();
    assert.equal(entries().length, 1, 'a body read twice is still one request');
});

test('without a Content-Length, the size is the body that arrived', async () => {
    const { app, entries } = logging();
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200, headers: { get: () => null },
        arrayBuffer: async () => ({ byteLength: 1234 }),
    }));
    await (await logged('Source Files/x.wav')).arrayBuffer();
    assert.equal(entries().at(-1).bytes, 1234);
});

test('a download that breaks off is a warning with why, and still fails for the caller', async () => {
    const { app, out, entries } = logging();
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200, headers: { get: () => null },
        arrayBuffer: async () => { throw new TypeError('network error'); },
    }));
    const response = await logged('IR/x-1.wav');
    await assert.rejects(response.arrayBuffer(), /network error/, 'the caller sees the failure it would without the log');

    const entry = entries().at(-1);
    assert.equal(entry.failed, true);
    assert.match(entry.note, /body failed: network error/);
    assert.ok(out.lines.warn.some(l => /\[net\] ir 200 GET IR\/x-1\.wav .*body failed/.test(l)));
});

test('a failed download is logged at once, since nobody reads its body', async () => {
    // loadAudioBuffer throws on the status without reading; waiting for a body
    // would lose the one line that explains the error banner
    const { app, out, entries } = logging();
    await app.g.fetch('Source Files/Nowhere.wav');

    assert.equal(entries().length, 1);
    assert.equal(entries()[0].status, 404);
    assert.ok(out.lines.warn.some(l => /\[net\] source 404 GET Source Files\/Nowhere\.wav/.test(l)));
});

test('each app request is labelled for what it is', () => {
    const { app } = logging();
    const kind = app.g.netlogKind;
    assert.equal(kind('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-1.wav', 'GET'), 'ir');
    assert.equal(kind('IR/Cane Ridge Meeting House, KY/Not Normalized/Cane Ridge KY_R1-Bformat.wav', 'GET'), 'bformat');
    assert.equal(kind('/Source Files/Clarinet.wav', 'GET'), 'source');
    assert.equal(kind('/api/source-files', 'GET'), 'api');
    assert.equal(kind('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-1.wav', 'HEAD'), 'probe',
        'a HEAD is the availability check, whatever file it names');
    assert.equal(kind('https://example.com/elsewhere.wav', 'GET'), 'fetch', 'anything else is not guessed at');
});

test('a download the browser served from its cache says so', async () => {
    const perf = fakePerformance([{
        name: 'http://localhost:8000/IR/x/Not%20Normalized/x_R1-Bformat.wav',
        initiatorType: 'fetch', transferSize: 0, decodedBodySize: 2831155,
    }]);
    const { app, out, entries } = logging({ performance: perf });
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200, headers: { get: () => null },
        arrayBuffer: async () => ({ byteLength: 2831155 }),
    }));
    await (await logged('IR/x/Not Normalized/x_R1-Bformat.wav')).arrayBuffer();

    const entry = entries().at(-1);
    assert.match(entry.note, /from cache/);
    assert.equal(entry.bytes, 2831155, 'the size of the file, not the zero that crossed the wire');
    assert.ok(out.lines.info.some(l => /bformat 200 GET .*from cache/.test(l)));
});

test('a download that crossed the network is not called cached', async () => {
    const perf = fakePerformance([{
        name: 'http://localhost:8000/IR/x/Not%20Normalized/x_R1-Bformat.wav',
        initiatorType: 'fetch', transferSize: 2831455, decodedBodySize: 2831155,
    }]);
    const { app, entries } = logging({ performance: perf });
    const logged = app.g.wrapFetchForLog(async () => ({
        ok: true, status: 200, headers: { get: () => null },
        arrayBuffer: async () => ({ byteLength: 2831155 }),
    }));
    await (await logged('IR/x/Not Normalized/x_R1-Bformat.wav')).arrayBuffer();
    assert.doesNotMatch(entries().at(-1).note, /from cache/);
});

// ── what the page loads by other means ────────────────────────────────────

/** A PerformanceObserver that hands over whatever resources the test queues */
function fakeObserverClass() {
    const observers = [];
    function FakeObserver(callback) {
        this.callback = callback;
        observers.push(this);
    }
    FakeObserver.prototype.observe = function (options) { this.options = options; };
    FakeObserver.deliver = (resources) =>
        observers.forEach(o => o.callback({ getEntries: () => resources }));
    FakeObserver.observers = observers;
    return FakeObserver;
}

test('panoramas, tiles and scripts are logged through Resource Timing', () => {
    const Observer = fakeObserverClass();
    const { entries } = logging({ PerformanceObserver: Observer });

    assert.equal(Observer.observers[0].options.type, 'resource');
    assert.equal(Observer.observers[0].options.buffered, true, 'or the scripts that loaded first are missed');

    Observer.deliver([
        { name: 'http://localhost:8000/Images/Cane%20Ridge%20Meeting%20House,%20KY/Cane%20Ridge%20Meeting%20House,%20KY_R1.jpg',
          initiatorType: 'img', transferSize: 2400000, decodedBodySize: 2400000, duration: 310, responseStatus: 200 },
        { name: 'https://tile.openstreetmap.org/4/3/6.png',
          initiatorType: 'img', transferSize: 18000, decodedBodySize: 18000, duration: 45 },
    ]);

    const [pano, tile] = entries();
    assert.equal(pano.kind, 'img');
    assert.equal(pano.url, 'Images/Cane Ridge Meeting House, KY/Cane Ridge Meeting House, KY_R1.jpg');
    assert.equal(pano.status, 200);
    assert.equal(tile.url, 'https://tile.openstreetmap.org/4/3/6.png', 'other sites keep their full address');
    assert.equal(tile.status, undefined, 'a browser that does not report status is not guessed at');
});

test('fetches are not logged twice', () => {
    const Observer = fakeObserverClass();
    const { entries } = logging({ PerformanceObserver: Observer });
    Observer.deliver([{ name: 'http://localhost:8000/IR/x-1.wav', initiatorType: 'fetch',
        transferSize: 10, decodedBodySize: 10, duration: 5 }]);
    assert.equal(entries().length, 0, 'the fetch wrapper already reported it, with more');
});

test('a file served from the browser cache says so', () => {
    const Observer = fakeObserverClass();
    const { entries, out } = logging({ PerformanceObserver: Observer });
    Observer.deliver([{ name: 'http://localhost:8000/Images/default.jpg', initiatorType: 'img',
        transferSize: 0, decodedBodySize: 512000, duration: 2 }]);

    assert.equal(entries()[0].note, 'from cache');
    assert.equal(entries()[0].bytes, 512000, 'the size of the file, not the zero that crossed the wire');
    assert.ok(out.lines.info.some(l => /from cache/.test(l)));
});

test('a resource the browser reports as missing is a warning', () => {
    const Observer = fakeObserverClass();
    const { out } = logging({ PerformanceObserver: Observer });
    Observer.deliver([{ name: 'http://localhost:8000/Images/Gone.jpg', initiatorType: 'img',
        transferSize: 300, decodedBodySize: 300, duration: 8, responseStatus: 404 }]);
    assert.ok(out.lines.warn.some(l => /img 404 .*Images\/Gone\.jpg/.test(l)));
});

test('a browser without Resource Timing still logs fetches', async () => {
    const { app, entries } = logging();          // the harness has no PerformanceObserver
    await fetched(app, 'Source Files/Clarinet.wav');
    assert.equal(entries().length, 1);
});

// ── the session as a whole ────────────────────────────────────────────────

test('netlogSummary totals the session by kind', async () => {
    const Observer = fakeObserverClass();
    const { app, out } = logging({ PerformanceObserver: Observer });
    await fetched(app, 'Source Files/Clarinet.wav');
    await fetched(app, 'Source Files/Nowhere.wav');
    await fetched(app, 'IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R1-1.wav');
    Observer.deliver([{ name: 'http://localhost:8000/a.jpg', initiatorType: 'img',
        transferSize: 2048, decodedBodySize: 2048, duration: 10 }]);

    const table = app.g.netlogSummary();
    assert.equal(table.source.requests, 2, 'split by what was asked for, not lumped as fetch');
    assert.equal(table.source.failed, 1);
    assert.equal(table.ir.requests, 1);
    assert.equal(table.img.requests, 1);
    assert.equal(table.img.size, '2.0 KB');
    assert.equal(out.lines.table.length, 1, 'shown as a table');
});

test('the session list is capped, oldest first out', async () => {
    const { app, entries } = logging();
    for (let i = 0; i < app.data.NETLOG_MAX_ENTRIES + 5; i++) {
        app.g.netlogRecord({ kind: 'img', url: `n${i}`, bytes: 1, ms: 1 });
    }
    assert.equal(entries().length, app.data.NETLOG_MAX_ENTRIES);
    assert.equal(entries()[0].url, 'n5');
});

// ── the dev server ────────────────────────────────────────────────────────

/** A port nothing is listening on */
function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer().listen(0, () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        }).on('error', reject);
    });
}

/** Runs server.js, makes the requests, and returns everything it printed */
async function serverLog(requests, env = {}) {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
        cwd: ROOT, env: { ...process.env, PORT: String(port), ...env },
    });

    let output = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('server did not start:\n' + output)), 10000);
            child.stdout.on('data', () => { if (/Server running/.test(output)) { clearTimeout(timer); resolve(); } });
            child.on('exit', code => reject(new Error(`server exited (${code}):\n${output}`)));
        });

        for (const [method, url, headers = {}] of requests) {
            const res = await fetch(`http://localhost:${port}${url}`, { method, headers, redirect: 'manual' });
            await res.arrayBuffer().catch(() => {});
        }
        await new Promise(r => setTimeout(r, 100));   // let the last line flush
        return output;
    } finally {
        child.kill();
    }
}

test('the dev server logs each request with its status, path, size and time', async () => {
    const output = await serverLog([
        ['GET', '/Source%20Files/Clarinet.wav'],
        ['HEAD', '/IR/Nowhere/missing-1.wav'],
        ['HEAD', '/Source%20Files/Clarinet.wav'],
        ['GET', '/index.html'],
    ]);

    assert.match(output, /HEAD 200 {2}\/Source Files\/Clarinet\.wav {2}headers only \(file [\d.]+ (KB|MB)\)/,
        'a HEAD must not read as the file being downloaded');

    assert.match(output, /\d\d:\d\d:\d\d\.\d{3} {2}GET 200 {2}\/Source Files\/Clarinet\.wav {2}[\d.]+ (KB|MB) {2}\d+ ms/,
        'paths decoded, sizes readable');
    assert.match(output, /HEAD 404 {2}\/IR\/Nowhere\/missing-1\.wav .*<-- not found/, 'misses stand out');
    assert.match(output, /GET 301 {2}\/index\.html/, 'redirects are logged too');
});

test('the dev server says when the browser kept its cached copy, and names each error', async () => {
    const output = await serverLog([
        // A cached copy the server accepts as current: answered 304, with no
        // body. Cache-Control as a browser revalidating sends it; without it,
        // fetch() adds no-cache and the server never considers a 304.
        ['GET', '/Source%20Files/Clarinet.wav', { 'If-None-Match': '*', 'Cache-Control': 'max-age=0' }],
        // A range past the end of the file: 416, which is not a missing file
        ['GET', '/Source%20Files/Clarinet.wav', { Range: 'bytes=999999999-' }],
    ]);

    assert.match(output, /GET 304 {2}\/Source Files\/Clarinet\.wav {2}not modified \(cached\)/,
        'a 304 is the browser reusing its copy, not an empty download');
    assert.match(output, /GET 416 {2}\/Source Files\/Clarinet\.wav .*<-- range not satisfiable/);
    assert.doesNotMatch(output, /416 .*not found/, 'only a 404 is a missing file');
});

test('LOG_REQUESTS=0 keeps the dev server quiet', async () => {
    const output = await serverLog([['GET', '/Source%20Files/Clarinet.wav']], { LOG_REQUESTS: '0' });
    assert.doesNotMatch(output, /GET 200/);
});
