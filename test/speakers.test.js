'use strict';
/**
 * SpeakerOutput.js — the loudspeaker stage behind /5: the decode, the routing
 * of each speaker to a device output, and the fact that none of it happens to
 * a visit that did not ask.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

const close = (actual, expected, tolerance = 1e-9, msg) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        msg || `expected ${actual} to be within ${tolerance} of ${expected}`);

/** Copies an array out of the app's vm realm, which deepStrictEqual needs */
const plain = (arrayLike) => Array.from(arrayLike);

const PLAYABLE_BASE = 'IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R1-';
const PLAYABLE_DECODED = 'IR/Monastery Immaculate Conception, IN/Not Normalized/MIC_IN_R1-';

/**
 * An app at /5 with an interface attached, at a position with a B-format to
 * decode. Every part of that is overridable, because each is a way for the
 * stage not to exist.
 */
function speakerApp({ path = '/5', outputs = 8, decodedBase = PLAYABLE_DECODED, ...rest } = {}) {
    const app = createApp({ path, outputs, ...rest });

    const server = app.net.respond.bind(app.net);
    app.net.respond = (url, opts) => (/-Bformat\.wav$/.test(url)
        ? { ok: true, status: 200, channels: 4 }
        : server(url, opts));

    app.loadFakeSource();
    app.g.setImpulseResponse(PLAYABLE_BASE, 0, decodedBase);
    return app;
}

/** The merger input each speaker's feed is currently seated on */
function seats(app) {
    const { speakerFeeds, speakerMerger } = app.state.activeGraph;
    return plain(speakerFeeds).map(feed => app.edgesTo(speakerMerger).filter(e => e.from === feed).pop().input);
}

/** What one speaker plays for a plane wave arriving from `azimuth` degrees, positive left */
function feedFor(app, speaker, azimuth) {
    const a = azimuth * Math.PI / 180;
    const wave = [1, Math.sin(a), 0, Math.cos(a)];   // AmbiX: W, Y, Z, X
    return app.g.speakerDecodeGains(speaker.azimuth).reduce((sum, gain, ch) => sum + gain * wave[ch], 0);
}

const feedsFor = (app, azimuth) =>
    Object.fromEntries(app.data.SPEAKERS.map(s => [s.id, feedFor(app, s, azimuth)]));

// ── the decode ────────────────────────────────────────────────────────────

test('there are five speakers, and the dry goes to the front pair only', () => {
    const { SPEAKERS, SPEAKER_COUNT } = createApp().data;
    assert.equal(SPEAKER_COUNT, 5);
    assert.deepEqual(plain(SPEAKERS).map(s => s.id), ['L', 'R', 'C', 'Ls', 'Rs']);
    assert.deepEqual(plain(SPEAKERS).filter(s => s.dry).map(s => s.id), ['L', 'R']);
});

test('a source in front is loudest in the centre and even between left and right', () => {
    const feeds = feedsFor(createApp(), 0);
    assert.ok(feeds.C > feeds.L && feeds.L > feeds.Ls);
    close(feeds.L, feeds.R);
    close(feeds.Ls, feeds.Rs);
});

test('a source to the left plays from the left, which is where +Y points', () => {
    // A sign error here mirrors the whole room and sounds entirely plausible
    const feeds = feedsFor(createApp(), 90);
    assert.ok(feeds.L > feeds.R, 'front pair');
    assert.ok(feeds.Ls > feeds.Rs, 'surround pair');
    assert.ok(feeds.Ls > feeds.C, 'and it sits behind the centre line of the front three');
});

test('a source behind is carried by the surrounds', () => {
    const feeds = feedsFor(createApp(), 180);
    for (const front of ['L', 'R', 'C']) {
        assert.ok(feeds.Ls > Math.abs(feeds[front]), `Ls should outweigh ${front}`);
    }
    close(feeds.Ls, feeds.Rs);
});

test('height is dropped, since every speaker is at ear level', () => {
    const app = createApp();
    for (const speaker of app.data.SPEAKERS) {
        assert.equal(app.g.speakerDecodeGains(speaker.azimuth)[2], 0, `${speaker.id} must ignore Z`);
    }
});

test('the five feeds together carry the power W does in a diffuse field', () => {
    // In a horizontally diffuse field W, X and Y are uncorrelated and X and Y
    // each hold half of W's power
    const app = createApp();
    const power = plain(app.data.SPEAKERS).reduce((sum, speaker) => {
        const [w, y, , x] = app.g.speakerDecodeGains(speaker.azimuth);
        return sum + w * w + (y * y + x * x) / 2;
    }, 0);
    close(power, 1, 1e-12);
});

