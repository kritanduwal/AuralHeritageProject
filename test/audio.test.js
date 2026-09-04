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
 * `withBrirPair` decides whether the position has a measured BRIR, which is
 * what makes the third output stage exist at all.
 */
function buildGraph(app, { mix = 1, irGainDb = 0, binaural = false, brir = false,
                           withBrirPair = brir, ambisonic = false,
                           withBformat = ambisonic, speakerDistance } = {}) {
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
        brirLeft: withBrirPair ? app.fakeAudioBuffer() : null,
        brirRight: withBrirPair ? app.fakeAudioBuffer() : null,
        bformatChannels: withBformat
            ? Array.from({ length: app.data.AMBISONIC_CHANNELS }, () => app.fakeAudioBuffer())
            : null,
        ambisonicRenderer: renderer,
        mix, irGainDb, binaural, brir, ambisonic, speakerDistance,
    });

    const made = app.nodes.slice(first);
    const kinds = (k) => made.filter(n => n.kind === k);
    const splitter = kinds('splitter')[0];
    // The trim is whatever feeds the splitter
    const irTrim = app.edgesTo(splitter)[0]?.from ?? null;

    // Stages build in order: stereo, then BRIR, then ambisonic
    const mergers = kinds('merger');
    const convolvers = kinds('convolver');

    // Panners are created left first, matching the -30/+30 order in the engine
    const [speakerLeft, speakerRight] = kinds('panner');

    return {
        ctx, src, graph, splitter, irTrim, speakerLeft, speakerRight, renderer,
        merger: mergers[0],
        brirMerger: withBrirPair ? mergers[1] : null,
        ambiMerger: graph.ambiMerger,
        convolvers: convolvers.slice(0, 2),
        brirConvolvers: withBrirPair ? convolvers.slice(2, 4) : [],
        ambiConvolvers: withBformat ? convolvers.slice(withBrirPair ? 4 : 2) : [],
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

test('a later slider move glides from the present, not from the last one', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);
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
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);

    app.g.setConvolutionMix(0.3);                    // nothing is playing yet
    assert.equal(app.state.activeGraph, null);

    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.wetGainLeft.gain.value, 0.3);
});

// ── binaural rendering ────────────────────────────────────────────────────

test('both output stages are built, and exactly one of them is live', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { binaural: false });

    assert.equal(graph.stereoOut.gain.value, 1, 'the stereo stage should carry the signal by default');
    assert.equal(graph.binauralOut.gain.value, 0, 'the binaural stage should be silent by default');
});

test('building for binaural swaps which stage carries the signal', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { binaural: true });

    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.binauralOut.gain.value, app.data.BINAURAL_TRIM);
});

test('both stages render the same signals', () => {
    // The toggle is an A/B of one auralization, so the speakers must be fed the
    // very signals the headphone channels get.
    const app = createApp();
    const { graph, merger, speakerLeft, speakerRight } = buildGraph(app);

    for (const [signal, speaker, what] of [
        [graph.wetGainLeft, speakerLeft, 'wet left'],
        [graph.wetGainRight, speakerRight, 'wet right'],
    ]) {
        assert.ok(app.edgesFrom(signal).some(e => e.to === merger), `${what} must reach the stereo stage`);
        assert.ok(app.edgesFrom(signal).some(e => e.to === speaker), `${what} must reach its speaker`);
    }

    // Dry is centred in both stages: both channels, both speakers
    assert.equal(pathCount(app, graph.dryGain, graph.stereoOut), 2);
    assert.equal(pathCount(app, graph.dryGain, graph.binauralOut), 2);
});

