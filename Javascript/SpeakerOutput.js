/**
 * Loudspeaker playback of the B-format, behind the /5 feature flag
 *
 * A third output stage beside stereo and Headphones: the same four B-format
 * convolvers the headphone render decodes, decoded instead to five loudspeakers
 * and sent to whichever outputs of the audio interface the listener assigns.
 *
 *   convolver W ─┐
 *   convolver Y ─┼─ one gain each, per speaker ─► feed ×5 ─► speakerMerger ─► speakerOut
 *   convolver X ─┘                                 ▲           (one input per
 *   dryGain ───────────────────────────────────────┘ L, R       device output)
 *
 * Which merger input a feed lands on is the routing, and the only part of this
 * that depends on the hardware: an interface numbers its outputs however it
 * likes, so nothing here assumes where "left surround" is plugged in.
 *
 * Unlike the flags before it, this one reaches the engine as well as the page.
 * The stage needs the device opened wider than stereo, which is not something
 * to do to a visitor who never asked, so without the flag it is not built.
 *
 * @author Kritan Duwal
 */

/** The flag all of this sits behind; see Features.js */
const SPEAKER_FEATURE = '5';

/**
 * The loudspeakers, as ITU-R BS.775 places them, in the order the routing panel
 * lists them. Azimuth in degrees, positive to the LEFT, which is the way the
 * soundfield's Y axis points. `dry` marks the pair that carries the dry signal.
 *
 * A different rig is a different table: the decode is derived from the angles.
 */
const SPEAKERS = [
    { id: 'L',  label: 'Left',           azimuth: 30,   dry: true },
    { id: 'R',  label: 'Right',          azimuth: -30,  dry: true },
    { id: 'C',  label: 'Centre',         azimuth: 0 },
    { id: 'Ls', label: 'Left surround',  azimuth: 110 },
    { id: 'Rs', label: 'Right surround', azimuth: -110 },
];

const SPEAKER_COUNT = SPEAKERS.length;

// ── The decode ────────────────────────────────────────────────────────────

/**
 * How hard each feed leans on the directional channels against W. √2 is the
 * max-rE weighting for a horizontal ring: each speaker hears the soundfield
 * through a virtual supercardioid aimed where it stands. The textbook value of
 * 2 sharpens the image at one seat and falls apart a step away from it, with
 * loud out-of-phase feeds opposite every source.
 */
const SPEAKER_DIRECTIVITY = Math.SQRT2;

/**
 * Level of the decode, chosen so the five feeds together carry the power W
 * does in a horizontally diffuse field, where X and Y each hold half of it.
 * It is a convention, not a calibration: nothing has measured this stage
 * against stereo the way tools/measure-loudness.js measured the headphone one.
 */
const SPEAKER_DECODE_GAIN = 1 / Math.sqrt(SPEAKER_COUNT * (1 + SPEAKER_DIRECTIVITY ** 2 / 2));

/**
 * Gains one speaker applies to the AmbiX channels, in their order: W, Y, Z, X.
 *
 * Z is zero because every speaker is at ear height. The height the recording
 * holds is dropped rather than folded into the ring, where it would only be
 * heard as level.
 */
function speakerDecodeGains(azimuthDegrees) {
    const azimuth = azimuthDegrees * Math.PI / 180;
    const directional = SPEAKER_DECODE_GAIN * SPEAKER_DIRECTIVITY;

    return [
        SPEAKER_DECODE_GAIN,
        directional * Math.sin(azimuth),
        0,
        directional * Math.cos(azimuth),
    ];
}

// ── The device ────────────────────────────────────────────────────────────

/** A ChannelMergerNode takes no more inputs than this, whatever the device has */
const MAX_SPEAKER_OUTPUTS = 32;

/**
 * Outputs the current audio device offers. Asked each time rather than kept:
 * the answer changes when an interface is plugged in or the system default
 * moves, and a stale one would offer outputs that are not there.
 */
function speakerOutputCount() {
    const max = ctx.destination.maxChannelCount;
    return Number.isFinite(max) ? Math.min(max, MAX_SPEAKER_OUTPUTS) : 0;
}