// ── none of it without the flag ───────────────────────────────────────────

test('a plain visit never has the speaker stage built, whatever is plugged in', async () => {
    const app = speakerApp({ path: '/' });
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    assert.equal(graph.speakerOut, null);
    assert.ok(graph.ambisonicOut, 'the headphone stage is unaffected');
    assert.equal(app.nodes.filter(n => n.kind === 'merger' && n.inputs > 4).length, 0);
});

test('a plain visit leaves the audio device as it found it', async () => {
    // Opening an interface to all its channels is not something to do unasked
    const app = speakerApp({ path: '/' });
    await app.g.startPlayback();
    await app.g.toggleSpeakerSolo(0);

    assert.equal(app.ctx.destination.channelCount, 2);
    assert.equal(app.ctx.destination.channelInterpretation, 'speakers');
    assert.notEqual(app.state.activeGraph.output.channelInterpretation, 'discrete');
});

test('a plain visit cannot switch the mode on, even by calling the engine', async () => {
    const app = speakerApp({ path: '/' });
    await app.g.startPlayback();

    app.g.setSpeakersEnabled(true);

    assert.equal(app.state.speakersEnabled, false);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
});

// ── the stage ─────────────────────────────────────────────────────────────

test('at /5 the stage is built beside the other two, and stereo is still the one heard', async () => {
    const app = speakerApp();
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    assert.equal(graph.stereoOut.gain.value, 1);
    assert.equal(graph.ambisonicOut.gain.value, 0);
    assert.equal(graph.speakerOut.gain.value, 0);
    assert.equal(graph.speakerFeeds.length, 5);
});

test('the device is opened to every output it has, as sockets rather than a layout', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    assert.equal(app.ctx.destination.channelCount, 8);
    assert.equal(app.ctx.destination.channelInterpretation, 'discrete');
    assert.equal(graph.speakerMerger.inputs, 8, 'one merger input per device output');
    assert.equal(graph.output.channelInterpretation, 'discrete',
        'or the stereo stages could be spread across the extra outputs');
});

test('the stage reaches the destination through its own fader', async () => {
    const app = speakerApp();
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    assert.ok(app.edgesFrom(graph.speakerMerger).some(e => e.to === graph.speakerOut));
    assert.ok(app.edgesFrom(graph.speakerOut).some(e => e.to === graph.output));
});

test('each feed sums the B-format convolvers by that speaker’s decode gains', async () => {
    const app = speakerApp();
    await app.g.startPlayback();

    // The IR pair first, then W, Y, Z, X
    const bformat = app.nodes.filter(n => n.kind === 'convolver').slice(2, 6);
    const { speakerFeeds } = app.state.activeGraph;

    plain(app.data.SPEAKERS).forEach((speaker, index) => {
        const gains = [0, 0, 0, 0];
        for (const edge of app.edgesTo(speakerFeeds[index])) {
            const from = app.edgesTo(edge.from).map(e => bformat.indexOf(e.from)).find(ch => ch !== -1);
            if (from !== undefined) gains[from] += edge.from.gain.value;
        }
        const expected = plain(app.g.speakerDecodeGains(speaker.azimuth));
        gains.forEach((gain, ch) => close(gain, expected[ch], 1e-12, `${speaker.id} channel ${ch}`));
    });
});

test('the dry reaches left and right directly, and no other speaker', async () => {
    const app = speakerApp();
    await app.g.startPlayback();

    const { speakerFeeds, dryGain } = app.state.activeGraph;
    const fed = plain(speakerFeeds).map(feed => app.edgesTo(feed).some(e => e.from === dryGain));
    assert.deepEqual(fed, [true, true, false, false, false]);
});

test('toggling crossfades the live graph instead of rebuilding it', async () => {
    const app = speakerApp();
    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    const source = app.state.source;
    const nodesBefore = app.nodes.length;

    app.g.toggleSpeakers();

    assert.equal(app.state.speakersEnabled, true);
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.speakerOut.gain.value, 1);
    assert.deepEqual(graph.speakerOut.gain._ramps.pop(), [1, app.data.STAGE_CROSSFADE]);
    assert.equal(app.state.activeGraph, graph);
    assert.equal(app.nodes.length, nodesBefore, 'no new nodes should be created');
    assert.equal(source.stopped, false, 'playback must not be interrupted');

    app.g.toggleSpeakers();
    assert.equal(graph.stereoOut.gain.value, 1);
    assert.equal(graph.speakerOut.gain.value, 0);
});

