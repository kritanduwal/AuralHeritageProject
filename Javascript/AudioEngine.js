/**
 * Audio routing, processing, and playback
 *
 * A dry copy of the source is mixed against a convolved ("wet") copy of it,
 * using the impulse response recorded at the selected receiver position. The
 * result leaves by one of two output stages: a stereo pair, or the live
 * ambisonic decode the Headphones button engages. See "Reverb ratios" and
 * "Headphones" in README.md. A third, for loudspeakers, exists only behind the
 * /5 flag and lives in SpeakerOutput.js.
 *
 * @author Ben Jordan, Kritan Duwal
 */

const ctx = new AudioContext();

/** Source file to load on startup; matches the label in index.html */
const DEFAULT_SOURCE_FILE = 'Source Files/Clarinet.wav';

let sourceBuffer = null;  // decoded source audio (instrument, choir, sermon…)
let source = null;        // the running BufferSource, or null while stopped
let activeGraph = null;   // gain nodes of the running graph, kept for retuning and teardown
let isPlaying = false;

/**
 * The files the next play will use, set by compile() when the selection changes.
 * `base` completes with "1.wav"/"2.wav" for the stereo pair every church
 * publishes; `decodedBase` reaches the originals only a few have, and is empty
 * where there is nothing to decode.
 */
let currentIr = { base: "", decodedBase: "", gainDb: 0 };

function setImpulseResponse(base, gainDb, decodedBase = "") {
    currentIr = { base, decodedBase, gainDb };
}

// ── Gain automation ───────────────────────────────────────────────────────

/**
 * Glides a gain to a new value, starting from where it actually is now.
 *
 * linearRampToValueAtTime() interpolates from the previous automation event,
 * not from the present, so without pinning the current value at the current
 * time every glide after the first leaps most of the way in one sample and
 * creeps out the remainder. That step is a click, on every change but the first.
 */
function rampGain(param, value, seconds) {
    const now = ctx.currentTime;
    const current = param.value;   // read before cancelling, which discards pending events

    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(value, now + seconds);
}

// ── Wet / dry mix ─────────────────────────────────────────────────────────

/** Wet/dry balance: 0 plays the bare source, 1 the full room. */
let convolutionMix = 1.0;

/** Seconds spent gliding to a new slider position */
const MIX_GLIDE = 0.05;

/** Dry gain at a fully wet mix, i.e. the bottom of the dry taper (-9.1 dB) */
const DRY_GAIN_AT_FULL_WET = 0.35;

/**
 * Dry-path gain for a given wet mix: unity through the first 10% of the slider,
 * then falling linearly in dB. The wet follows the slider directly, so the dry
 * has to give way or the two summed get louder toward the wet end.
 */
function dryGainFor(mix) {
    return Math.min(1.0, Math.pow(DRY_GAIN_AT_FULL_WET, (10 * mix - 1) / 9));
}

/** A signed level in dB as a linear gain: 0 is unity, negative is quieter. */
function gainFromDb(db) {
    return Math.pow(10, db / 20);
}

/** Sets the convolution mix amount, gliding to avoid zipper noise */
function setConvolutionMix(mix) {
    convolutionMix = mix;
    if (!activeGraph) return;

    rampGain(activeGraph.dryGain.gain, dryGainFor(mix), MIX_GLIDE);
    rampGain(activeGraph.wetGainLeft.gain, mix, MIX_GLIDE);
    rampGain(activeGraph.wetGainRight.gain, mix, MIX_GLIDE);

    if (activeGraph.ambiWet) {
        rampGain(activeGraph.ambiWet.gain, ambisonicWetGain(mix), MIX_GLIDE);
    }
}

// ── Headphone rendering: the live ambisonic decode (Omnitone) ─────────────

/**
 * The second output stage: the B-format impulse response decoded to binaural
 * in the browser.
 *
 * Decoding live rather than offline keeps the soundfield in ambisonic form up
 * to the ears, which is the only arrangement head tracking can rotate.
 *
 *   splitter ─┬─ convAmbi W ─┐
 *             ├─ convAmbi Y  ├─► ambiMerger (4ch) ─► FOARenderer ─► ambisonicOut
 *             ├─ convAmbi Z  │
 *             └─ convAmbi X ─┘
 */

/** Completes currentIr.decodedBase for the 4-channel AmbiX file the tools write */
const BFORMAT_SUFFIX = "Bformat.wav";