/** Whether this visit has the stage and a device that can carry it */
function speakerStageOffered() {
    return featureEnabled(SPEAKER_FEATURE) && speakerOutputCount() >= SPEAKER_COUNT;
}

/**
 * Opens every output the device has, and returns how many, or 0 if it cannot
 * carry five. Everything that widens the device comes through here, so this is
 * where a visit without the flag is turned away.
 *
 * A context starts out driving two channels whatever is attached. Declared
 * discrete because these are sockets on an interface, not a speaker layout:
 * read as 5.1 the browser would be entitled to remix what it is handed.
 */
function openSpeakerOutputs() {
    if (!speakerStageOffered()) return 0;
    const outputs = speakerOutputCount();

    try {
        const destination = ctx.destination;
        if (destination.channelCount !== outputs) destination.channelCount = outputs;
        destination.channelInterpretation = 'discrete';
    } catch (err) {
        console.error(err);
        return 0;
    }
    return outputs;
}

// ── Routing ───────────────────────────────────────────────────────────────

/** Where the routing is kept between visits */
const SPEAKER_ROUTING_KEY = 'speakerRouting';

/** Output index for each of SPEAKERS, or null until a device has been asked */
let speakerRouting = null;

/**
 * Where the speakers most likely are. Six outputs or more is taken for the
 * usual surround order, L R C LFE Ls Rs, so the surrounds step over the
 * subwoofer's socket; exactly five has no socket to step over.
 */
function defaultSpeakerRouting(outputs) {
    return outputs > SPEAKER_COUNT ? [0, 1, 2, 4, 5] : [0, 1, 2, 3, 4];
}

/** Whether a routing gives every speaker an output of its own that exists */
function usableSpeakerRouting(routing, outputs) {
    return Array.isArray(routing) && routing.length === SPEAKER_COUNT
        && routing.every(output => Number.isInteger(output) && output >= 0 && output < outputs)
        && new Set(routing).size === SPEAKER_COUNT;
}

function storedSpeakerRouting() {
    try {
        return JSON.parse(localStorage.getItem(SPEAKER_ROUTING_KEY));
    } catch {
        return null;   // blocked or garbled storage is the same as none
    }
}

/**
 * The routing in force for a device with this many outputs: the listener's
 * own where it still fits, and the default where it does not. A routing saved
 * on an eight-output interface names sockets a six-output one does not have.
 */
function currentSpeakerRouting(outputs = speakerOutputCount()) {
    if (!usableSpeakerRouting(speakerRouting, outputs)) {
        const stored = storedSpeakerRouting();
        speakerRouting = usableSpeakerRouting(stored, outputs) ? stored : defaultSpeakerRouting(outputs);
    }
    return speakerRouting;
}

/**
 * Sends one speaker to one output, live.
 *
 * An output already taken is swapped rather than shared: two feeds summed onto
 * one socket is never what was meant, and it leaves another speaker silent with
 * nothing on screen to say why.
 */
function setSpeakerRoute(speaker, output) {
    const outputs = speakerOutputCount();
    if (!SPEAKERS[speaker] || !Number.isInteger(output) || output < 0 || output >= outputs) return;

    const routing = currentSpeakerRouting(outputs).slice();
    const previous = routing[speaker];
    const holder = routing.indexOf(output);
    if (holder !== -1 && holder !== speaker) routing[holder] = previous;
    routing[speaker] = output;
    speakerRouting = routing;

    try {
        localStorage.setItem(SPEAKER_ROUTING_KEY, JSON.stringify(routing));
    } catch {
        // Not remembered next visit; it still holds for this one
    }

    if (activeGraph && activeGraph.speakerFeeds) {
        for (const moved of new Set([speaker, holder])) {
            const feed = activeGraph.speakerFeeds[moved];
            if (!feed) continue;
            feed.disconnect();
            feed.connect(activeGraph.speakerMerger, 0, routing[moved]);
        }
    }

    renderSpeakerRouting();
}

// ── The stage ─────────────────────────────────────────────────────────────