test('the virtual speakers are HRTF panned to a stereo listening triangle', () => {
    const app = createApp();
    const d = 42;
    const { speakerLeft, speakerRight, graph } = buildGraph(app, { speakerDistance: d });
    const half = app.data.VIRTUAL_SPEAKER_AZIMUTH;

    for (const s of [speakerLeft, speakerRight]) {
        assert.equal(s.panningModel, 'HRTF', 'plain equal-power panning would not externalize');
        assert.equal(pathCount(app, s, graph.binauralOut), 1, 'each speaker reaches the stage once');
        // Web Audio puts the listener at the origin facing -Z
        assert.ok(s.positionZ.value < 0, 'the speakers must sit in front of the listener');
        assert.equal(s.positionY.value, 0, 'the pair should be at ear height');
        close(Math.hypot(s.positionX.value, s.positionZ.value), d, 1e-9);
    }

    close(speakerLeft.positionX.value, -d * Math.sin(half * Math.PI / 180), 1e-9);
    close(speakerRight.positionX.value, d * Math.sin(half * Math.PI / 180), 1e-9);
    assert.ok(speakerLeft.positionX.value < 0 && speakerRight.positionX.value > 0,
        'left and right speakers must be on opposite sides');
});

test('the speakers stand at the measured receiver-to-source distance', () => {
    const app = createApp();
    const near = buildGraph(app, { speakerDistance: 12 }).speakerLeft;
    const far = buildGraph(app, { speakerDistance: 90 }).speakerLeft;

    close(Math.hypot(near.positionX.value, near.positionZ.value), 12, 1e-9);
    close(Math.hypot(far.positionX.value, far.positionZ.value), 90, 1e-9);
});

test('a receiver with no distance on record still renders at a plausible scale', () => {
    const app = createApp();
    const { speakerLeft } = buildGraph(app);   // no speakerDistance supplied
    close(Math.hypot(speakerLeft.positionX.value, speakerLeft.positionZ.value),
        app.data.DEFAULT_SPEAKER_DISTANCE_FEET, 1e-9);
});

test('how far away a speaker stands does not change its level', () => {
    // Distance is already paid for by the impulse response and by the gainDb
    // trim derived from it. A rolloff here would charge for it a third time and
    // would pull the reverb down with the direct sound.
    const app = createApp();

    for (const d of [8.7, 20, 90.17]) {
        for (const s of [buildGraph(app, { speakerDistance: d }).speakerLeft,
                         buildGraph(app, { speakerDistance: d }).speakerRight]) {
            assert.equal(s.distanceModel, 'inverse');
            assert.equal(s.rolloffFactor, 0, `distance ${d} ft must not attenuate`);
            assert.equal(s.refDistance, 1,
                'unity at any distance under either reading of the inverse law');
        }
    }
});

test('the measured distance reaches the graph through the current selection', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0, 8.7);
    await app.g.startPlayback();

    const speaker = app.nodes.filter(n => n.kind === 'panner').at(-1);
    close(Math.hypot(speaker.positionX.value, speaker.positionZ.value), 8.7, 1e-9);
});

test('toggleBinaural crossfades the live graph instead of rebuilding it', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    const source = app.state.source;
    const nodesBefore = app.nodes.length;

    app.g.toggleBinaural();

    assert.equal(app.state.binauralEnabled, true);
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.binauralOut.gain.value, app.data.BINAURAL_TRIM);
    assert.equal(app.state.activeGraph, graph, 'the graph should be retuned, not replaced');
    assert.equal(app.state.source, source, 'the source must keep its place in the loop');
    assert.equal(app.nodes.length, nodesBefore, 'no new nodes should be created');
    assert.equal(source.stopped, false, 'playback must not be interrupted');
});

test('toggleBinaural glides rather than jumping', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();

    app.g.toggleBinaural();
    const [, when] = app.state.activeGraph.binauralOut.gain._ramps.at(-1);
    assert.ok(when > app.ctx.currentTime, 'the ramp should end in the future');
    assert.ok(when - app.ctx.currentTime <= 0.1, 'the ramp should be short enough to feel immediate');
});