/**
 * Channel map handed to Omnitone: identity, because the files are already AmbiX.
 *
 * Passed explicitly though it matches Omnitone's own default, because a reorder
 * swaps front for left with no other symptom.
 */
const AMBIX_CHANNEL_MAP = [0, 1, 2, 3];

/** Channels in a first-order B-format stream, and so convolvers in this stage */
const AMBISONIC_CHANNELS = 4;

/**
 * Seconds spent crossfading between stereo and the headphone render.
 *
 * Bounded from both sides: a gain that steps in one sample clicks, and a fade
 * shorter than the decode's own latency would duck both stages at once and
 * punch a hole. 20 ms clears both and still reads as immediate.
 */
const STAGE_CROSSFADE = 0.02;

const HEADPHONES_TITLE_ON =
    "Headphones: on. You are hearing spatial audio, as if you were standing inside the church. Click to go back to regular stereo.";
const HEADPHONES_TITLE_OFF =
    "Headphones: off. Turn on for spatial audio, as if you were standing inside the church. Works best with headphones.";
const HEADPHONES_TITLE_UNAVAILABLE =
    "Headphones: unavailable. This church does not have the recordings needed for spatial audio.";

/** Whether playback leaves through the live ambisonic stage */
let ambisonicEnabled = false;

/**
 * Whether the soundfield turns with the panorama. Off by default: a render
 * that moved with the view would answer two questions at once for a listener
 * trying to judge the room.
 */
let soundfieldTracking = false;

/** Positions whose B-format file could not be fetched, so it is asked for once */
const bformatMissing = new Set();

/** The live FOARenderer, and the initialization that is producing it */
let foaRenderer = null;
let foaRendererPending = null;

/** Whether a missing Omnitone has already been reported, so it is said once */
let omnitoneReported = false;

/** Handle of the rotation loop, or null when the soundfield is not tracking */
let soundfieldFrame = null;

/**
 * Initializes Omnitone's decoder once and hands the same instance out after.
 * It belongs to the AudioContext rather than any one position, and initialize()
 * fetches its own HRIR files, so one per play would stall the start of the sound.
 */
async function ensureAmbisonicRenderer() {
    if (foaRenderer) return foaRenderer;

    if (typeof Omnitone === 'undefined') {
        if (!omnitoneReported) {
            omnitoneReported = true;
            console.warn('Omnitone did not load, so the live ambisonic decode is unavailable. ' +
                'Check the <script> tag in index.html resolves (a version that does not ' +
                'exist on the CDN returns 404 without failing the page).');
        }
        return null;
    }

    if (foaRendererPending) return foaRendererPending;

    foaRendererPending = (async () => {
        try {
            const renderer = Omnitone.createFOARenderer(ctx, { channelMap: AMBIX_CHANNEL_MAP });
            await renderer.initialize();
            foaRenderer = renderer;
            return renderer;
        } catch (err) {
            console.error(err);
            foaRendererPending = null;   // let a later play try again
            return null;
        }
    })();

    return foaRendererPending;
}

/**
 * Loads the position's 4-channel AmbiX impulse response as mono buffers.
 *
 * A ConvolverNode reads a 4-channel buffer as a true-stereo matrix, not as four
 * independent responses, so the channels have to be handed over one at a time.
 */
async function loadBformatChannels(audioCtx, base) {
    if (!base || bformatMissing.has(base)) return null;

    let buffer;
    try {
        buffer = await loadImpulseResponse(base + BFORMAT_SUFFIX);
    } catch (err) {
        bformatMissing.add(base);
        return null;   // most positions have none; that is not a failure
    }

    if (buffer.numberOfChannels < AMBISONIC_CHANNELS) {
        console.warn(`${base}${BFORMAT_SUFFIX}: ${buffer.numberOfChannels} channels, ` +
            `first-order ambisonics needs ${AMBISONIC_CHANNELS}`);
        bformatMissing.add(base);
        return null;
    }

    const channels = [];
    for (let ch = 0; ch < AMBISONIC_CHANNELS; ch++) {
        const mono = audioCtx.createBuffer(1, buffer.length, buffer.sampleRate);
        mono.copyToChannel(buffer.getChannelData(ch), 0);
        channels.push(mono);
    }
    return channels;
}

function setAmbisonicEnabled(enabled) {
    // The button stays clickable so it can explain itself on hover, so the
    // refusal lives here rather than in the DOM
    if (enabled && !ambisonicAvailable()) return;

    ambisonicEnabled = enabled;
    // Alternatives, not layers; see setSpeakersEnabled()
    if (enabled) speakersEnabled = false;

    refreshModeButtons();
    applyOutputStage();
    syncSoundfieldTracking();
}

