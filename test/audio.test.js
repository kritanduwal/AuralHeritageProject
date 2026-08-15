'use strict';
/** AudioEngine.js — the mix law, the convolution graph, loading and playback */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

const close = (actual, expected, tolerance = 1e-9, msg) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        msg || `expected ${actual} to be within ${tolerance} of ${expected}`);

/** Builds a graph in a fresh app and returns the pieces tests reason about */
function buildGraph(app, { mix = 1, irGainDb = 0 } = {}) {
    const ctx = app.ctx;
    const src = ctx.createBufferSource();
    app.clearEdges();
    const graph = app.g.buildConvolutionGraph(ctx, src, {
        irLeft: app.fakeAudioBuffer(),
        irRight: app.fakeAudioBuffer(),
        mix, irGainDb,
    });
    const kinds = (k) => app.nodes.filter(n => n.kind === k);
    const splitter = kinds('splitter').at(-1);
    // The trim is whatever feeds the splitter
    const irTrim = app.edgesTo(splitter)[0]?.from ?? null;
    return { ctx, src, graph, splitter, irTrim, merger: graph.output, convolvers: kinds('convolver').slice(-2) };
}

// ── the mix law ───────────────────────────────────────────────────────────

test('dryGainFor holds at unity through the first 10% of the slider', () => {
    const { dryGainFor } = createApp().g;
    assert.equal(dryGainFor(0), 1);
    assert.equal(dryGainFor(0.05), 1);
    assert.equal(dryGainFor(0.1), 1);
});

test('dryGainFor lands on the documented -9.1 dB at a fully wet mix', () => {
    const app = createApp();
    close(app.g.dryGainFor(1), app.data.DRY_GAIN_AT_FULL_WET);
    close(20 * Math.log10(app.g.dryGainFor(1)), -9.119, 1e-3);
});

test('dryGainFor falls linearly in dB from 10% to 100%', () => {
    const { dryGainFor } = createApp().g;
    // Equal slider steps should give equal dB steps once past the flat region
    const db = (m) => 20 * Math.log10(dryGainFor(m));
    const steps = [];
    for (let p = 10; p < 100; p += 10) steps.push(db((p + 10) / 100) - db(p / 100));
    for (const s of steps) close(s, steps[0], 1e-9, 'dry taper is not linear in dB');
});

test('dryGainFor never exceeds unity and only decreases', () => {
    const { dryGainFor } = createApp().g;
    let previous = Infinity;
    for (let p = 0; p <= 100; p++) {
        const g = dryGainFor(p / 100);
        assert.ok(g <= 1, `dry gain ${g} exceeds unity at ${p}%`);
        assert.ok(g <= previous, `dry gain rose at ${p}%`);
        previous = g;
    }
});

test('the documented slider table is what the code actually produces', () => {
    const { dryGainFor } = createApp().g;
    // slider %, wet gain, dry gain — as published in README.md
    const table = [[0, 0, 1.000], [10, 0.1, 1.000], [20, 0.2, 0.890], [50, 0.5, 0.627],
                   [60, 0.6, 0.558], [100, 1.0, 0.350]];
    for (const [percent, wet, dry] of table) {
        assert.equal(percent / 100, wet, `wet gain should track the slider at ${percent}%`);
        close(dryGainFor(percent / 100), dry, 5e-4, `dry gain at ${percent}%`);
    }
});

test('reverb overtakes the direct sound just under 60% on the slider', () => {
    const { dryGainFor } = createApp().g;
    assert.ok(0.5 < dryGainFor(0.5), 'at 50% the dry path should still lead');
    assert.ok(0.6 > dryGainFor(0.6), 'by 60% the wet path should lead');
});

test('reductionToGain converts a dB reduction to linear attenuation', () => {
    const { reductionToGain } = createApp().g;
    close(reductionToGain(0), 1);
    close(reductionToGain(6), 0.5011872336, 1e-9);
    close(reductionToGain(20), 0.1, 1e-12);
    assert.ok(reductionToGain(4.5) < reductionToGain(3), 'a bigger reduction must be quieter');
});

// ── graph wiring ──────────────────────────────────────────────────────────

test('the dry path reaches both output channels', () => {
    const app = createApp();
    const { graph, src, merger } = buildGraph(app);

    assert.ok(app.edgesFrom(src).some(e => e.to === graph.dryGain), 'source does not feed dryGain');
    const dryOut = app.edgesFrom(graph.dryGain).filter(e => e.to === merger);
    assert.deepEqual(dryOut.map(e => e.input).sort(), [0, 1], 'dry must land on both L and R');
});

