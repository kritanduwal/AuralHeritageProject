'use strict';
/** AudioEngine.js — the mix law, the convolution graph, loading and playback */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

const close = (actual, expected, tolerance = 1e-9, msg) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        msg || `expected ${actual} to be within ${tolerance} of ${expected}`);

/**
 * Builds a graph in a fresh app and returns the pieces tests reason about.
 *
 * `withBformat` decides whether the church has un-normalized originals to
 * decode, which is what makes the headphone stage exist at all.
 */
function buildGraph(app, { mix = 1, irGainDb = 0, ambisonic = false,
                           withBformat = ambisonic } = {}) {
    const ctx = app.ctx;
    const src = ctx.createBufferSource();

    // Built before the snapshot below so its own nodes are not counted as the
    // graph's; the renderer belongs to the context, not to any one graph.
    const renderer = withBformat
        ? app.g.Omnitone.createFOARenderer(ctx, { channelMap: app.data.AMBIX_CHANNEL_MAP })
        : null;

    app.clearEdges();
    // Nodes accumulate across builds in one app, so identify this build's own by
    // where the list stood before it. Counting back from the end instead would
    // shift every time a stage was added.
    const first = app.nodes.length;
    const graph = app.g.buildConvolutionGraph(ctx, src, {
        irLeft: app.fakeAudioBuffer(),
        irRight: app.fakeAudioBuffer(),
        bformatChannels: withBformat
            ? Array.from({ length: app.data.AMBISONIC_CHANNELS }, () => app.fakeAudioBuffer())
            : null,
        ambisonicRenderer: renderer,
        mix, irGainDb, ambisonic,
    });

    const made = app.nodes.slice(first);
    const kinds = (k) => made.filter(n => n.kind === k);
    const splitter = kinds('splitter')[0];
    // The trim is whatever feeds the splitter
    const irTrim = app.edgesTo(splitter)[0]?.from ?? null;

    // Stages build in order: stereo first, then the headphone decode. The IR
    // pair comes first among the convolvers; the four B-format ones follow.
    const convolvers = kinds('convolver');

    return {
        ctx, src, graph, splitter, irTrim, renderer,
        merger: kinds('merger')[0],
        ambiMerger: graph.ambiMerger,
        convolvers: convolvers.slice(0, 2),
        ambiConvolvers: withBformat ? convolvers.slice(2, 6) : [],
    };
}

/** Every distinct route from one node to another, as a count */
function pathCount(app, from, to) {
    if (from === to) return 1;
    return app.edgesFrom(from).reduce((n, e) => n + pathCount(app, e.to, to), 0);
}

/** The three automation calls one glide should leave on a gain parameter */
function glideOn(param) {
    const [cancel, anchor, ramp] = param._events.slice(-3);
    return { cancel, anchor, ramp };
}

/**
 * Asserts a gain change is drawn from the present rather than from whatever
 * event happens to be last on the timeline.
 *
 * A linear ramp interpolates from the previous event, so one left over from a
 * change seconds ago puts almost the entire glide in the past: the parameter
 * covers nearly all the distance in its first sample, which is heard as a
 * click. Cancelling and pinning the current value gives it a start in the now.
 */
function assertAnchored(param, now, seconds, what) {
    const { cancel, anchor, ramp } = glideOn(param);
    assert.equal(cancel[0], 'cancel', `${what}: stale automation must be cleared first`);
    assert.equal(cancel[1], now, `${what}: cleared from the present`);
    assert.equal(anchor[0], 'set', `${what}: the ramp needs a start point to draw from`);
    assert.equal(anchor[2], now, `${what}: that start point must be the present`);
    assert.equal(ramp[0], 'ramp', `${what}: the change itself must glide`);
    assert.equal(ramp[2], now + seconds, `${what}: and land one glide from now`);
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

test('the dry path reaches both output channels, so it stays centred', () => {
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
    const { graph, ctx } = buildGraph(app);
    assert.ok(app.edgesFrom(graph.output).some(e => e.to === ctx.destination));
});

test('the stereo stage terminates at its own fader', () => {
    const app = createApp();
    const { graph, merger } = buildGraph(app);
    assert.ok(app.edgesFrom(merger).some(e => e.to === graph.stereoOut));
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
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-', 0);
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
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-', 0);
    await app.g.startPlayback();

    app.g.setConvolutionMix(0.5);
    const [, when] = app.state.activeGraph.wetGainLeft.gain._ramps.at(-1);
    assert.ok(when > app.ctx.currentTime, 'the ramp should end in the future');
    assert.ok(when - app.ctx.currentTime <= 0.1, 'the ramp should be short enough to feel immediate');
});

test('a later slider move glides from the present, not from the last one', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-', 0);
    await app.g.startPlayback();
    const graph = app.state.activeGraph;

    app.g.setConvolutionMix(0.8);
    app.ctx.currentTime = 12;      // the slider is left alone for a while
    app.g.setConvolutionMix(0.2);

    for (const [param, what] of [[graph.dryGain.gain, 'dry'],
                                 [graph.wetGainLeft.gain, 'wet left'],
                                 [graph.wetGainRight.gain, 'wet right']]) {
        assertAnchored(param, 12, app.data.MIX_GLIDE, what);
    }
});