function toggleAmbisonic() {
    setAmbisonicEnabled(!ambisonicEnabled);
}

/**
 * Whether the headphone render can be engaged.
 *
 * A running graph is authoritative. Stopped, nothing has ruled the position out
 * yet, which is enough to arm the mode before the first play.
 */
function ambisonicAvailable() {
    if (activeGraph) return Boolean(activeGraph.ambisonicOut);
    return typeof Omnitone !== 'undefined' && Boolean(currentIr.decodedBase)
        && !bformatMissing.has(currentIr.decodedBase);
}

/**
 * Reflects the mode on the button, and whether the mode exists here at all.
 *
 * aria-disabled rather than disabled: a disabled button receives no mouse
 * events, which takes its tooltip — the only thing that says why — with it.
 * setAmbisonicEnabled() refuses the press instead.
 */
function updateAmbisonicButton() {
    const btn = document.getElementById('headphones');
    if (!btn) return;

    const available = ambisonicAvailable();
    btn.classList.toggle('active', ambisonicEnabled && available);
    btn.setAttribute('aria-disabled', String(!available));
    btn.setAttribute('aria-pressed', String(ambisonicEnabled && available));
    btn.title = !available ? HEADPHONES_TITLE_UNAVAILABLE
        : ambisonicEnabled ? HEADPHONES_TITLE_ON : HEADPHONES_TITLE_OFF;
}

/** Reflects whichever mode is live on every control the view has */
function refreshModeButtons() {
    updateAmbisonicButton();
    updateTrackingControl();
    updateSpeakersControl();
}

// ── Soundfield rotation ───────────────────────────────────────────────────

const TRACKING_TITLE_ON =
    "Head tracking: on. The sound moves as you look around, like turning your head inside the church.";
const TRACKING_TITLE_OFF =
    "Head tracking: off. The sound stays in place as you look around. Turn on to have it follow where you look.";
const TRACKING_TITLE_UNAVAILABLE = "Head tracking: turn on Headphones first to use this.";

function setSoundfieldTracking(enabled) {
    soundfieldTracking = enabled;
    updateTrackingControl();
    syncSoundfieldTracking();
}

/**
 * Reflects tracking on its checkbox, if the view has one.
 *
 * Disabled unless the live decode is running: it is the only mode that keeps
 * the soundfield in a form that can be turned.
 */
function updateTrackingControl() {
    const box = document.getElementById('tracking');
    const control = document.getElementById('tracking-control');
    if (!box) return;

    const available = ambisonicEnabled && ambisonicAvailable();
    box.checked = soundfieldTracking;
    box.disabled = !available;

    if (control) {
        control.classList.toggle('unavailable', !available);
        control.title = !available ? TRACKING_TITLE_UNAVAILABLE
            : soundfieldTracking ? TRACKING_TITLE_ON : TRACKING_TITLE_OFF;
    }
}

function toggleSoundfieldTracking() {
    setSoundfieldTracking(!soundfieldTracking);
}

/** Runs the rotation loop only while it could do something */
function syncSoundfieldTracking() {
    const wanted = soundfieldTracking && ambisonicEnabled && Boolean(foaRenderer);
    if (wanted) startSoundfieldTracking();
    else stopSoundfieldTracking();
}

function startSoundfieldTracking() {
    if (soundfieldFrame !== null) return;
    if (typeof requestAnimationFrame !== 'function') return;

    const step = () => {
        soundfieldFrame = requestAnimationFrame(step);
        updateSoundfieldRotation();
    };
    soundfieldFrame = requestAnimationFrame(step);
}