test('speakers and headphones are alternatives, whichever was pressed last', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    const graph = app.state.activeGraph;
    const live = () => [graph.stereoOut, graph.ambisonicOut, graph.speakerOut].map(n => n.gain.value);

    app.g.setAmbisonicEnabled(true);
    app.g.setSpeakersEnabled(true);
    assert.equal(app.state.ambisonicEnabled, false);
    assert.deepEqual(live(), [0, 0, 1]);

    app.g.setAmbisonicEnabled(true);
    assert.equal(app.state.speakersEnabled, false);
    assert.deepEqual(live(), [0, 1, 0]);
    assert.equal(app.el('speakers').classList.contains('active'), false);
});

test('the mode can be armed before playback, and the graph is then built live', async () => {
    const app = speakerApp();
    app.g.setSpeakersEnabled(true);
    assert.equal(app.state.speakersEnabled, true);

    await app.g.startPlayback();

    const graph = app.state.activeGraph;
    assert.equal(graph.stereoOut.gain.value, 0);
    assert.equal(graph.speakerOut.gain.value, 1);
});

test('head tracking is not offered over speakers, where the listener turns for themselves', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.setAmbisonicEnabled(true);
    app.g.setSoundfieldTracking(true);

    app.g.setSpeakersEnabled(true);

    assert.equal(app.el('tracking').disabled, true);
    assert.equal(app.frames.pending, 0, 'the rotation loop should have stopped');
});

// ── where it is not available ─────────────────────────────────────────────

test('a device with fewer than five outputs cannot carry it, and the button says how many it has', async () => {
    const app = speakerApp({ outputs: 2 });
    await app.g.startPlayback();
    app.g.setSpeakersEnabled(true);

    assert.equal(app.state.speakersEnabled, false);
    assert.equal(app.state.activeGraph.speakerOut, null);
    assert.equal(app.ctx.destination.channelCount, 2);
    assert.equal(app.el('speakers')['aria-disabled'], 'true');
    assert.match(app.el('speakers').title, /at least 5 outputs.*offers 2/);
});

test('a church with nothing to decode has no speaker stage either', async () => {
    const app = speakerApp({ decodedBase: '' });
    app.g.refreshModeButtons();
    assert.equal(app.el('speakers').title, app.data.SPEAKERS_TITLE_UNAVAILABLE);

    await app.g.startPlayback();
    app.g.setSpeakersEnabled(true);

    assert.equal(app.state.speakersEnabled, false);
    assert.equal(app.state.activeGraph.speakerOut, null);
    assert.equal(app.state.activeGraph.stereoOut.gain.value, 1);
});

test('the button reports the mode it is in', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    const btn = app.el('speakers');

    assert.equal(btn.title, app.data.SPEAKERS_TITLE_OFF);
    assert.equal(btn['aria-pressed'], 'false');
    assert.equal(btn['aria-disabled'], 'false');

    app.g.toggleSpeakers();
    assert.equal(btn.title, app.data.SPEAKERS_TITLE_ON);
    assert.equal(btn['aria-pressed'], 'true');
    assert.ok(btn.classList.contains('active'));
});

// ── routing ───────────────────────────────────────────────────────────────

test('six outputs or more are taken for surround order, stepping over the subwoofer', () => {
    const app = createApp();
    assert.deepEqual(plain(app.g.defaultSpeakerRouting(6)), [0, 1, 2, 4, 5]);
    assert.deepEqual(plain(app.g.defaultSpeakerRouting(8)), [0, 1, 2, 4, 5]);
    assert.deepEqual(plain(app.g.defaultSpeakerRouting(5)), [0, 1, 2, 3, 4],
        'five outputs have no socket to step over');
});

test('each feed is seated on the output its speaker is routed to', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();
    assert.deepEqual(seats(app), [0, 1, 2, 4, 5]);
});

test('a route can be changed while playing, without touching anything else', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();
    const graph = app.state.activeGraph;
    const source = app.state.source;

    app.g.setSpeakerRoute(2, 7);   // centre to output 8

    assert.deepEqual(seats(app), [0, 1, 7, 4, 5]);
    assert.ok(app.edges.some(e => e.from === graph.speakerFeeds[2] && e.disconnected),
        'the old seat has to be given up, or the centre plays from both');
    assert.equal(app.edges.filter(e => e.from === graph.speakerFeeds[0] && e.disconnected).length, 0);
    assert.equal(app.state.activeGraph, graph);
    assert.equal(source.stopped, false);
});