test('setConvolutionMix is remembered while stopped and applied on the next play', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-', 0);

    app.g.setConvolutionMix(0.3);                    // nothing is playing yet
    assert.equal(app.state.activeGraph, null);

    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.wetGainLeft.gain.value, 0.3);
});

// ── output stage selection ────────────────────────────────────────────────

/**
 * Makes the derived files 404, whatever is on disk.
 *
 * The default responder answers from the real repository, which is right for
 * the recordings but wrong for anything the offline tools produce: those appear
 * the moment someone runs a script, and a test that assumed their absence would
 * start failing on a machine where the pipeline had been run. Absence has to be
 * asked for as explicitly as presence.
 */
function withoutDerived(app) {
    const server = app.net.respond.bind(app.net);
    app.net.respond = (url, opts) =>
        (/-Bformat\.wav$/.test(url) ? { ok: false, status: 404 } : server(url, opts));
    return app;
}

test('both output stages are built, and exactly one of them is live', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { withBformat: true });

    assert.equal(graph.stereoOut.gain.value, 1, 'stereo should carry the signal by default');
    assert.equal(graph.ambisonicOut.gain.value, 0, 'the headphone stage should be silent by default');
});

test('building for the headphone render swaps which stage carries the signal', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { ambisonic: true });

    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));
});

test('the headphone stage takes its level from the church, not the fallback', () => {
    // The fallback is 0 dB: an uncalibrated stage plays raw, which is the wrong
    // level on purpose. How far off it lands depends on how the recovered set
    // was scaled, so the figure is per set rather than shared.
    const app = createApp();
    app.g.setStageTrims({ ambisonic: -2.5 });

    close(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value,
        app.data.gainFromDb(-2.5), 1e-12);

    app.g.setStageTrims({});
    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('a church with nothing to decode falls back to stereo rather than to silence', async () => {
    // Most of the library has no recovered originals, so compile() hands the
    // engine an empty decoded base and the stage is never built.
    const app = await readyToPlay(createApp(), 0, '');
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    const graph = app.state.activeGraph;

    assert.equal(graph.ambisonicOut, null, 'the stage should not have been built');
    assert.equal(graph.stereoOut.gain.value, 1, 'something must still carry the signal');
});

test('a church with nothing to decode is never asked for a B-format at all', async () => {
    const app = await readyToPlay(createApp(), 0, '');
    await app.g.startPlayback();

    assert.equal(app.net.log.filter(r => /-Bformat\.wav$/.test(r.url)).length, 0,
        'an empty decoded base should be answered before the network, not after it');
});

test('toggling crossfades the live graph instead of rebuilding it', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    const source = app.state.source;
    const nodesBefore = app.nodes.length;

    app.g.toggleAmbisonic();

    assert.equal(app.state.ambisonicEnabled, true);
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));
    assert.equal(app.state.activeGraph, graph, 'the graph should be retuned, not replaced');
    assert.equal(app.state.source, source, 'the source must keep its place in the loop');
    assert.equal(app.nodes.length, nodesBefore, 'no new nodes should be created');
    assert.equal(source.stopped, false, 'playback must not be interrupted');
});

test('the toggle glides rather than jumping', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    app.g.toggleAmbisonic();
    const [, when] = app.state.activeGraph.ambisonicOut.gain._ramps.at(-1);
    assert.ok(when > app.ctx.currentTime, 'the ramp should end in the future');
    assert.ok(when - app.ctx.currentTime <= 0.1, 'the ramp should be short enough to feel immediate');
});

test('every crossfade is anchored in the present, so none of them can step', async () => {
    // The A/B is the whole point of the toggle, so the change that matters is
    // the second one and the fiftieth, not the first.
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    const graph = app.state.activeGraph;
    const fade = app.data.STAGE_CROSSFADE;

    app.g.toggleAmbisonic();
    assertAnchored(graph.stereoOut.gain, 0, fade, 'stereo, first toggle');
    assertAnchored(graph.ambisonicOut.gain, 0, fade, 'headphones, first toggle');

    // Half a minute of listening, then back again. An unanchored ramp would
    // interpolate from the first toggle's end and jump almost the whole way.
    app.ctx.currentTime = 30;
    app.g.toggleAmbisonic();
    assertAnchored(graph.stereoOut.gain, 30, fade, 'stereo, second toggle');
    assertAnchored(graph.ambisonicOut.gain, 30, fade, 'headphones, second toggle');
});