function stopSoundfieldTracking() {
    if (soundfieldFrame === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(soundfieldFrame);
    soundfieldFrame = null;

    // Leave the soundfield where the head is pointing, not where it last was
    if (foaRenderer) foaRenderer.setRotationMatrix4(rotationMatrix4(0, 0));
}

/**
 * Where the soundfield's front points, as a panorama yaw in degrees. Half this
 * collection has the array and the camera disagreeing by 180°, which reverses
 * which way sources travel as the view turns, apparent lateral position going
 * as -sin(yaw - offset). Set by compile() from the church's soundfieldYaw.
 */
let soundfieldYaw = 0;

function setSoundfieldOrientation(yawDegrees) {
    soundfieldYaw = Number.isFinite(yawDegrees) ? yawDegrees : 0;
}

/**
 * The rotation the view on screen calls for, or null where there is no view to
 * read one from.
 *
 * Nothing is cached: the viewer is replaced on every panorama change, so
 * holding a reference would rotate to the angles of a view no longer on screen.
 */
function currentSoundfieldRotation() {
    if (typeof viewer === 'undefined' || !viewer) return null;

    try {
        return rotationMatrix4(viewer.getYaw() - soundfieldYaw, viewer.getPitch());
    } catch (err) {
        // A viewer torn down mid-frame throws rather than returning an angle
        console.error(err);
        return null;
    }
}

/** Reads the panorama camera and turns the live soundfield to match */
function updateSoundfieldRotation() {
    if (!foaRenderer) return;

    const rotation = currentSoundfieldRotation();
    if (rotation) foaRenderer.setRotationMatrix4(rotation);
}

/**
 * Matrix expressing world directions in the listener's frame, column-major.
 *
 * THE INVERSE, NOT THE ORIENTATION: Omnitone applies this matrix as given, so
 * sending the camera's R would drag the soundfield along with the view and glue
 * a source to whichever ear it started in. R = Ry(yaw)·Rx(pitch), so this
 * returns Rᵀ = Rx(−pitch)·Ry(−yaw) — not R(−yaw)·R(−pitch), which inverts each
 * rotation but leaves them composed in the original order and so agrees only
 * when one angle is zero. Roll is absent because the panorama has none.
 */
function rotationMatrix4(yawDegrees, pitchDegrees) {
    // Pannellum counts yaw positive to the RIGHT, while a positive rotation
    // about the up axis in this frame turns LEFT. Unreconciled, head tracking
    // swings the room the same way as the head instead of against it. Pitch
    // needs no such flip: both call positive "up".
    const yaw = -yawDegrees * Math.PI / 180;
    const pitch = pitchDegrees * Math.PI / 180;

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    return [
        cy, sy * sp, sy * cp, 0,
        0, cp, -sp, 0,
        -sy, cy * sp, cy * cp, 0,
        0, 0, 0, 1,
    ];
}

// ── Per-church stage calibration ──────────────────────────────────────────

/**
 * Output level of the headphone render at the position being listened to, in
 * dB, keyed by stage name. Set by compile(); empty where there is no such stage.
 *
 * Stereo has no entry because it is the reference the render is matched to.
 */
let stageTrims = {};

/** Points the calibration at a church. Anything missing falls back. */
function setStageTrims(trims) {
    stageTrims = trims || {};
}

/**
 * Bounds a trim is believed within. The render's convolvers do not normalize,
 * so it can land either side of stereo and a small boost is a real answer. Past
 * +12 dB a stage heads for clipping and below -40 dB it is inaudible, which is
 * a misplaced decimal point rather than a calibration.
 */
const STAGE_TRIM_MAX_DB = 12;
const STAGE_TRIM_MIN_DB = -40;

/**
 * A stage's level in dB: this church's calibration, or `fallbackDb` where the
 * position is uncalibrated or the value is not one the engine believes.
 *
 * Type is checked before value, or null would coerce to 0 and read as a
 * deliberate "no change".
 */
function stageTrimDb(stage, fallbackDb = 0) {
    const db = stageTrims[stage];
    const usable = typeof db === 'number' && Number.isFinite(db)
        && db >= STAGE_TRIM_MIN_DB && db <= STAGE_TRIM_MAX_DB;
    return usable ? db : fallbackDb;
}

// ── Output stage selection ────────────────────────────────────────────────

/**
 * Gain of the headphone stage's wet path: the same mix the stereo stage applies
 * to its own, times this position's trim. The trim rides here rather than on the
 * stage output because it calibrates the decoded room, and the dry is not part
 * of what was decoded.
 */
function ambisonicWetGain(mix) {
    return mix * gainFromDb(stageTrimDb('ambisonic'));
}

/**
 * Whether the headphone stage is the one that should be heard: the mode the
 * listener chose, unless this position never built that stage. Fading to a
 * stage that is not there would fade to silence.
 */
function onHeadphoneStage(graph) {
    return ambisonicEnabled && Boolean(graph.ambisonicOut);
}

/**
 * Crossfades the live graph to whichever stage the current mode selects. The two
 * are alternatives, not layers: both up would sum the same dry signal twice.
 */
function applyOutputStage() {
    if (!activeGraph) return;

    const headphones = onHeadphoneStage(activeGraph);
    const speakers = onSpeakerStage(activeGraph);
    rampGain(activeGraph.stereoOut.gain, headphones || speakers ? 0 : 1, STAGE_CROSSFADE);
    if (activeGraph.ambisonicOut) {
        rampGain(activeGraph.ambisonicOut.gain, headphones ? 1 : 0, STAGE_CROSSFADE);
    }
    if (activeGraph.speakerOut) {
        rampGain(activeGraph.speakerOut.gain, speakers ? 1 : 0, STAGE_CROSSFADE);
    }
}

/**
 * Wires a source node through the wet/dry convolution graph to the context's
 * destination.
 *
 *   source ─┬─ dryGain
 *           └─ irTrim ─ splitter ─┬─ convL ─ wetGainLeft
 *                                 └─ convR ─ wetGainRight
 *
 * Those three feed both stages; whichever is faded up is the one heard:
 *
 *   dryGain ──────► merger L + R ─┐
 *   wetGainLeft ──► merger L      ├─► stereoOut ────────────┐
 *   wetGainRight ─► merger R      ┘                         │
 *                                                           ├──► output ──► out
 *   dryGain ─────────────────────► ambiDryMerger L + R ─┐   │
 *   splitter ─► ambiWet ─► 4 convolvers ─► ambiMerger    ├─► ambiOut ─┘
 *                                    └─► ambiBus ─► FOA ─┘
 *
 * Dry and wet are gained separately in both stages by the same law, so the mix
 * slider means one thing on either side of the button. Both stages are built
 * whenever the files allow and the unused one silenced: tearing the graph down
 * to change stage would restart the source.
 *
 * `speakerOutput` asks for the loudspeaker stage as well, which taps the same
 * four convolvers; see speakerStageRequest() in SpeakerOutput.js. Left out, the
 * graph is the one drawn above.
 */
function buildConvolutionGraph(audioCtx, sourceNode, { irLeft, irRight, mix, irGainDb, ambisonic, bformatChannels, ambisonicRenderer, speakerOutput }) {
    const convolverLeft = audioCtx.createConvolver();
    convolverLeft.buffer = irLeft;
    const convolverRight = audioCtx.createConvolver();
    convolverRight.buffer = irRight;

    // A ConvolverNode normalizes its buffer on assignment, so a trim baked into
    // the samples would be scaled straight back out. Trimming the signal on its
    // way in puts the level change where normalization cannot reach it, and
    // leaves the dry path — which taps the source directly — at full level.
    const irTrim = audioCtx.createGain();
    irTrim.gain.value = gainFromDb(irGainDb);

    // A one-output splitter keeps channel 0 only, so a stereo source file is
    // convolved as mono rather than folded into both ears.
    const splitter = audioCtx.createChannelSplitter(1);

    const dryGain = audioCtx.createGain();
    const wetGainLeft = audioCtx.createGain();
    const wetGainRight = audioCtx.createGain();
    dryGain.gain.value = dryGainFor(mix);
    wetGainLeft.gain.value = mix;
    wetGainRight.gain.value = mix;

    sourceNode.connect(dryGain);

    sourceNode.connect(irTrim);
    irTrim.connect(splitter);
    splitter.connect(convolverLeft, 0);
    splitter.connect(convolverRight, 0);
    convolverLeft.connect(wetGainLeft);
    convolverRight.connect(wetGainRight);

    const output = audioCtx.createGain();

    // Stereo stage: dry to both channels so it stays centred, one convolver per ear
    const merger = audioCtx.createChannelMerger(2);
    const stereoOut = audioCtx.createGain();
    dryGain.connect(merger, 0, 0);
    dryGain.connect(merger, 0, 1);
    wetGainLeft.connect(merger, 0, 0);
    wetGainRight.connect(merger, 0, 1);
    merger.connect(stereoOut);
    stereoOut.connect(output);

    let ambisonicOut = null;
    let ambiMerger = null;
    let ambiWet = null;
    let ambiDryMerger = null;
    let ambiBus = null;
    let speakerStage = null;

    if (bformatChannels && ambisonicRenderer) {
        ambiMerger = audioCtx.createChannelMerger(AMBISONIC_CHANNELS);
        ambisonicOut = audioCtx.createGain();

        // Before the convolvers rather than after the merger, so it scales the
        // room without reaching the dry signal the merger is about to sum in.
        ambiWet = audioCtx.createGain();
        ambiWet.gain.value = ambisonicWetGain(mix);
        splitter.connect(ambiWet, 0);

        const ambiConvolvers = [];
        for (let ch = 0; ch < AMBISONIC_CHANNELS; ch++) {
            const convolver = audioCtx.createConvolver();
            // Their level relative to each other is the soundfield itself, so
            // normalizing would flatten the directions out. The stage's level
            // is set by the trim in ambiWet instead.
            convolver.normalize = false;
            convolver.buffer = bformatChannels[ch];
            ambiWet.connect(convolver);
            convolver.connect(ambiMerger, 0, ch);
            ambiConvolvers.push(convolver);
        }

        // Ambisonic channels are not speaker feeds, so the stream is declared
        // discrete: read as a quad layout a 4-channel signal would be remapped,
        // scrambling W/Y/Z/X into positions.
        ambiBus = audioCtx.createGain();
        ambiBus.channelCount = AMBISONIC_CHANNELS;
        ambiBus.channelCountMode = 'explicit';
        ambiBus.channelInterpretation = 'discrete';

        ambiMerger.connect(ambiBus);
        ambiBus.connect(ambisonicRenderer.input);
        ambisonicRenderer.output.connect(ambisonicOut);

        // THE DRY DOES NOT GO THROUGH THE DECODER. Encoded as a plane wave it
        // comes back still exactly mono, having spent 5.7 dB and picked up HRTF
        // colouring on the way; sent straight out, as the stereo stage sends it,
        // the two stages agree at a mix of 0%. The impulse response already
        // carries the room's direct sound, so this path has none to lose.
        ambiDryMerger = audioCtx.createChannelMerger(2);
        dryGain.connect(ambiDryMerger, 0, 0);
        dryGain.connect(ambiDryMerger, 0, 1);
        ambiDryMerger.connect(ambisonicOut);

        ambisonicOut.connect(output);

        if (speakerOutput) {
            speakerStage = buildSpeakerStage(audioCtx, {
                convolvers: ambiConvolvers,
                dryGain,
                outputs: speakerOutput.outputs,
                routing: speakerOutput.routing,
            });
            speakerStage.speakerOut.connect(output);

            // The stage arrives wider than the stereo ones it is summed with.
            // Discrete keeps those on the first two outputs, where a speaker
            // layout would be free to spread them.
            output.channelInterpretation = 'discrete';
        }
    }

    const headphones = ambisonic && Boolean(ambisonicOut);
    const speakers = !headphones && Boolean(speakerStage) && speakerOutput.live;
    stereoOut.gain.value = headphones || speakers ? 0 : 1;
    if (ambisonicOut) ambisonicOut.gain.value = headphones ? 1 : 0;
    if (speakerStage) speakerStage.speakerOut.gain.value = speakers ? 1 : 0;

    output.connect(audioCtx.destination);

    return {
        dryGain, wetGainLeft, wetGainRight, irTrim, stereoOut,
        ambisonicOut, ambiMerger, ambiWet, ambiDryMerger, ambiBus,
        ambisonicRenderer: ambisonicRenderer || null,
        speakerOut: speakerStage && speakerStage.speakerOut,
        speakerMerger: speakerStage && speakerStage.speakerMerger,
        speakerFeeds: speakerStage && speakerStage.speakerFeeds,
        output,
    };
}

// ── File loading ──────────────────────────────────────────────────────────

/**
 * Fetches and decodes an audio file
 * @throws MissingResourceError if the file could not be retrieved
 */
async function loadAudioBuffer(audioContext, url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new MissingResourceError(url, response.status);
    }
    return audioContext.decodeAudioData(await response.arrayBuffer());
}