test('each convolver feeds its own ear', () => {
    const app = createApp();
    const { graph, merger, convolvers, splitter } = buildGraph(app);

    assert.equal(convolvers.length, 2);
    for (const c of convolvers) assert.ok(app.edgesTo(c).some(e => e.from === splitter));

    const left = app.edgesFrom(graph.wetGainLeft).find(e => e.to === merger);
    const right = app.edgesFrom(graph.wetGainRight).find(e => e.to === merger);
    assert.equal(left.input, 0, 'wet left must land on output channel 0');
    assert.equal(right.input, 1, 'wet right must land on output channel 1');
});

test('the splitter keeps a single channel so stereo sources convolve as mono', () => {
    const app = createApp();
    const { splitter } = buildGraph(app);
    assert.equal(splitter.outputs, 1);
});

test('the graph terminates at the context destination', () => {
    const app = createApp();
    const { merger, ctx } = buildGraph(app);
    assert.ok(app.edgesFrom(merger).some(e => e.to === ctx.destination));
});

test('wet gains follow the mix and dry gain follows the taper', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { mix: 0.4 });
    assert.equal(graph.wetGainLeft.gain.value, 0.4);
    assert.equal(graph.wetGainRight.gain.value, 0.4);
    close(graph.dryGain.gain.value, app.g.dryGainFor(0.4));
});

// ── the per-position trim ─────────────────────────────────────────────────

test('the gain trim sits before the convolvers, where normalization cannot undo it', () => {
    // A ConvolverNode re-normalizes its buffer on assignment, so a trim baked
    // into the IR samples would be scaled straight back out. It has to be a node.
    const app = createApp();
    const { irTrim, splitter, src, convolvers } = buildGraph(app, { irGainDb: 6 });

    assert.ok(irTrim, 'nothing feeds the splitter');
    assert.equal(irTrim.kind, 'gain', 'the splitter should be fed by a gain node');
    close(irTrim.gain.value, app.g.reductionToGain(6));

    assert.ok(app.edgesFrom(src).some(e => e.to === irTrim), 'trim must tap the source');
    assert.ok(app.edgesFrom(irTrim).some(e => e.to === splitter), 'trim must feed the splitter');
    for (const c of convolvers) {
        assert.equal(c.buffer.length, app.fakeAudioBuffer().length,
            'the impulse response itself must be handed over unscaled');
    }
});

test('the gain trim leaves the direct sound at full level', () => {
    const app = createApp();
    const plain = buildGraph(app, { mix: 1, irGainDb: 0 });
    const dryPlain = plain.graph.dryGain.gain.value;

    const trimmed = buildGraph(app, { mix: 1, irGainDb: 6 });
    assert.equal(trimmed.graph.dryGain.gain.value, dryPlain,
        'a per-position reverb trim must not touch the dry path');
});

test('a larger trim attenuates more', () => {
    const app = createApp();
    const light = buildGraph(app, { irGainDb: 1 }).irTrim.gain.value;
    const heavy = buildGraph(app, { irGainDb: 6 }).irTrim.gain.value;
    assert.ok(heavy < light);
    close(buildGraph(app, { irGainDb: 0 }).irTrim.gain.value, 1);
});

// ── live retuning ─────────────────────────────────────────────────────────

test('setConvolutionMix ramps the live graph instead of rebuilding it', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    const nodesBefore = app.nodes.length;

    app.g.setConvolutionMix(0.25);
    assert.equal(graph.wetGainLeft.gain.value, 0.25);
    assert.equal(graph.wetGainRight.gain.value, 0.25);
    close(graph.dryGain.gain.value, app.g.dryGainFor(0.25));
    assert.equal(app.state.activeGraph, graph, 'the graph should be retuned, not replaced');
    assert.equal(app.nodes.length, nodesBefore, 'no new nodes should be created');
});

test('setConvolutionMix glides rather than jumping', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);
    await app.g.startPlayback();

    app.g.setConvolutionMix(0.5);
    const [, when] = app.state.activeGraph.wetGainLeft.gain._ramps.at(-1);
    assert.ok(when > app.ctx.currentTime, 'the ramp should end in the future');
    assert.ok(when - app.ctx.currentTime <= 0.1, 'the ramp should be short enough to feel immediate');
});

test('setConvolutionMix is remembered while stopped and applied on the next play', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);

    app.g.setConvolutionMix(0.3);                    // nothing is playing yet
    assert.equal(app.state.activeGraph, null);

    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.wetGainLeft.gain.value, 0.3);
});

// ── loading and caching ───────────────────────────────────────────────────

test('an impulse response is fetched once and then served from cache', async () => {
    const app = createApp();
    const url = 'IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-1.wav';

    const a = await app.g.loadImpulseResponse(url);
    const b = await app.g.loadImpulseResponse(url);

    assert.equal(a, b, 'the same buffer should come back');
    assert.equal(app.net.log.filter(r => r.url === url).length, 1, 'it should only be downloaded once');
});