test('the crossfade reads as instant without clicking', () => {
    // Bounded from both sides: a gain that steps in one sample clicks, and a
    // fade shorter than the latency the decode adds would duck both stages at
    // once and leave a hole. Between those it should be as short as it can.
    const fade = createApp().data.STAGE_CROSSFADE;
    assert.ok(fade >= 0.01, `${fade}s is short enough to duck both stages at once`);
    assert.ok(fade <= 0.05, `${fade}s is long enough to be heard as a transition`);
});

test('a crossfade starts from the level the stage was left at', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    const graph = app.state.activeGraph;

    app.g.toggleAmbisonic();         // stereo fades out
    app.ctx.currentTime = 30;
    app.g.toggleAmbisonic();         // and back in

    const { anchor, ramp } = glideOn(graph.stereoOut.gain);
    assert.equal(anchor[1], 0, 'the glide must pick up where the stage was left');
    assert.equal(ramp[1], 1, 'and carry it to the level the mode calls for');
});

test('the toggle switches back off again', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    app.g.toggleAmbisonic();
    app.g.toggleAmbisonic();

    assert.equal(app.state.ambisonicEnabled, false);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
    assert.equal(app.state.activeGraph.ambisonicOut.gain.value, 0);
});

test('the mode is remembered while stopped and applied on the next play', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));

    app.g.toggleAmbisonic();                         // nothing is playing yet
    assert.equal(app.state.activeGraph, null);

    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.ambisonicOut.gain.value,
        app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 0);
});

test('the mode survives the restart a receiver change causes', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.toggleAmbisonic();

    // Switching receivers stops and restarts playback through the new IR
    await app.g.playpause();
    await app.g.playpause();

    assert.equal(app.state.ambisonicEnabled, true);
    assert.equal(app.state.activeGraph.ambisonicOut.gain.value,
        app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB),
        'the rebuilt graph must come back in the mode the visitor chose');
});

test('the toggle button reports the mode it is in', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    const btn = app.el('headphones');

    app.g.setAmbisonicEnabled(true);
    assert.equal(btn.classList.contains('active'), true);
    assert.equal(btn['aria-pressed'], 'true');
    assert.equal(btn.title, app.data.HEADPHONES_TITLE_ON);

    app.g.setAmbisonicEnabled(false);
    assert.equal(btn.classList.contains('active'), false);
    assert.equal(btn['aria-pressed'], 'false');
    assert.equal(btn.title, app.data.HEADPHONES_TITLE_OFF);
});

test('the offline render falls back to stereo, since the decoder cannot travel', async () => {
    // An Omnitone renderer belongs to the context that made it, so the live one
    // cannot be borrowed by an OfflineAudioContext. The render says so by
    // producing the stereo stage rather than silence.
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.toggleAmbisonic();
    await app.g.downloadConvolvedAudio();

    const offline = app.contexts.find(c => c.label === 'offline');
    assert.ok(offline, 'no offline render happened');

    const convolvers = app.nodes.filter(n => n.kind === 'convolver' && n.ctxLabel === 'offline');
    assert.equal(convolvers.length, 2, 'the IR pair and nothing else');
});

// ── live ambisonic rendering (Omnitone) ───────────────────────────────────

/** Makes the position's 4-channel B-format file resolve on the server */
function withAmbisonic(app) {
    const server = app.net.respond.bind(app.net);
    app.net.respond = (url, opts) => (/-Bformat\.wav$/.test(url)
        ? { ok: true, status: 200, channels: 4 }
        : server(url, opts));
    return app;
}

/**
 * Copies an array out of the app's vm realm, normalizing negative zero.
 *
 * Arrays the sandbox builds carry its Array.prototype, not this one, and
 * deepStrictEqual compares prototypes — so an identical array fails without
 * this. It also distinguishes -0 from 0, which a rotation matrix does not:
 * sin(0) lands on -0 wherever the sign is flipped, and the two are the same
 * rotation.
 */
const plain = (arrayLike) => Array.from(arrayLike, (v) => (Object.is(v, -0) ? 0 : v));

test('one convolver per AmbiX channel, all fed the same mono signal', () => {
    const app = createApp();
    const { splitter, ambiConvolvers, ambiMerger } = buildGraph(app, { withBformat: true });

    assert.equal(ambiConvolvers.length, app.data.AMBISONIC_CHANNELS);
    ambiConvolvers.forEach((convolver, ch) => {
        assert.ok(app.edgesTo(convolver).some(e => e.from === splitter),
            `channel ${ch} must convolve the same mono source as the rest`);
        const toMerger = app.edgesFrom(convolver).find(e => e.to === ambiMerger);
        assert.ok(toMerger, `channel ${ch} never reaches the merger`);
        assert.equal(toMerger.input, ch, 'a channel must land on its own ACN index');
    });
});