test('every crossfade is anchored in the present, so none of them can step', async () => {
    // The A/B is the whole point of the toggle, so the change that matters is
    // the second one and the fiftieth, not the first.
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();
    const graph = app.state.activeGraph;
    const fade = app.data.BINAURAL_CROSSFADE;

    app.g.toggleBinaural();
    assertAnchored(graph.stereoOut.gain, 0, fade, 'stereo, first toggle');
    assertAnchored(graph.binauralOut.gain, 0, fade, 'binaural, first toggle');

    // Half a minute of listening, then back again. An unanchored ramp would
    // interpolate from the first toggle's end and jump almost the whole way.
    app.ctx.currentTime = 30;
    app.g.toggleBinaural();
    assertAnchored(graph.stereoOut.gain, 30, fade, 'stereo, second toggle');
    assertAnchored(graph.binauralOut.gain, 30, fade, 'binaural, second toggle');
});

test('the crossfade reads as instant without clicking', () => {
    // Bounded from both sides: a gain that steps in one sample clicks, and a
    // fade shorter than the latency the HRTF panners add would duck both stages
    // at once and leave a hole. Between those it should be as short as it can.
    const fade = createApp().data.BINAURAL_CROSSFADE;
    assert.ok(fade >= 0.01, `${fade}s is short enough to duck both stages at once`);
    assert.ok(fade <= 0.05, `${fade}s is long enough to be heard as a transition`);
});

test('a crossfade starts from the level the stage was left at', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();
    const graph = app.state.activeGraph;

    app.g.toggleBinaural();          // stereo fades out
    app.ctx.currentTime = 30;
    app.g.toggleBinaural();          // and back in

    const { anchor, ramp } = glideOn(graph.stereoOut.gain);
    assert.equal(anchor[1], 0, 'the glide must pick up where the stage was left');
    assert.equal(ramp[1], 1, 'and carry it to the level the mode calls for');
});

test('toggleBinaural switches back off again', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();

    app.g.toggleBinaural();
    app.g.toggleBinaural();

    assert.equal(app.state.binauralEnabled, false);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
    assert.equal(app.state.activeGraph.binauralOut.gain.value, 0);
});

test('the binaural mode is remembered while stopped and applied on the next play', async () => {
    const app = await readyToPlay(createApp());

    app.g.toggleBinaural();                          // nothing is playing yet
    assert.equal(app.state.activeGraph, null);

    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.binauralOut.gain.value, app.data.BINAURAL_TRIM);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 0);
});

test('the binaural mode survives the restart a receiver change causes', async () => {
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();
    app.g.toggleBinaural();

    // Switching receivers stops and restarts playback through the new IR
    await app.g.playpause();
    await app.g.playpause();

    assert.equal(app.state.binauralEnabled, true);
    assert.equal(app.state.activeGraph.binauralOut.gain.value, app.data.BINAURAL_TRIM,
        'the rebuilt graph must come back in the mode the visitor chose');
});

test('the toggle button reports the mode it is in', () => {
    const app = createApp();
    const btn = app.el('binaural');

    app.g.setBinauralEnabled(true);
    assert.equal(btn.classList.contains('active'), true);
    assert.equal(btn['aria-pressed'], 'true');
    assert.equal(btn.title, app.data.BINAURAL_TITLE_ON);

    app.g.setBinauralEnabled(false);
    assert.equal(btn.classList.contains('active'), false);
    assert.equal(btn['aria-pressed'], 'false');
    assert.equal(btn.title, app.data.BINAURAL_TITLE_OFF);
});

test('the offline render honours the mode being listened to', async () => {
    const app = await readyToPlay(createApp());
    app.g.toggleBinaural();
    await app.g.downloadConvolvedAudio();

    const offline = app.contexts.find(c => c.label === 'offline');
    const panners = app.nodes.filter(n => n.kind === 'panner' && n.ctxLabel === 'offline');
    assert.ok(offline, 'no offline render happened');
    assert.equal(panners.length, 2, 'the render must go through the same virtual speakers');
});