test('two plays started at once share a single download', async () => {
    const app = createApp();
    const url = 'IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R2-1.wav';

    const [a, b] = await Promise.all([app.g.loadImpulseResponse(url), app.g.loadImpulseResponse(url)]);
    assert.equal(a, b);
    assert.equal(app.net.log.filter(r => r.url === url).length, 1);
});

test('a failed load is not cached, so a later attempt can retry', async () => {
    const app = createApp();
    const url = 'IR/Nowhere/missing-1.wav';

    await assert.rejects(() => app.g.loadImpulseResponse(url));
    await assert.rejects(() => app.g.loadImpulseResponse(url));
    assert.equal(app.net.log.filter(r => r.url === url).length, 2, 'the failure should not be replayed from cache');
});

test('a failed load reports the URL and status it failed on', async () => {
    const app = createApp();
    await assert.rejects(
        () => app.g.loadImpulseResponse('IR/Nowhere/missing-1.wav'),
        (err) => {
            assert.equal(err.name, 'MissingResourceError');
            assert.equal(err.url, 'IR/Nowhere/missing-1.wav');
            assert.equal(err.status, 404);
            return true;
        }
    );
});

test('the cache is bounded, dropping the least recently used entry', async () => {
    const app = createApp();
    const limit = app.data.IR_CACHE_LIMIT;
    const url = (n) => `IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R${n}-1.wav`;

    // Fill past the cap; R1 is the oldest and should fall out
    for (let n = 1; n <= limit + 1; n++) await app.g.loadImpulseResponse(url(n % 9 + 1));

    const before = app.net.log.length;
    await app.g.loadImpulseResponse(url(2));
    assert.ok(app.net.log.length > before, 'an evicted entry should be fetched again');
});

test('impulseResponseExists probes with HEAD rather than downloading audio', async () => {
    const app = createApp();
    const base = 'IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-';

    assert.equal(await app.g.impulseResponseExists(base), true);
    assert.deepEqual(app.net.log, [{ url: base + '1.wav', method: 'HEAD' }]);
});

test('impulseResponseExists reports a missing recording without throwing', async () => {
    const app = createApp();
    assert.equal(await app.g.impulseResponseExists('IR/Nowhere/missing-'), false);
    assert.match(app.el('error-message').textContent, /impulse response could not be retrieved \(404\)/);
    assert.equal(app.el('error-resource').textContent, 'IR/Nowhere/missing-1.wav');
});

test('impulseResponseExists survives a network error', async () => {
    const app = createApp();
    app.net.respond = () => { throw new Error('offline'); };
    assert.equal(await app.g.impulseResponseExists('IR/Anything/x-'), false);
    assert.match(app.el('error-message').textContent, /could not be loaded/);
});

// ── playback lifecycle ────────────────────────────────────────────────────

async function readyToPlay(app, gainDb = 0) {
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', gainDb);
    return app;
}

test('play starts a looping source and shows the pause icon', async () => {
    const app = await readyToPlay(createApp());
    await app.g.playpause();

    assert.equal(app.state.isPlaying, true);
    assert.equal(app.state.source.started, true);
    assert.equal(app.state.source.loop, true, 'the source should loop');
    assert.equal(app.el('play').textContent, 'pause_circle_filled');
    assert.ok(app.el('play').classList.contains('playing'));
});

test('play resumes a context that was created before any user gesture', async () => {
    const app = await readyToPlay(createApp());
    assert.equal(app.ctx.state, 'suspended');
    await app.g.playpause();
    assert.equal(app.ctx.state, 'running');
});

test('pause stops the source and releases the graph', async () => {
    const app = await readyToPlay(createApp());
    await app.g.playpause();
    const source = app.state.source;
    const merger = app.state.activeGraph.output;

    await app.g.playpause();

    assert.equal(app.state.isPlaying, false);
    assert.equal(app.state.source, null);
    assert.equal(app.state.activeGraph, null, 'the graph reference should be dropped');
    assert.equal(source.stopped, true);
    assert.ok(app.edges.some(e => e.from === merger && e.disconnected),
        'the merger must be unhooked or every past graph stays pinned to the destination');
    assert.equal(app.el('play').textContent, 'play_circle_filled');
});

test('a second play never leaves two graphs feeding the destination', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();
    const first = app.state.activeGraph;

    await app.g.startPlayback();   // as an overlapping receiver switch would
    const second = app.state.activeGraph;

    assert.notEqual(first, second);
    assert.ok(app.edges.some(e => e.from === first.output && e.disconnected),
        'the earlier graph should have been torn down');
    assert.equal(app.state.isPlaying, true);
});