test('the ambisonic convolvers do not normalize, because the ratios are the field', () => {
    // The level of these four channels relative to each other *is* the
    // direction. Normalizing each one independently would flatten it out.
    const app = createApp();
    const { ambiConvolvers } = buildGraph(app, { withBformat: true });
    for (const c of ambiConvolvers) assert.equal(c.normalize, false);
});

test('the merger reassembles all four channels for the decoder', () => {
    const app = createApp();
    const { ambiMerger, graph } = buildGraph(app, { withBformat: true });

    assert.equal(ambiMerger.inputs, app.data.AMBISONIC_CHANNELS);
    assert.ok(app.edgesFrom(ambiMerger).some(e => e.to === graph.ambiWet));
});

test('the ambisonic stream is carried as discrete channels, not as speaker feeds', () => {
    // Under the default "speakers" interpretation a 4-channel signal is read as
    // a quad layout and remapped, which would scramble W/Y/Z/X into positions.
    const app = createApp();
    const { graph } = buildGraph(app, { withBformat: true });

    assert.equal(graph.ambiWet.channelInterpretation, 'discrete');
    assert.equal(graph.ambiWet.channelCountMode, 'explicit');
    assert.equal(graph.ambiWet.channelCount, app.data.AMBISONIC_CHANNELS);
});

test('the chain runs merger → renderer → its own output gain → destination', () => {
    const app = createApp();
    const { graph, renderer } = buildGraph(app, { ambisonic: true });

    assert.ok(app.edgesFrom(graph.ambiWet).some(e => e.to === renderer.input),
        'the 4-channel stream must reach the decoder');
    assert.ok(app.edgesFrom(renderer.output).some(e => e.to === graph.ambisonicOut),
        'the decoded pair must land on this mode’s own output gain');
    assert.equal(graph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));
    assert.ok(app.edgesFrom(graph.ambisonicOut).some(e => e.to === graph.output));
    assert.ok(app.edgesFrom(graph.output).some(e => e.to === app.ctx.destination));
});

test('the decoder is told the stream is already AmbiX', () => {
    // A channel reorder here would swap front for left with no other symptom.
    const app = createApp();
    const { renderer } = buildGraph(app, { withBformat: true });

    assert.deepEqual(plain(app.data.AMBIX_CHANNEL_MAP), [0, 1, 2, 3],
        'the files are ACN/SN3D already, so the map must be the identity');
    assert.deepEqual(plain(renderer.config.channelMap), plain(app.data.AMBIX_CHANNEL_MAP));
});

test('dry enters the soundfield as a plane wave from straight ahead', () => {
    // A soundfield has no centre channel to put the dry signal in. Encoded from
    // the front it lands on W and X, which is where a source in front belongs.
    const app = createApp();
    const { graph, ambiMerger } = buildGraph(app, { withBformat: true });

    const inputs = app.edgesFrom(graph.dryGain)
        .filter(e => e.to === ambiMerger).map(e => e.input).sort();
    assert.deepEqual(inputs, [0, 3], 'dry belongs on ACN 0 (W) and ACN 3 (X), nowhere else');
});

test('the upstream trim and taper are untouched by the ambisonic stage', () => {
    const app = createApp();
    const plain = buildGraph(app, { mix: 0.4, irGainDb: 6 });
    const withStage = buildGraph(app, { mix: 0.4, irGainDb: 6, withBformat: true });

    assert.equal(withStage.irTrim.gain.value, plain.irTrim.gain.value);
    assert.equal(withStage.graph.dryGain.gain.value, plain.graph.dryGain.gain.value);
});

test('the mix slider retunes the ambisonic stage along with the rest', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    app.g.setConvolutionMix(0.3);
    assert.equal(app.state.activeGraph.ambiWet.gain.value, 0.3);
});

test('the two modes are alternatives, not layers', async () => {
    // One flag and two stages today. engageMode() is the single place that
    // resolves them, so that a third stage cannot quietly arrive alongside.
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    const graph = app.state.activeGraph;
    assert.equal(app.state.ambisonicEnabled, true);
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));

    app.g.setAmbisonicEnabled(false);
    assert.equal(app.state.ambisonicEnabled, false);
    assert.equal(graph.stereoOut.gain.value, 1, 'stereo takes the signal back');
    assert.equal(graph.ambisonicOut.gain.value, 0);
});

test('the renderer is initialized once and reused across plays', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    await app.g.startPlayback();

    assert.equal(app.foaRenderers.length, 1,
        'initialize() fetches HRIRs; a renderer per play would refetch them');
    assert.equal(app.foa.initialized, true);
});

test('stopping cuts the edges that cross into the shared renderer', async () => {
    // The renderer outlives the graph, so nothing else will release them.
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    const { ambiWet, ambisonicRenderer } = app.state.activeGraph;

    app.g.stopPlayback();

    assert.ok(app.edges.some(e => e.from === ambiWet && e.disconnected),
        'the graph would stay hanging off the decoder input');
    assert.ok(app.edges.some(e => e.from === ambisonicRenderer.output && e.disconnected));
});