// ── measured binaural rendering (BRIR) ────────────────────────────────────

/** Makes the BRIR pair resolve on the server */
function withBrir(app) {
    const server = app.net.respond.bind(app.net);
    app.net.respond = (url, opts) =>
        (/-BRIR-[LR]\.wav$/.test(url) ? { ok: true, status: 200 } : server(url, opts));
    return app;
}

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
        (/-(BRIR-[LR]|Bformat)\.wav$/.test(url) ? { ok: false, status: 404 } : server(url, opts));
    return app;
}

test('the BRIR stage reuses the wet path with the measured pair in it', () => {
    const app = createApp();
    const { graph, splitter, brirConvolvers } = buildGraph(app, { withBrirPair: true });

    assert.equal(brirConvolvers.length, 2, 'the stage needs its own convolver pair');
    for (const c of brirConvolvers) {
        assert.ok(app.edgesTo(c).some(e => e.from === splitter),
            'a BRIR convolver must tap the same mono signal the IR pair does');
    }
    assert.ok(app.edgesFrom(brirConvolvers[0]).some(e => e.to === graph.brirWetLeft));
    assert.ok(app.edgesFrom(brirConvolvers[1]).some(e => e.to === graph.brirWetRight));
});

test('the BRIR convolvers do not normalize, so the decode keeps its level', () => {
    // The offline decode set this file's absolute level — the ambisonic
    // normalization, the speaker count and the HRTF set's own gain all land in
    // it. Equal-power normalization would scale every bit of that back out.
    const app = createApp();
    const { brirConvolvers } = buildGraph(app, { withBrirPair: true });
    for (const c of brirConvolvers) assert.equal(c.normalize, false);
});

test('the BRIR stage ends in its own output gain', () => {
    const app = createApp();
    const { graph } = buildGraph(app, { brir: true });

    assert.ok(graph.brirOut, 'the mode needs a dedicated node to calibrate on');
    assert.equal(graph.brirOut.gain.value, app.data.BRIR_TRIM);
    assert.ok(app.edgesFrom(graph.brirOut).some(e => e.to === graph.output));
});

test('a BRIR render goes straight out, never through the virtual speakers', () => {
    // It has already been through a head. The HRTF panners would put it through
    // a second one, which is the one mistake this mode exists to avoid.
    const app = createApp();
    const { graph, speakerLeft, speakerRight } = buildGraph(app, { withBrirPair: true });

    for (const speaker of [speakerLeft, speakerRight]) {
        const feeds = app.edgesTo(speaker).map(e => e.from);
        assert.ok(!feeds.includes(graph.brirWetLeft), 'BRIR left reached a virtual speaker');
        assert.ok(!feeds.includes(graph.brirWetRight), 'BRIR right reached a virtual speaker');
    }
});

test('each BRIR channel lands on its own ear, with dry centred between them', () => {
    const app = createApp();
    const { graph, brirMerger } = buildGraph(app, { withBrirPair: true });

    const left = app.edgesFrom(graph.brirWetLeft).find(e => e.to === brirMerger);
    const right = app.edgesFrom(graph.brirWetRight).find(e => e.to === brirMerger);
    assert.equal(left.input, 0, 'BRIR left must land on output channel 0');
    assert.equal(right.input, 1, 'BRIR right must land on output channel 1');

    assert.equal(pathCount(app, graph.dryGain, graph.brirOut), 2,
        'dry stays centred here exactly as it does in the other two stages');
});

test('the upstream trim and taper are untouched by the BRIR stage', () => {
    const app = createApp();
    const plain = buildGraph(app, { mix: 0.4, irGainDb: 6 });
    const withStage = buildGraph(app, { mix: 0.4, irGainDb: 6, withBrirPair: true });

    assert.equal(withStage.irTrim.gain.value, plain.irTrim.gain.value,
        'the per-position trim belongs upstream and must not move');
    assert.equal(withStage.graph.dryGain.gain.value, plain.graph.dryGain.gain.value,
        'the dry taper belongs upstream and must not move');
});