test('choosing an output another speaker holds swaps the two', async () => {
    // Shared, one speaker would go silent with nothing on screen to say why
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();

    app.g.setSpeakerRoute(0, 1);   // left onto right's output

    assert.deepEqual(plain(app.state.speakerRouting), [1, 0, 2, 4, 5]);
    assert.deepEqual(seats(app), [1, 0, 2, 4, 5]);
});

test('a route to an output the device does not have is refused', () => {
    const app = speakerApp({ outputs: 6 });
    for (const output of [6, -1, 1.5, NaN]) app.g.setSpeakerRoute(0, output);
    app.g.setSpeakerRoute(9, 0);

    assert.deepEqual(plain(app.g.currentSpeakerRouting()), [0, 1, 2, 4, 5]);
});

test('the routing is remembered for the next visit', async () => {
    const storage = {};
    const first = speakerApp({ storage });
    first.g.setSpeakerRoute(3, 6);
    first.g.setSpeakerRoute(4, 7);

    const second = speakerApp({ storage });
    await second.g.startPlayback();

    assert.deepEqual(seats(second), [0, 1, 2, 6, 7]);
});

test('a remembered routing that does not fit this device gives way to the default', () => {
    // Saved on an eight-output interface, opened on a six-output one
    const { SPEAKER_ROUTING_KEY } = createApp().data;
    const unfit = ['[0,1,2,6,7]', '[0,0,2,4,5]', '[0,1,2]', 'not json', '{"0":1}'];

    for (const saved of unfit) {
        const app = speakerApp({ outputs: 6, storage: { [SPEAKER_ROUTING_KEY]: saved } });
        assert.deepEqual(plain(app.g.currentSpeakerRouting()), [0, 1, 2, 4, 5], saved);
    }
});

test('storage that is blocked costs the memory, not the routing', async () => {
    const app = speakerApp({ storageFails: true });
    await app.g.startPlayback();

    app.g.setSpeakerRoute(2, 3);

    assert.deepEqual(seats(app), [0, 1, 3, 4, 5]);
});

// ── the routing panel ─────────────────────────────────────────────────────

/** The rows as last drawn; the stub DOM keeps earlier ones, as a real one would not */
const rowsOf = (app) => app.el('speaker-routing-rows').children.slice(-5);
const selectOf = (row) => row.children[1];

test('the panel is open only while the mode is on', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    const panel = app.el('speaker-routing');

    assert.equal(panel.classList.contains('open'), false);
    app.g.toggleSpeakers();
    assert.equal(panel.classList.contains('open'), true);
    app.g.toggleSpeakers();
    assert.equal(panel.classList.contains('open'), false);
});

test('the panel lists every speaker against every output the device has', async () => {
    const app = speakerApp({ outputs: 6 });
    app.g.setSpeakersEnabled(true);

    const rows = rowsOf(app);
    assert.deepEqual(rows.map(row => row.children[0].textContent),
        ['Left', 'Right', 'Centre', 'Left surround', 'Right surround']);
    for (const row of rows) {
        assert.deepEqual(selectOf(row).children.map(o => o.textContent),
            ['Output 1', 'Output 2', 'Output 3', 'Output 4', 'Output 5', 'Output 6']);
    }
    assert.deepEqual(rows.map(row => selectOf(row).value), ['0', '1', '2', '4', '5']);
});

test('picking an output in the panel is what moves the speaker', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();
    app.g.toggleSpeakers();

    const select = selectOf(rowsOf(app)[3]);   // left surround
    select.value = '6';
    select.onchange();

    assert.deepEqual(seats(app), [0, 1, 2, 6, 5]);
    assert.deepEqual(rowsOf(app).map(row => selectOf(row).value), ['0', '1', '2', '6', '5'],
        'the panel is redrawn, so a swap shows on both rows it moved');
});

// ── soloing a speaker ─────────────────────────────────────────────────────

const soloOf = (row) => row.children[2];
const feedLevels = (app) => plain(app.state.activeGraph.speakerFeeds).map(feed => feed.gain.value);

test('every feed plays until one is soloed', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    assert.deepEqual(feedLevels(app), [1, 1, 1, 1, 1]);
});