test('a position with no B-format falls back to stereo rather than to silence', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    assert.equal(app.state.activeGraph.ambisonicOut, null);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
});

test('a position with no B-format is looked for once, not on every play', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    const requests = () => app.net.log.filter(r => /-Bformat\.wav$/.test(r.url)).length;

    await app.g.startPlayback();
    const first = requests();
    assert.ok(first > 0);

    await app.g.startPlayback();
    assert.equal(requests(), first);
});

test('the mode is simply unavailable when Omnitone did not load', async () => {
    // A CDN that fails must cost one mode, not the whole engine.
    const app = await readyToPlay(withAmbisonic(createApp({ noOmnitone: true })));
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    assert.equal(app.state.activeGraph.ambisonicOut, null);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1, 'playback must survive');
    assert.equal(app.el('headphones')['aria-disabled'], 'true');
    assert.equal(app.el('headphones').title, app.data.HEADPHONES_TITLE_UNAVAILABLE);
});

test('a renderer that fails to initialize costs the mode, not the playback', async () => {
    const app = await readyToPlay(withAmbisonic(createApp({ omnitoneFails: true })));
    await app.g.startPlayback();

    assert.equal(app.state.isPlaying, true);
    assert.equal(app.state.activeGraph.ambisonicOut, null);
});

// ── soundfield rotation ───────────────────────────────────────────────────

test('rotationMatrix4 is the identity when the camera is level and forward', () => {
    const app = createApp();
    assert.deepEqual(plain(app.data.rotationMatrix4(0, 0)),
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

/**
 * Applies a column-major 4x4 to a direction, exactly as Omnitone's rotator
 * does: it converts the ACN directional channels to graphics axes (x right,
 * y up, z back), multiplies by the matrix as given, and converts back — so a
 * sound arriving from d ends up encoded as arriving from M·d.
 */
function rotate(matrix, [x, y, z]) {
    const m = plain(matrix);
    return [
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
    ];
}

test('turning the view hands a centred source to the other ear', () => {
    // Pannellum counts yaw positive to the right, so a positive angle here is a
    // rightward turn and a source ahead of you must move LEFT. Getting that
    // backwards is not subtle to listen to but is invisible to every other test
    // in this file: the matrix stays orthonormal and stays the identity at rest.
    const { rotationMatrix4 } = createApp().data;
    const FORWARD = [0, 0, -1];
    const lateral = (yaw) => rotate(rotationMatrix4(yaw, 0), FORWARD)[0];

    close(lateral(0), 0, 1e-12, 'a level, forward view leaves a centred source centred');

    const turnedRight = lateral(40);
    assert.ok(turnedRight < 0, 'turning right must move a centred source to the left ear');
    close(turnedRight, -Math.sin(40 * Math.PI / 180), 1e-12,
        'and by the angle turned, not some fraction of it');

    assert.ok(lateral(-40) > 0, 'turning left must move it to the right ear');
    close(lateral(-40), -turnedRight, 1e-12, 'the two turns must mirror each other');
});

test('tilting the view moves a centred source the opposite way in height', () => {
    // Pitch needs no sign reconciliation: pannellum and this frame both call
    // positive "up". Pinned so that a future fix to yaw cannot quietly take
    // pitch with it — flipping one shared sign would have inverted both.
    const { rotationMatrix4 } = createApp().data;
    const height = (pitch) => rotate(rotationMatrix4(0, pitch), [0, 0, -1])[1];

    close(height(0), 0, 1e-12);
    close(height(30), -Math.sin(30 * Math.PI / 180), 1e-12,
        'looking up must put a source ahead of you below your new eyeline');
    assert.ok(height(-30) > 0, 'and looking down must put it above');
});

test('a church whose recording faces the other way turns the other way', () => {
    // The offset is not cosmetic: the apparent lateral position goes as
    // -sin(yaw - offset), so half a turn lands on the opposite slope and
    // reverses which ear a source moves toward. Half the collection needs it.
    const app = createApp();
    const { rotationMatrix4 } = app.data;
    const lateral = (yaw, offset) => rotate(rotationMatrix4(yaw - offset, 0), [0, 0, -1])[0];

    const aligned = lateral(30, 0);
    const opposed = lateral(30, 180);

    assert.ok(aligned < 0, 'facing the same way, turning right sends a source left');
    assert.ok(opposed > 0, 'facing opposite, the same turn sends it right');
    close(opposed, -aligned, 1e-12, 'the two are exact mirrors, not merely different');
});

test('the soundfield offset reaches the renderer through the selection', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);
    app.g.setSoundfieldTracking(true);

    app.g.setSoundfieldOrientation(180);
    app.viewer.yaw = 30;
    app.frames.tick();

    assert.deepEqual(plain(app.foa.rotations.at(-1)),
        plain(app.data.rotationMatrix4(30 - 180, 0)),
        'the matrix must be built from the bearing relative to the recording');
});

test('a church with no offset is left alone', () => {
    const app = createApp();
    app.g.setSoundfieldOrientation(undefined);
    assert.equal(app.state.soundfieldYaw, 0, 'a missing field must not become NaN');

    app.g.setSoundfieldOrientation(180);
    assert.equal(app.state.soundfieldYaw, 180);
});

test('rotationMatrix4 composes yaw and pitch as a true inverse', () => {
    // Negating both angles inverts each rotation but leaves them composed in the
    // original order, which matches a real inverse only when one of them is
    // zero. It would look right under pure yaw and go quietly wrong on a tilt.
    const { rotationMatrix4 } = createApp().data;
    const m = plain(rotationMatrix4(35, 25));

    // Rᵀ undoes R: applying the matrix and then its transpose is the identity
    const round = rotate(m, rotate(
        [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1],
        [0, 0, -1]));
    round.forEach((v, i) => close(v, [0, 0, -1][i], 1e-12, 'the pair should cancel exactly'));
});

test('rotationMatrix4 stays orthonormal as the camera turns', () => {
    // A matrix that drifts off orthonormal would scale the soundfield as well as
    // turn it, which is heard as the room breathing while the view is dragged.
    const { rotationMatrix4 } = createApp().data;
    for (const [yaw, pitch] of [[90, 0], [-45, 20], [180, -30], [37, 12]]) {
        const m = rotationMatrix4(yaw, pitch);
        const columns = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
        for (const c of columns) close(Math.hypot(...c), 1, 1e-12, 'column is not a unit vector');
        close(columns[0][0] * columns[1][0] + columns[0][1] * columns[1][1]
            + columns[0][2] * columns[1][2], 0, 1e-12, 'columns are not perpendicular');
    }
});

test('the soundfield does not track the view by default', async () => {
    // The other three renders are fixed-head. A mode that tracked while they did
    // not would be comparing two differences at once.
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);

    assert.equal(app.state.soundfieldTracking, false);
    app.viewer.yaw = 90;
    app.frames.tick();
    assert.equal(app.foa.rotations.length, 0, 'nothing should be driving the renderer');
});