test('the selected position’s trim is carried into the graph', async () => {
    const app = await readyToPlay(createApp(), 4.5);
    await app.g.startPlayback();

    const splitter = app.nodes.filter(n => n.kind === 'splitter').at(-1);
    const trim = app.edgesTo(splitter)[0].from;
    close(trim.gain.value, app.g.reductionToGain(4.5));
});

test('play refuses to start before a source file has decoded', async () => {
    const app = createApp();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);

    await app.g.playpause();

    assert.equal(app.state.isPlaying, false);
    assert.match(app.el('error-message').textContent, /source file has not finished loading/);
});

test('play reports a missing impulse response and disables the button', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Nowhere/missing-', 0);

    await app.g.playpause();

    assert.equal(app.state.isPlaying, false);
    assert.equal(app.el('play').disabled, true);
    assert.match(app.el('error-message').textContent, /impulse response/);
});

test('pausing when nothing is playing is harmless', async () => {
    const app = createApp();
    await app.g.playpause();          // nothing loaded
    assert.equal(app.state.isPlaying, false);
});

// ── source files ──────────────────────────────────────────────────────────

test('setSourceFromUrl decodes a fetched file into the playback source', async () => {
    const app = createApp();
    await app.g.setSourceFromUrl('Source Files/Clarinet.wav');
    assert.ok(app.state.sourceBuffer, 'nothing was decoded');
});

test('loadSource reports a failure in the view rather than only the console', async () => {
    const app = createApp();
    app.net.respond = () => ({ ok: false, status: 500 });
    await app.g.loadSource();
    assert.match(app.el('error-message').textContent, /source file could not be retrieved \(500\)/);
    assert.equal(app.el('error-resource').textContent, app.data.DEFAULT_SOURCE_FILE);
});

test('the startup source file is one that actually ships', () => {
    const fs = require('fs'), path = require('path');
    const { ROOT } = require('./helpers/harness.js');
    const app = createApp();
    assert.ok(fs.existsSync(path.join(ROOT, app.data.DEFAULT_SOURCE_FILE)));
});

// ── WAV encoding ──────────────────────────────────────────────────────────

test('audioBufferToWav writes a valid 16-bit PCM header', () => {
    const app = createApp();
    const buffer = app.fakeAudioBuffer(100, 2, 48000);
    app.g.audioBufferToWav(buffer);

    const bytes = new DataView(app.blobs.at(-1).parts[0]);
    const str = (o, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => bytes.getUint8(o + i)));

    assert.equal(str(0, 4), 'RIFF');
    assert.equal(str(8, 4), 'WAVE');
    assert.equal(str(12, 4), 'fmt ');
    assert.equal(bytes.getUint16(20, true), 1, 'format should be PCM');
    assert.equal(bytes.getUint16(22, true), 2, 'channel count');
    assert.equal(bytes.getUint32(24, true), 48000, 'sample rate');
    assert.equal(bytes.getUint16(34, true), 16, 'bit depth');
    assert.equal(str(36, 4), 'data');
    assert.equal(bytes.getUint32(40, true), 100 * 2 * 2, 'data chunk size');
    assert.equal(app.blobs.at(-1).type, 'audio/wav');
});

test('audioBufferToWav clamps samples instead of wrapping them', () => {
    const app = createApp();
    const buffer = app.fakeAudioBuffer(3, 1);
    buffer.getChannelData(0).set([2.0, -2.0, 0]);
    app.g.audioBufferToWav(buffer);

    const bytes = new DataView(app.blobs.at(-1).parts[0]);
    assert.equal(bytes.getInt16(44, true), 32767, 'over-full-scale should clamp to +max');
    assert.equal(bytes.getInt16(46, true), -32768, 'under-full-scale should clamp to -max');
});

test('the offline render leaves room for the reverb tail', async () => {
    const app = await readyToPlay(createApp());
    await app.g.downloadConvolvedAudio();

    const offline = app.contexts.find(c => c.label === 'offline');
    assert.ok(offline, 'no offline render happened');
    assert.ok(offline.length > app.state.sourceBuffer.length,
        'the render must outlast the source or the tail is cut off');
    assert.equal(offline.channels, 2);
});

test('the offline render releases its object URL only after the download starts', async () => {
    const app = await readyToPlay(createApp());
    await app.g.downloadConvolvedAudio();

    assert.equal(app.objectUrls.created.length, 1);
    assert.equal(app.objectUrls.revoked.length, 0, 'revoking immediately can cancel the download');
    app.timers.flush();
    assert.equal(app.objectUrls.revoked.length, 1);
});