test('Solo leaves that speaker’s own feed playing and silences the rest', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();
    app.g.toggleSpeakers();
    const graph = app.state.activeGraph;
    const nodesBefore = app.nodes.length;

    await soloOf(rowsOf(app)[3]).onclick();   // left surround

    assert.equal(app.state.speakerSolo, 3);
    assert.deepEqual(feedLevels(app), [0, 0, 0, 1, 0]);
    assert.deepEqual(seats(app), [0, 1, 2, 4, 5], 'it plays from the output it was already routed to');
    assert.equal(app.nodes.length, nodesBefore, 'the real feed, not a signal made for the occasion');
    assert.equal(app.state.activeGraph, graph);
});

test('a solo glides, as every other gain change here does', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.toggleSpeakers();

    app.g.setSpeakerSolo(0);

    const muted = app.state.activeGraph.speakerFeeds[1].gain;
    assert.deepEqual(plain(muted._ramps.pop()), [0, app.data.SPEAKER_SOLO_GLIDE]);
});

test('pressing Solo again brings the others back', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.toggleSpeakers();

    await app.g.toggleSpeakerSolo(2);
    await app.g.toggleSpeakerSolo(2);

    assert.equal(app.state.speakerSolo, null);
    assert.deepEqual(feedLevels(app), [1, 1, 1, 1, 1]);
});

test('soloing another speaker moves the solo rather than adding to it', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.toggleSpeakers();

    await app.g.toggleSpeakerSolo(0);
    await app.g.toggleSpeakerSolo(4);

    assert.deepEqual(feedLevels(app), [0, 0, 0, 0, 1]);
});

test('the Solo button shows which speaker is soloed', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.toggleSpeakers();

    await app.g.toggleSpeakerSolo(1);

    const buttons = rowsOf(app).map(soloOf);
    assert.deepEqual(buttons.map(b => b['aria-pressed']), ['false', 'true', 'false', 'false', 'false']);
    assert.match(buttons[1].className, /active/);
    assert.doesNotMatch(buttons[0].className, /active/);
});

test('Solo starts the church if nothing is playing', async () => {
    // A solo of silence answers nothing about the wiring
    const app = speakerApp();
    app.g.setSpeakersEnabled(true);
    assert.equal(app.state.isPlaying, false);

    await app.g.toggleSpeakerSolo(2);

    assert.equal(app.state.isPlaying, true);
    assert.deepEqual(feedLevels(app), [0, 0, 1, 0, 0], 'and the graph is built already soloed');
    assert.equal(app.state.activeGraph.speakerOut.gain.value, 1);
});

test('releasing a solo does not stop playback', async () => {
    const app = speakerApp();
    app.g.setSpeakersEnabled(true);
    await app.g.toggleSpeakerSolo(2);
    await app.g.toggleSpeakerSolo(2);

    assert.equal(app.state.isPlaying, true);
});

test('a solo follows its speaker when the route is changed under it', async () => {
    const app = speakerApp({ outputs: 8 });
    await app.g.startPlayback();
    app.g.toggleSpeakers();
    await app.g.toggleSpeakerSolo(0);

    app.g.setSpeakerRoute(0, 3);   // left: output 1 to output 4

    assert.deepEqual(feedLevels(app), [1, 0, 0, 0, 0]);
    assert.equal(seats(app)[0], 3);
});

test('a solo survives the restart a receiver change causes', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.toggleSpeakers();
    await app.g.toggleSpeakerSolo(4);

    await app.g.startPlayback();   // as compile() restarts it

    assert.deepEqual(feedLevels(app), [0, 0, 0, 0, 1]);
});

test('leaving the mode releases the solo, by either button', async () => {
    // Otherwise the next visit to the stage has four speakers silent and no
    // panel open to say why
    for (const leave of [app => app.g.toggleSpeakers(), app => app.g.setAmbisonicEnabled(true)]) {
        const app = speakerApp();
        await app.g.startPlayback();
        app.g.toggleSpeakers();
        await app.g.toggleSpeakerSolo(1);

        leave(app);

        assert.equal(app.state.speakerSolo, null);
        assert.deepEqual(feedLevels(app), [1, 1, 1, 1, 1]);
    }
});

test('a speaker that does not exist cannot be soloed', async () => {
    const app = speakerApp();
    await app.g.startPlayback();
    app.g.setSpeakerSolo(7);

    assert.equal(app.state.speakerSolo, null);
    assert.deepEqual(feedLevels(app), [1, 1, 1, 1, 1]);
});

test('nothing is left of the test signal Solo replaced', () => {
    const app = createApp();
    assert.equal(typeof app.g.testSpeaker, 'undefined');
});