test('tracking drives the renderer from the panorama camera each frame', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);
    app.g.setSoundfieldTracking(true);

    app.viewer.yaw = 90;
    app.viewer.pitch = 0;
    app.frames.tick();

    const sent = app.foa.rotations.at(-1);
    assert.deepEqual(plain(sent), plain(app.data.rotationMatrix4(90, 0)),
        'the matrix must come from the angles aimViewer() works in');

    app.viewer.yaw = -30;
    app.frames.tick();
    assert.deepEqual(plain(app.foa.rotations.at(-1)), plain(app.data.rotationMatrix4(-30, 0)),
        'and follow the camera on every frame, not just the first');
});

test('tracking stops with the mode, leaving the soundfield facing forward', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);
    app.g.setSoundfieldTracking(true);

    app.viewer.yaw = 120;
    app.frames.tick();

    app.g.setAmbisonicEnabled(false);

    assert.deepEqual(plain(app.foa.rotations.at(-1)), plain(app.data.rotationMatrix4(0, 0)),
        'a soundfield left rotated would be wrong for every other mode');
    app.viewer.yaw = 10;
    const before = app.foa.rotations.length;
    app.frames.tick();
    assert.equal(app.foa.rotations.length, before, 'the loop should have stopped');
});

test('the mode can be armed before playback has started', async () => {
    // Availability is read off the running graph, so gating on that alone left
    // the button greyed out on a freshly loaded page with no way in: you cannot
    // press play *and* have already chosen how to listen.
    const app = await readyToPlay(withAmbisonic(createApp()));
    assert.equal(app.state.activeGraph, null, 'nothing is playing yet');

    app.g.refreshModeButtons();
    assert.equal(app.el('headphones')['aria-disabled'], 'false', 'nothing has ruled this church out');

    app.g.setAmbisonicEnabled(true);
    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB),
        'the mode chosen while stopped should be the one that comes up');
});

test('the button is dead at a church with nothing to decode, before any play', async () => {
    const app = await readyToPlay(createApp(), 0, '');

    app.g.refreshModeButtons();
    assert.equal(app.el('headphones')['aria-disabled'], 'true');
    assert.equal(app.el('headphones').title, app.data.HEADPHONES_TITLE_UNAVAILABLE);
    assert.match(app.el('headphones').title, /impulse response/,
        'the tooltip is the only place that can say why, so it must say what');
});