/**
 * Decoded impulse responses, keyed by URL and ordered oldest-first so the least
 * recently used entries can be dropped. Capped because a full set across twelve
 * churches would run to hundreds of MB.
 */
const IR_CACHE_LIMIT = 8;
const irCache = new Map();

async function loadImpulseResponse(url) {
    const cached = irCache.get(url);
    if (cached) {
        irCache.delete(url); // reinsert to mark as most recently used
        irCache.set(url, cached);
        return cached;
    }

    // The pending promise is cached, not the buffer, so two plays started in
    // quick succession share one download instead of racing.
    const pending = loadAudioBuffer(ctx, url);
    irCache.set(url, pending);
    try {
        await pending;
    } catch (err) {
        irCache.delete(url); // let a later attempt retry rather than replay the failure
        throw err;
    }

    while (irCache.size > IR_CACHE_LIMIT) {
        irCache.delete(irCache.keys().next().value);
    }
    return pending;
}

/**
 * Checks whether a receiver position has a recorded impulse response, priming
 * the error banner (without showing it) when it does not
 */
async function impulseResponseExists(base) {
    const url = base + "1.wav";
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
            clearResourceError();
            return true;
        }
        setResourceError(`error: impulse response could not be retrieved (${response.status})`, url);
    } catch (err) {
        console.error(err);
        setResourceError("error: impulse response could not be loaded", url);
    }
    return false;
}