/**
 * What startPlayback() should build, or null for no speaker stage at all:
 * { outputs, routing, live }. Opens the device as a side effect, since a merger
 * wider than the destination would be mixed back down on the way out.
 */
function speakerStageRequest() {
    const outputs = openSpeakerOutputs();
    if (!outputs) return null;

    return { outputs, routing: currentSpeakerRouting(outputs), live: speakersEnabled };
}

/**
 * Decodes the B-format convolvers to the five speakers and seats each feed on
 * its output. Returns the nodes the engine keeps: the stage fader, and the
 * feeds and merger a routing change reconnects.
 *
 * The dry goes to left and right at the level the stereo stage sends it, so
 * the mix slider means the same thing here, and at 0% the two stages are the
 * same signal on the same two speakers.
 */
function buildSpeakerStage(audioCtx, { convolvers, dryGain, outputs, routing }) {
    const speakerMerger = audioCtx.createChannelMerger(outputs);
    const speakerOut = audioCtx.createGain();

    const speakerFeeds = SPEAKERS.map((speaker, index) => {
        const feed = audioCtx.createGain();
        feed.gain.value = speakerFeedGain(index);

        speakerDecodeGains(speaker.azimuth).forEach((gain, channel) => {
            if (gain === 0) return;
            const tap = audioCtx.createGain();
            tap.gain.value = gain;
            convolvers[channel].connect(tap);
            tap.connect(feed);
        });

        if (speaker.dry) dryGain.connect(feed);
        feed.connect(speakerMerger, 0, routing[index]);
        return feed;
    });

    speakerMerger.connect(speakerOut);
    return { speakerOut, speakerMerger, speakerFeeds };
}

/** Whether the speaker stage is the one that should be heard; see onHeadphoneStage() */
function onSpeakerStage(graph) {
    return speakersEnabled && Boolean(graph.speakerOut);
}

// ── The mode ──────────────────────────────────────────────────────────────

const SPEAKERS_TITLE_ON =
    "Speakers: on. The church is playing over five loudspeakers around you. Click to go back to regular stereo.";
const SPEAKERS_TITLE_OFF =
    "Speakers: off. Turn on to play the church over five loudspeakers: left, right, centre and two surrounds.";
const SPEAKERS_TITLE_UNAVAILABLE =
    "Speakers: unavailable. This church does not have the recordings needed for spatial audio.";

/** Says what the device is short of, since nothing else on the page can */
function speakersTitleNoOutputs(outputs) {
    return `Speakers: unavailable. This needs an audio device with at least ${SPEAKER_COUNT} outputs, ` +
        `and the current one offers ${outputs}.`;
}

/** Whether playback leaves through the loudspeaker stage */
let speakersEnabled = false;

/**
 * Whether the speaker stage can be engaged: the flag, a device wide enough,
 * and a B-format to decode. It shares the headphone render's convolvers, so it
 * is offered at exactly the churches that render is.
 */
function speakersAvailable() {
    if (!speakerStageOffered()) return false;
    if (activeGraph) return Boolean(activeGraph.speakerOut);
    return ambisonicAvailable();
}

function setSpeakersEnabled(enabled) {
    // Refused here rather than in the DOM, as setAmbisonicEnabled() does
    if (enabled && !speakersAvailable()) return;

    speakersEnabled = enabled;
    // Alternatives, not layers: both up would play the room twice
    if (enabled) ambisonicEnabled = false;

    refreshModeButtons();
    applyOutputStage();
    syncSoundfieldTracking();
}

function toggleSpeakers() {
    setSpeakersEnabled(!speakersEnabled);
}