test('an unavailable mode refuses the press rather than lighting up', async () => {
    // The button stays hoverable so it can explain itself, which means a click
    // reaches the engine. Engaging a stage that was never built would leave the
    // toggle lit over audio that had not changed.
    const app = await readyToPlay(createApp(), 0, '');
    await app.g.startPlayback();

    app.g.toggleAmbisonic();

    assert.equal(app.state.ambisonicEnabled, false);
    assert.equal(app.el('headphones').classList.contains('active'), false);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
});

test('a mode proved missing stays disabled after playback stops', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    await app.g.startPlayback();
    app.g.stopPlayback();

    assert.equal(app.el('headphones')['aria-disabled'], 'true',
        'this church is now known not to have a usable B-format');
});

test('the decode is reported as unavailable rather than failing silently', async () => {
    // A dead <script> tag disables this mode with no other symptom. Without a
    // word in the console it is indistinguishable from a missing file.
    const warnings = [];
    const app = await readyToPlay(withAmbisonic(createApp({ noOmnitone: true })));
    app.g.console = { warn: (m) => warnings.push(m), error: () => {} };

    await app.g.startPlayback();

    assert.equal(warnings.length, 1, 'it should say so, once');
    assert.match(warnings[0], /Omnitone did not load/);
});

test('the head-tracking control is live only in the mode it can act on', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    const box = app.el('tracking');

    assert.equal(box.disabled, true, 'stereo has no soundfield to turn');

    app.g.setAmbisonicEnabled(true);
    assert.equal(box.disabled, false);

    app.g.setAmbisonicEnabled(false);
    assert.equal(box.disabled, true, 'stereo bakes its orientation in');
});

test('the head-tracking control stays unavailable where the decode is', async () => {
    // No B-format for this position, so there is no soundfield to rotate even
    // though the mode was asked for.
    const app = await readyToPlay(withoutDerived(createApp()));
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    assert.equal(app.el('tracking').disabled, true);
    assert.equal(app.el('tracking-control').title, app.data.TRACKING_TITLE_UNAVAILABLE);
});

test('the head-tracking control reports whether tracking is on', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);

    app.g.setSoundfieldTracking(true);
    assert.equal(app.el('tracking').checked, true);
    assert.equal(app.el('tracking-control').title, app.data.TRACKING_TITLE_ON);
    assert.equal(app.el('tracking-control').classList.contains('unavailable'), false);

    app.g.setSoundfieldTracking(false);
    assert.equal(app.el('tracking').checked, false);
    assert.equal(app.el('tracking-control').title, app.data.TRACKING_TITLE_OFF);
});

test('the mode toggle reports its own state', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();

    const engaged = () => app.data.MODE_TOGGLE_IDS
        .filter(id => app.el(id).classList.contains('active'));

    assert.deepEqual(Array.from(engaged()), [], 'stereo is no mode at all');

    app.g.setAmbisonicEnabled(true);
    assert.deepEqual(Array.from(engaged()), ['headphones']);
    assert.equal(app.el('headphones')['aria-pressed'], 'true');
});

// ── per-church stage levels ───────────────────────────────────────────────

/** What a stage's output gain should be for a given trim, in dB */
const gainAt = (app, db) => app.data.gainFromDb(db);