/** Replaces the playback source with an audio file fetched from the server */
async function setSourceFromUrl(url) {
    sourceBuffer = await loadAudioBuffer(ctx, url);
}

/** Replaces the playback source with bytes already read from a local file */
async function setSourceFromBuffer(arrayBuffer) {
    sourceBuffer = await ctx.decodeAudioData(arrayBuffer);
}

/** Loads the startup source file, reporting failure in the view */
async function loadSource() {
    try {
        await setSourceFromUrl(DEFAULT_SOURCE_FILE);
    } catch (err) {
        reportResourceFailure(err, "source file", DEFAULT_SOURCE_FILE);
    }
}

// ── Playback ──────────────────────────────────────────────────────────────

const PLAY_TITLE_PLAY = "Play: listen to how this church sounds from the spot you have chosen.";
const PLAY_TITLE_PAUSE = "Pause the sound.";

function setPlaying(playing) {
    isPlaying = playing;

    const btn = document.getElementById('play');
    if (!btn) return;
    btn.textContent = playing ? 'pause_circle_filled' : 'play_circle_filled';
    btn.title = playing ? PLAY_TITLE_PAUSE : PLAY_TITLE_PLAY;
    btn.classList.toggle('playing', playing);
}

async function startPlayback() {
    if (!sourceBuffer) {
        showResourceError("error: source file has not finished loading", "");
        return;
    }
    if (!currentIr.base) return;

    let irLeft, irRight;
    try {
        [irLeft, irRight] = await Promise.all([
            loadImpulseResponse(currentIr.base + "1.wav"),
            loadImpulseResponse(currentIr.base + "2.wav")
        ]);
    } catch (err) {
        reportResourceFailure(err, "impulse response", currentIr.base + "1.wav");
        document.getElementById("play").disabled = true;
        setPlaying(false);
        return;
    }

    // Loaded before the graph is built, not on demand, so the mode can be
    // toggled mid-playback without a rebuild that would restart the loop
    const [bformatChannels, ambisonicRenderer] = await Promise.all([
        loadBformatChannels(ctx, currentIr.decodedBase),
        ensureAmbisonicRenderer(),
    ]);

    // A context constructed before any user gesture starts out suspended
    await ctx.resume();

    // Switching receivers restarts playback, so a second start can arrive while
    // this one was still fetching. Tear down anything already running rather
    // than leaving two graphs feeding the destination at once.
    stopPlayback();

    source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    source.loop = true;
    activeGraph = buildConvolutionGraph(ctx, source, {
        irLeft,
        irRight,
        mix: convolutionMix,
        irGainDb: currentIr.gainDb,
        ambisonic: ambisonicEnabled,
        bformatChannels,
        ambisonicRenderer,
        speakerOutput: speakerStageRequest(),
    });

    source.start();
    setPlaying(true);

    // These controls can only say whether the mode exists once the files have
    // been looked for, which is here rather than at selection time
    updateAmbisonicButton();
    updateTrackingControl();
    updateSpeakersControl();
    syncSoundfieldTracking();
}

