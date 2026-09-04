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
                           withBformat = ambisonic, withSpeakers = true } = {}) {
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
        // Two channels apiece: convolving a speaker's mono feed against its
        // response is what turns it into a pair of ears
        speakerHrir: withSpeakers
            ? { left: app.fakeAudioBuffer(256, 2), right: app.fakeAudioBuffer(256, 2) }
            : null,
        mix, irGainDb, binaural, brir, ambisonic,
    });

    const made = app.nodes.slice(first);
    const kinds = (k) => made.filter(n => n.kind === k);
    const splitter = kinds('splitter')[0];
    // The trim is whatever feeds the splitter
    const irTrim = app.edgesTo(splitter)[0]?.from ?? null;

    // Stages build in order: stereo, binaural, BRIR, ambisonic — and every one
    // of them is a convolver now, so they are counted off rather than filtered.
    const mergers = kinds('merger');
    const convolvers = kinds('convolver');
    let next = 2;                                  // the IR pair comes first
    const speakers = withSpeakers ? convolvers.slice(next, next += 2) : [];
    const brirConvolvers = withBrirPair ? convolvers.slice(next, next += 2) : [];
    const ambiConvolvers = withBformat ? convolvers.slice(next, next += 4) : [];

    return {
        ctx, src, graph, splitter, irTrim, renderer,
        speakerLeft: speakers[0] ?? null,
        speakerRight: speakers[1] ?? null,
        merger: mergers[0],
        brirMerger: withBrirPair ? mergers[1] : null,
        ambiMerger: graph.ambiMerger,
        convolvers: convolvers.slice(0, 2),
        brirConvolvers,
        ambiConvolvers,
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
    assert.equal(graph.binauralOut.gain.value, app.data.gainFromDb(app.data.BINAURAL_TRIM_DB));
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

test('the binaural stage takes its level from the church, not the fallback', () => {
    // The fallback is 0 dB: an uncalibrated stage plays raw, which is the wrong
    // level on purpose. The attenuation every speaker being heard by both ears
    // calls for is per church now, because how far off it lands depends on the
    // room.
    const app = createApp();
    app.g.setStageTrims({ binaural: -2.5 });

    close(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value,
        app.data.gainFromDb(-2.5), 1e-12);

    app.g.setStageTrims({});
    assert.equal(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, 1);
});

test('each virtual speaker is one convolver carrying both ears', () => {
    // A convolver with a mono input and a two-channel response outputs the pair
    // directly, so one node is the whole loudspeaker.
    const app = createApp();
    const { speakerLeft, speakerRight, graph } = buildGraph(app);

    for (const speaker of [speakerLeft, speakerRight]) {
        assert.equal(speaker.kind, 'convolver');
        assert.equal(speaker.buffer.numberOfChannels, 2, 'one channel per ear');
        assert.equal(pathCount(app, speaker, graph.binauralOut), 1,
            'each speaker reaches the stage once');
    }
});

test('the speakers do not normalize, so the measured ears keep their level', () => {
    // The same reason the other measured stages set it: an HRIR arrives at the
    // level it was measured at, and the difference between the two ears is the
    // direction. Equal-power normalization would flatten both.
    const app = createApp();
    const { speakerLeft, speakerRight } = buildGraph(app);

    assert.equal(speakerLeft.normalize, false);
    assert.equal(speakerRight.normalize, false);
});

test('each speaker is fed its own side, with dry centred between them', () => {
    const app = createApp();
    const { speakerLeft, speakerRight, graph } = buildGraph(app);

    assert.ok(app.edgesTo(speakerLeft).some(e => e.from === graph.wetGainLeft));
    assert.ok(app.edgesTo(speakerRight).some(e => e.from === graph.wetGainRight));
    assert.ok(!app.edgesTo(speakerLeft).some(e => e.from === graph.wetGainRight),
        'a speaker must carry one side only, or the pair collapses to mono');

    assert.equal(pathCount(app, graph.dryGain, graph.binauralOut), 2,
        'dry reaches both speakers, exactly as it reaches both headphone channels');
});

test('the speakers stand at the angles the HRIRs were cut for', () => {
    // Nothing in the graph carries the angle any more — it is baked into the
    // two files — so this pins the pairing that decides which way round the
    // render comes out.
    const app = createApp();
    const { VIRTUAL_SPEAKER_HRIR, VIRTUAL_SPEAKER_AZIMUTH } = app.data;

    assert.equal(VIRTUAL_SPEAKER_AZIMUTH, 45, 'wider than a stereo listening triangle');
    assert.match(VIRTUAL_SPEAKER_HRIR.left, /virtual-speaker-left\.wav$/);
    assert.match(VIRTUAL_SPEAKER_HRIR.right, /virtual-speaker-right\.wav$/);
});

test('the speaker responses are fetched once and shared by every position', async () => {
    // They do not vary by church the way the impulse responses do, so refetching
    // them per play would be a download for nothing.
    const app = await readyToPlay(createApp());
    await app.g.startPlayback();
    await app.g.startPlayback();

    const fetched = app.net.log.filter(r => /virtual-speaker-/.test(r.url)).length;
    assert.equal(fetched, 2, 'one request per ear angle, for the life of the page');
});

test('a speaker response that will not load costs the mode, not the playback', async () => {
    const app = await readyToPlay(createApp());
    const server = app.net.respond.bind(app.net);
    app.net.respond = (url, opts) =>
        (/virtual-speaker-/.test(url) ? { ok: false, status: 404 } : server(url, opts));

    await app.g.startPlayback();

    assert.equal(app.state.isPlaying, true, 'the room still plays');
    assert.equal(app.state.activeGraph.binauralOut, null, 'the stage was not built');

    app.g.setBinauralEnabled(true);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1,
        'and the mode falls back to stereo rather than to silence');
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
    assert.equal(graph.binauralOut.gain.value, app.data.gainFromDb(app.data.BINAURAL_TRIM_DB));
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
    assert.equal(app.state.activeGraph.binauralOut.gain.value, app.data.gainFromDb(app.data.BINAURAL_TRIM_DB));
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
    assert.equal(app.state.activeGraph.binauralOut.gain.value, app.data.gainFromDb(app.data.BINAURAL_TRIM_DB),
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
    assert.ok(offline, 'no offline render happened');

    // Two for the IR pair and two more for the speakers: the render has to go
    // through the same virtual loudspeakers the mode is listened through.
    const convolvers = app.nodes.filter(n => n.kind === 'convolver' && n.ctxLabel === 'offline');
    assert.ok(convolvers.length >= 4, `only ${convolvers.length} convolvers offline`);
    assert.ok(convolvers.slice(2, 4).every(c => c.normalize === false),
        'the speaker responses must not be normalized here either');
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
    assert.equal(graph.brirOut.gain.value, app.data.gainFromDb(app.data.BRIR_TRIM_DB));
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
    assert.equal(graph.brirOut.gain.value, app.data.gainFromDb(app.data.BRIR_TRIM_DB));
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

test('all four modes are alternatives, not layers', async () => {
    const app = await readyToPlay(withAmbisonic(withBrir(createApp())));
    await app.g.startPlayback();

    app.g.setAmbisonicEnabled(true);
    assert.equal(app.state.ambisonicEnabled, true);
    assert.equal(app.state.brirEnabled, false);
    assert.equal(app.state.binauralEnabled, false);

    const graph = app.state.activeGraph;
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.binauralOut.gain.value, 0);
    assert.equal(graph.brirOut.gain.value, 0);
    assert.equal(graph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB));

    app.g.setBinauralEnabled(true);
    assert.equal(app.state.ambisonicEnabled, false, 'engaging another must release this one');
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
    assert.equal(app.el('ambisonic').disabled, true);
    assert.equal(app.el('ambisonic').title, app.data.AMBISONIC_TITLE_UNAVAILABLE);
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

test('a file-backed mode can be armed before playback has started', async () => {
    // Availability is read off the running graph, so gating on that alone left
    // both of these greyed out on a freshly loaded page with no way in: you
    // cannot press play *and* have already chosen how to listen.
    const app = await readyToPlay(withAmbisonic(withBrir(createApp())));
    assert.equal(app.state.activeGraph, null, 'nothing is playing yet');

    app.g.refreshModeButtons();
    assert.equal(app.el('brir').disabled, false, 'nothing has ruled this position out');
    assert.equal(app.el('ambisonic').disabled, false);

    app.g.setAmbisonicEnabled(true);
    await app.g.startPlayback();
    assert.equal(app.state.activeGraph.ambisonicOut.gain.value, app.data.gainFromDb(app.data.AMBISONIC_TRIM_DB),
        'the mode chosen while stopped should be the one that comes up');
});

test('a mode proved missing stays disabled after playback stops', async () => {
    const app = await readyToPlay(withoutDerived(createApp()));
    await app.g.startPlayback();
    app.g.stopPlayback();

    assert.equal(app.el('brir').disabled, true, 'this position is now known not to have one');
    assert.equal(app.el('ambisonic').disabled, true);
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

    app.g.setBinauralEnabled(true);
    assert.equal(box.disabled, true, 'the modelled render is fixed-head');
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

test('every mode toggle reports its own state, and only one is ever engaged', async () => {
    const app = await readyToPlay(withAmbisonic(withBrir(createApp())));
    await app.g.startPlayback();

    const engaged = () => ['binaural', 'brir', 'ambisonic']
        .filter(id => app.el(id).classList.contains('active'));

    assert.deepEqual(engaged(), [], 'stereo is no mode at all');

    for (const [id, turnOn] of [
        ['binaural', () => app.g.setBinauralEnabled(true)],
        ['brir', () => app.g.setBrirEnabled(true)],
        ['ambisonic', () => app.g.setAmbisonicEnabled(true)],
    ]) {
        turnOn();
        assert.deepEqual(engaged(), [id], `${id} should be the only lit button`);
        assert.equal(app.el(id)['aria-pressed'], 'true');
    }
});

// ── per-church stage levels ───────────────────────────────────────────────

/** What a stage's output gain should be for a given trim, in dB */
const gainAt = (app, db) => app.data.gainFromDb(db);

test('an uncalibrated church leaves every stage at its own level', () => {
    const app = createApp();
    app.g.setStageTrims(undefined);

    assert.equal(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, 1);
    assert.equal(buildGraph(app, { brir: true }).graph.brirOut.gain.value, 1);
    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('zero dB is no change, which is what an uncalibrated church means', () => {
    // The placeholder rows every church ships read as 0 dB. In decibels that is
    // literally "leave it alone" rather than a sentinel standing in for one.
    const app = createApp();
    app.g.setStageTrims({ binaural: 0, brir: 0, ambisonic: 0 });

    assert.equal(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, 1);
    assert.equal(buildGraph(app, { brir: true }).graph.brirOut.gain.value, 1);
    assert.equal(buildGraph(app, { ambisonic: true }).graph.ambisonicOut.gain.value, 1);
});

test('a church trim sets the stage level in dB', () => {
    const app = createApp();
    app.g.setStageTrims({ binaural: -6 });

    close(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value,
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

test('a trim moves only the stage it names', () => {
    // Three stages calibrated separately, because what each one misses by is a
    // property of that rendering and not of the room alone.
    const app = createApp();
    app.g.setStageTrims({ brir: -12 });

    const built = { withBrirPair: true, withBformat: true };
    close(buildGraph(app, { brir: true, ...built }).graph.brirOut.gain.value,
        gainAt(app, -12), 1e-12);
    assert.equal(buildGraph(app, { binaural: true, ...built }).graph.binauralOut.gain.value, 1,
        'a BRIR level must not move the modelled render');
    assert.equal(buildGraph(app, { ambisonic: true, ...built }).graph.ambisonicOut.gain.value, 1);
});

test('stereo carries no trim, being the reference the rest are matched to', () => {
    const app = createApp();
    app.g.setStageTrims({ binaural: -6, brir: -6, ambisonic: -6, stereo: -6 });

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
        app.g.setStageTrims({ binaural: bad });
        assert.equal(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, 1,
            `a trim of ${String(bad)} should be ignored`);
    }
});

test('a modest boost is a real answer, not a dropped minus sign', () => {
    // The virtual-loudspeaker render lands about a decibel under stereo: its
    // HRIRs convolve at the level they were measured at, and two speakers only
    // partly make that up. A one-sided guard would have refused the true value.
    const app = createApp();

    app.g.setStageTrims({ binaural: 1 });
    close(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value,
        app.data.gainFromDb(1), 1e-12);

    app.g.setStageTrims({ binaural: app.data.STAGE_TRIM_MAX_DB });
    assert.equal(app.g.stageTrimDb('binaural', 0), app.data.STAGE_TRIM_MAX_DB,
        'the top of the range is still usable');
});

test('a church trim reaches a live crossfade, not just a fresh graph', async () => {
    const app = await readyToPlay(withAmbisonic(withBrir(createApp())));
    await app.g.startPlayback();
    app.g.setStageTrims({ ambisonic: -16.5 });

    app.g.setAmbisonicEnabled(true);
    close(app.state.activeGraph.ambisonicOut.gain.value, gainAt(app, -16.5), 1e-12);
});

test('switching churches switches levels', () => {
    const app = createApp();

    app.g.setStageTrims({ binaural: -1 });
    close(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, gainAt(app, -1), 1e-12);

    app.g.setStageTrims({ binaural: -9 });
    close(buildGraph(app, { binaural: true }).graph.binauralOut.gain.value, gainAt(app, -9), 1e-12);
});

test('the fallbacks are 0 dB, so calibration starts from raw', () => {
    // Calibrating against a fallback that is already close to right is the hard
    // case: every value sounds nearly as plausible as the last, because the ear
    // has nothing to push away from. Untouched is plainly wrong in a known
    // direction, which is what makes the search converge.
    const { BINAURAL_TRIM_DB, BRIR_TRIM_DB, AMBISONIC_TRIM_DB } = createApp().data;

    for (const [name, db] of [['BINAURAL_TRIM_DB', BINAURAL_TRIM_DB],
                              ['BRIR_TRIM_DB', BRIR_TRIM_DB],
                              ['AMBISONIC_TRIM_DB', AMBISONIC_TRIM_DB]]) {
        assert.equal(db, 0, `${name} should leave an uncalibrated stage untouched`);
    }
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