test('an uncalibrated church leaves the stage at its own level', () => {
    const app = createApp();
    app.g.setStageTrims(undefined);

    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('zero dB is no change, which is what an uncalibrated church means', () => {
    // A placeholder row reads as 0 dB. In decibels that is literally "leave it
    // alone" rather than a sentinel standing in for one.
    const app = createApp();
    app.g.setStageTrims({ ambisonic: 0 });

    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('a church trim sets the stage level in dB', () => {
    const app = createApp();
    app.g.setStageTrims({ ambisonic: -6 });

    close(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value,
        Math.pow(10, -6 / 20), 1e-12);
    close(gainAt(app, -6), 0.5011872336, 1e-9, '-6 dB is about half the amplitude');
});

test('equal dB steps are equal ratios wherever they are taken', () => {
    // The reason these are in dB at all: a step means the same thing near
    // silence as near unity, which is what makes them findable by ear.
    const { gainFromDb } = createApp().data;
    close(gainFromDb(-6) / gainFromDb(-3), gainFromDb(-16) / gainFromDb(-13), 1e-12);
    close(gainFromDb(0), 1, 1e-12);
});

test('a trim keyed to no stage changes nothing', () => {
    // stageTrims is keyed by stage name, so a leftover key from a render that
    // was removed must be inert rather than land on whatever is left.
    const app = createApp();
    app.g.setStageTrims({ binaural: -12, brir: -12 });

    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('stereo carries no trim, being the reference the rest are matched to', () => {
    const app = createApp();
    app.g.setStageTrims({ ambisonic: -6, stereo: -6 });

    assert.equal(buildGraph(app).graph.stereoOut.gain.value, 1,
        'the reference cannot itself be trimmed');
});

test('a trim that is not a usable level falls back to the constant', () => {
    // ROOMS is hand-edited. A typo must not silence a mode, and a misplaced
    // decimal point must not make an already-hot stage the loudest thing here.
    const app = createApp();
    const { STAGE_TRIM_MAX_DB, STAGE_TRIM_MIN_DB } = app.data;

    for (const bad of ['loud', null, undefined, NaN, Infinity, -Infinity,
                       STAGE_TRIM_MAX_DB + 1, STAGE_TRIM_MIN_DB - 1]) {
        app.g.setStageTrims({ ambisonic: bad });
        assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1,
            `a trim of ${String(bad)} should be ignored`);
    }
});

test('a modest boost is a real answer, not a dropped minus sign', () => {
    // Monastery Immaculate Conception's originals come back a couple of
    // decibels *under* stereo and want lifting. A one-sided guard would have
    // refused the true value.
    const app = createApp();

    app.g.setStageTrims({ ambisonic: 1 });
    close(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value,
        app.data.gainFromDb(1), 1e-12);

    app.g.setStageTrims({ ambisonic: app.data.STAGE_TRIM_MAX_DB });
    assert.equal(app.g.stageTrimDb('ambisonic', 0), app.data.STAGE_TRIM_MAX_DB,
        'the top of the range is still usable');
});

test('a church trim reaches a live crossfade, not just a fresh graph', async () => {
    const app = await readyToPlay(withAmbisonic(createApp()));
    await app.g.startPlayback();
    app.g.setStageTrims({ ambisonic: -16.5 });

    app.g.setAmbisonicEnabled(true);
    close(app.state.activeGraph.ambisonicOut.gain.value, gainAt(app, -16.5), 1e-12);
});

test('switching churches switches levels', () => {
    const app = createApp();

    app.g.setStageTrims({ ambisonic: -1 });
    close(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, gainAt(app, -1), 1e-12);

    app.g.setStageTrims({ ambisonic: -9 });
    close(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, gainAt(app, -9), 1e-12);
});

test('the fallback is 0 dB, so calibration starts from raw', () => {
    // Calibrating against a fallback that is already close to right is the hard
    // case: every value sounds nearly as plausible as the last, because the ear
    // has nothing to push away from. Untouched is plainly wrong in a known
    // direction, which is what makes the search converge.
    assert.equal(createApp().data.AMBISONIC_TRIM_DB, 0,
        'AMBISONIC_TRIM_DB should leave an uncalibrated stage untouched');
});


// ── loading and caching ───────────────────────────────────────────────────

test('an impulse response is fetched once and then served from cache', async () => {
    const app = createApp();
    const url = 'IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-1.wav';

    const a = await app.g.loadImpulseResponse(url);
    const b = await app.g.loadImpulseResponse(url);

    assert.equal(a, b, 'the same buffer should come back');
    assert.equal(app.net.log.filter(r => r.url === url).length, 1, 'it should only be downloaded once');
});

test('two plays started at once share a single download', async () => {
    const app = createApp();
    const url = 'IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R2-1.wav';

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
    const url = (n) => `IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R${n}-1.wav`;

    // Fill past the cap; R1 is the oldest and should fall out
    for (let n = 1; n <= limit + 1; n++) await app.g.loadImpulseResponse(url(n % 9 + 1));

    const before = app.net.log.length;
    await app.g.loadImpulseResponse(url(2));
    assert.ok(app.net.log.length > before, 'an evicted entry should be fetched again');
});

test('impulseResponseExists probes with HEAD rather than downloading audio', async () => {
    const app = createApp();
    const base = 'IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-';

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

/**
 * A church ready to play, at a position that has both sets of files.
 *
 * Monastery Immaculate Conception rather than Cane Ridge, because the headphone
 * render needs a church whose originals were recovered. Pass '' as decodedBase
 * for the other case — a church that has only ever been published.
 */
const PLAYABLE_BASE = 'IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R1-';
const PLAYABLE_DECODED = 'IR/Monastery Immaculate Conception, IN/Not Normalized/MIC_IN_R1-';

async function readyToPlay(app, gainDb = 0, decodedBase = PLAYABLE_DECODED) {
    app.loadFakeSource();
    app.g.setImpulseResponse(PLAYABLE_BASE, gainDb, decodedBase);
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
    const output = app.state.activeGraph.output;

    await app.g.playpause();

    assert.equal(app.state.isPlaying, false);
    assert.equal(app.state.source, null);
    assert.equal(app.state.activeGraph, null, 'the graph reference should be dropped');
    assert.equal(source.stopped, true);
    assert.ok(app.edges.some(e => e.from === output && e.disconnected),
        'the output must be unhooked or every past graph stays pinned to the destination');
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
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R1-', 0);

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