function stopPlayback() {
    if (source) {
        try {
            source.stop();
        } catch (err) {
            console.error(err);
        }
        source.disconnect();
        source = null;
    }

    if (activeGraph) {
        // Unhooking the output releases the whole graph for collection; leaving
        // it attached to the destination would pin every node of every past
        // playback.
        activeGraph.output.disconnect();

        // The Omnitone renderer outlives the graph — it belongs to the context
        // and is reused across plays — so the two edges that cross into it have
        // to be cut by hand.
        if (activeGraph.ambiBus) activeGraph.ambiBus.disconnect();
        if (activeGraph.ambisonicRenderer) activeGraph.ambisonicRenderer.output.disconnect();

        activeGraph = null;
    }

    stopSoundfieldTracking();
    setPlaying(false);

    // Availability is read off the graph while one is running, so the controls
    // have to be asked again once it is gone or they keep reporting the last
    // position's answer.
    refreshModeButtons();
}

async function playpause() {
    if (isPlaying) {
        stopPlayback();
        return;
    }
    await startPlayback();
}

// ── Offline render (development aid) ──────────────────────────────────────

/**
 * Samples Omnitone's own decode filters add past the end of the room's tail.
 *
 * Its first-order HRIRs are 256 taps; the allowance is rounded up rather than
 * read off the filters, which the library keeps to itself. Only the headphone
 * render pays it — stereo ends when the impulse response does.
 */