/** Reflects the mode on its button, and shows the routing while it is on */
function updateSpeakersControl() {
    const btn = document.getElementById('speakers');
    if (!btn) return;

    const available = speakersAvailable();
    const on = speakersEnabled && available;
    const outputs = speakerOutputCount();

    btn.classList.toggle('active', on);
    btn.setAttribute('aria-disabled', String(!available));
    btn.setAttribute('aria-pressed', String(on));
    btn.title = outputs < SPEAKER_COUNT ? speakersTitleNoOutputs(outputs)
        : !available ? SPEAKERS_TITLE_UNAVAILABLE
        : speakersEnabled ? SPEAKERS_TITLE_ON : SPEAKERS_TITLE_OFF;

    const panel = document.getElementById('speaker-routing');
    if (panel) panel.classList.toggle('open', on);

    // A solo outlives the panel it was set from only as a speaker stage with
    // four feeds silent and nothing on screen to say why
    if (!on) setSpeakerSolo(null);
    if (on) renderSpeakerRouting();
}

// ── The routing panel ─────────────────────────────────────────────────────

/**
 * Draws one row per speaker: its name, the output it plays from, and a button
 * that solos it. Redrawn whole on every change, because a swap moves two rows
 * and the list of outputs is only as long as the device attached right now.
 */
function renderSpeakerRouting() {
    const rows = document.getElementById('speaker-routing-rows');
    if (!rows) return;

    const outputs = speakerOutputCount();
    const routing = currentSpeakerRouting(outputs);
    rows.innerHTML = '';

    SPEAKERS.forEach((speaker, index) => {
        const row = document.createElement('div');
        row.className = 'speaker-route';

        const select = document.createElement('select');
        select.id = 'speaker-route-' + speaker.id;
        for (let output = 0; output < outputs; output++) {
            const option = document.createElement('option');
            option.value = String(output);
            option.textContent = 'Output ' + (output + 1);
            select.appendChild(option);
        }
        select.value = String(routing[index]);
        select.onchange = () => setSpeakerRoute(index, Number(select.value));

        const label = document.createElement('label');
        label.htmlFor = select.id;
        label.textContent = speaker.label;

        const soloed = speakerSolo === index;
        const solo = document.createElement('button');
        solo.type = 'button';
        solo.className = soloed ? 'speaker-solo active' : 'speaker-solo';
        solo.textContent = 'Solo';
        solo.setAttribute('aria-pressed', String(soloed));
        solo.title = soloed
            ? `Only the ${speaker.label.toLowerCase()} speaker is playing. Click to bring the others back.`
            : `Play the ${speaker.label.toLowerCase()} speaker on its own, from the output chosen here.`;
        solo.onclick = () => toggleSpeakerSolo(index);

        row.appendChild(label);
        row.appendChild(select);
        row.appendChild(solo);
        rows.appendChild(row);
    });
}

// ── Finding out which output is which ─────────────────────────────────────

/** Index into SPEAKERS of the one speaker left playing, or null for all five */
let speakerSolo = null;

/** Seconds a feed takes to come or go, short of a click as a stage crossfade is */
const SPEAKER_SOLO_GLIDE = 0.02;

/** What a speaker's feed should be at: silent only while another is soloed */
function speakerFeedGain(speaker) {
    return speakerSolo === null || speakerSolo === speaker ? 1 : 0;
}

/**
 * Leaves one speaker playing its own part of the church and silences the other
 * four, or with null brings them all back.
 *
 * What is heard is that speaker's real feed on the output it is routed to, so
 * the routing is checked with the signal it will actually carry. The gains sit
 * on the feeds, ahead of the merger, which is why a solo follows its speaker
 * when the route is changed under it.
 */
function setSpeakerSolo(speaker) {
    if (speaker !== null && !SPEAKERS[speaker]) return;
    if (speaker === speakerSolo) return;
    speakerSolo = speaker;

    if (activeGraph && activeGraph.speakerFeeds) {
        activeGraph.speakerFeeds.forEach((feed, index) =>
            rampGain(feed.gain, speakerFeedGain(index), SPEAKER_SOLO_GLIDE));
    }
}

/**
 * The Solo button: solos a speaker, or releases it if it already is. Starts
 * playback if nothing is running, since a solo of silence answers nothing.
 */
async function toggleSpeakerSolo(speaker) {
    setSpeakerSolo(speakerSolo === speaker ? null : speaker);
    renderSpeakerRouting();

    if (speakerSolo !== null && !isPlaying) await startPlayback();
}