test('the mix slider retunes the BRIR stage along with the rest', async () => {
    const app = await readyToPlay(withBrir(createApp()));
    await app.g.startPlayback();
    const graph = app.state.activeGraph;

    app.g.setConvolutionMix(0.3);

    assert.equal(graph.brirWetLeft.gain.value, 0.3);
    assert.equal(graph.brirWetRight.gain.value, 0.3);
    assert.equal(app.state.activeGraph, graph, 'the graph should be retuned, not replaced');
});

test('the two binaural modes are alternatives, not layers', async () => {
    const app = await readyToPlay(withBrir(createApp()));
    await app.g.startPlayback();

    app.g.setBinauralEnabled(true);
    assert.equal(app.state.brirEnabled, false);

    app.g.setBrirEnabled(true);
    assert.equal(app.state.brirEnabled, true);
    assert.equal(app.state.binauralEnabled, false, 'engaging one must release the other');

    const graph = app.state.activeGraph;
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.binauralOut.gain.value, 0);
    assert.equal(graph.brirOut.gain.value, app.data.BRIR_TRIM);
});

test('toggleBrir crossfades the live graph instead of rebuilding it', async () => {
    const app = await readyToPlay(withBrir(createApp()));
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    const source = app.state.source;
    const nodesBefore = app.nodes.length;

    app.g.toggleBrir();

    assert.equal(app.state.activeGraph, graph, 'the graph should be retuned, not replaced');
    assert.equal(app.state.source, source, 'the source must keep its place in the loop');
    assert.equal(app.nodes.length, nodesBefore, 'no new nodes should be created');
    assert.equal(source.stopped, false, 'playback must not be interrupted');
});

test('a position with no BRIR falls back to stereo rather than to silence', async () => {
    // Most of the library has none: they exist only where the offline tools ran.
    const app = await readyToPlay(withoutDerived(createApp()));
    await app.g.startPlayback();

    app.g.setBrirEnabled(true);
    const graph = app.state.activeGraph;

    assert.equal(graph.brirOut, null, 'the stage should not have been built');
    assert.equal(graph.stereoOut.gain.value, 1, 'something must still carry the signal');
});

test('a position with no BRIR is looked for once, not on every play', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    const brirRequests = () => app.net.log.filter(r => /-BRIR-/.test(r.url)).length;

    await app.g.startPlayback();
    const first = brirRequests();
    assert.ok(first > 0, 'it should have looked at least once');

    await app.g.startPlayback();
    assert.equal(brirRequests(), first,
        'a position already known to have none should not be re-requested');
});

test('the BRIR button reports availability, not just the mode', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    const btn = app.el('brir');

    await app.g.startPlayback();          // no BRIR pair on this position
    assert.equal(btn.disabled, true);
    assert.equal(btn.title, app.data.BRIR_TITLE_UNAVAILABLE);

    const ready = await readyToPlay(withBrir(createApp()));
    await ready.g.startPlayback();
    ready.g.setBrirEnabled(true);
    assert.equal(ready.el('brir').disabled, false);
    assert.equal(ready.el('brir').title, app.data.BRIR_TITLE_ON);
    assert.equal(ready.el('brir')['aria-pressed'], 'true');
});

test('the BRIR pair is named as the offline tools write it', () => {
    const app = createApp();
    // currentIr.base ends at the trailing "-", so the suffixes complete
    // <prefix>_R<n>-BRIR-L.wav — what tools/bformat-to-brir.js produces.
    assert.equal(app.data.BRIR_LEFT_SUFFIX, 'BRIR-L.wav');
    assert.equal(app.data.BRIR_RIGHT_SUFFIX, 'BRIR-R.wav');
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