const FOA_DECODE_TAIL = 512;

/**
 * Builds a decoder for an offline render, or null if there is nothing to build
 * one from.
 *
 * A renderer belongs to the context that made it, so the live one cannot be
 * borrowed here and a second has to be initialized against the offline context.
 * Its own singleton is deliberately not touched: caching this one would hand a
 * dead context to the next play.
 */
async function offlineAmbisonicRenderer(offlineCtx) {
    if (typeof Omnitone === 'undefined') return null;
    try {
        const renderer = Omnitone.createFOARenderer(offlineCtx, { channelMap: AMBIX_CHANNEL_MAP });
        await renderer.initialize();
        return renderer;
    } catch (err) {
        console.error(err);
        return null;
    }
}

/**
 * Renders whichever stage is currently playing and downloads it as a WAV file,
 * so the result can be inspected without recording the browser's output.
 *
 * The stage follows the Headphones button: the two are different renders of the
 * same room rather than two encodings of one, so a file that always carried
 * stereo could not be used to check the render actually being listened to. A
 * headphone render that cannot be assembled falls back to stereo and says so,
 * because a file is more use than a refusal when the point is to compare them.
 */
async function downloadConvolvedAudio() {
    if (!sourceBuffer || !currentIr.base) {
        console.warn('downloadConvolvedAudio: source or impulse responses not loaded yet.');
        return;
    }

    const [irLeft, irRight] = await Promise.all([
        loadImpulseResponse(currentIr.base + "1.wav"),
        loadImpulseResponse(currentIr.base + "2.wav")
    ]);

    // Decoded on the live context and handed to the offline one, as the stereo
    // pair above already is: an AudioBuffer belongs to no context, only to a
    // sample rate, and the render below is created at this one's.
    const bformatChannels = ambisonicEnabled
        ? await loadBformatChannels(ctx, currentIr.decodedBase)
        : null;

    // Room for the source plus the tail of whichever room is being rendered,
    // and the decode filters on top where they are in circuit
    const roomTail = bformatChannels
        ? Math.max(irLeft.length, bformatChannels[0].length) + FOA_DECODE_TAIL
        : irLeft.length;
    const offlineCtx = new OfflineAudioContext(2, sourceBuffer.length + roomTail, ctx.sampleRate);

    const ambisonicRenderer = bformatChannels
        ? await offlineAmbisonicRenderer(offlineCtx)
        : null;
    const headphones = Boolean(bformatChannels && ambisonicRenderer);

    if (ambisonicEnabled && !headphones) {
        console.warn('downloadConvolvedAudio: the headphone render could not be assembled ' +
            'for this position, so stereo was rendered instead.');
    }

    const offlineSource = offlineCtx.createBufferSource();
    offlineSource.buffer = sourceBuffer;
    buildConvolutionGraph(offlineCtx, offlineSource, {
        irLeft,
        irRight,
        mix: convolutionMix,
        irGainDb: currentIr.gainDb,
        ambisonic: headphones,
        bformatChannels: headphones ? bformatChannels : null,
        ambisonicRenderer: headphones ? ambisonicRenderer : null,
    });

    // A render is one fixed orientation, so a soundfield that is being turned is
    // frozen where the view has it rather than reset: the file should hold what
    // was in the ears when it was asked for. Left alone otherwise, which is the
    // identity the renderer starts at.
    if (headphones && soundfieldTracking) {
        const rotation = currentSoundfieldRotation();
        if (rotation) ambisonicRenderer.setRotationMatrix4(rotation);
    }

    offlineSource.start();
    const renderedBuffer = await offlineCtx.startRendering();

    const url = URL.createObjectURL(audioBufferToWav(renderedBuffer));
    const link = document.createElement('a');
    link.href = url;
    // Named for the stage, so the two renders of one position do not overwrite
    // each other in the downloads folder — comparing them is the whole point
    link.download = headphones ? 'convolved-output-headphones.wav' : 'convolved-output-stereo.wav';
    link.click();
    // Revoked on a later turn of the event loop so the download can start
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Encodes an AudioBuffer into a 16-bit PCM WAV file Blob */
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;

    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}
