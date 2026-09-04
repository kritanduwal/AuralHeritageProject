/**
 * Audio routing, processing, and playback
 *
 * A dry copy of the source is mixed against a convolved ("wet") copy of it,
 * one convolver per ear, using the impulse response pair recorded at the
 * selected receiver position. See "Reverb ratios" in README.md for the mix law.
 *
 * The result leaves by one of two output stages: straight out to the headphone
 * channels, or through a pair of HRTF virtual loudspeakers. See "Binaural
 * rendering" in README.md.
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
 * The impulse response pair the next play will use. Set by compile() whenever
 * the room or receiver selection changes.
 *   base         – path prefix; "1.wav" and "2.wav" complete the left/right pair
 *   gainDb       – level reduction for this position, in dB (0 = play as recorded)
 *   distanceFeet – measured receiver-to-source distance, placing the binaural
 *                  render's virtual loudspeakers (0 = none on record)
 */
let currentIr = { base: "", gainDb: 0, distanceFeet: 0 };

function setImpulseResponse(base, gainDb, distanceFeet = 0) {
    currentIr = { base, gainDb, distanceFeet };
}

// ── Gain automation ───────────────────────────────────────────────────────

/**
 * Glides a gain to a new value, starting from where it actually is now.
 *
 * linearRampToValueAtTime() interpolates from the previous automation event,
 * which is not the same thing as "from here". Called on its own, the second
 * glide on a parameter draws its line from the end of the first one — however
 * many seconds back that was — so the moment the event is scheduled the gain
 * leaps almost the whole way in a single sample and then creeps out the
 * remainder over the ramp. That step is a click, and it lands on every change
 * after the first: exactly the ones an A/B makes.
 *
 * Clearing the timeline and pinning the current value at the current time
 * gives the ramp a start point in the present, so the glide is the whole of
 * the change rather than the tail of it.
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

/**
 * Dry gain at a fully wet mix, i.e. the bottom of the dry taper (-9.1 dB)
 */
const DRY_GAIN_AT_FULL_WET = 0.35;

/**
 * Dry-path gain for a given wet mix.
 *
 * The wet path follows the slider directly, so the dry path has to give way as
 * reverb comes up or the two summed together get louder toward the wet end.
 * It holds at unity through the first 10% of the slider, then falls linearly
 * in dB to DRY_GAIN_AT_FULL_WET at 100%.
 *
 * @param mix Wet amount, 0 to 1
 */
function dryGainFor(mix) {
    return Math.min(1.0, Math.pow(DRY_GAIN_AT_FULL_WET, (10 * mix - 1) / 9));
}

/** Converts a positive dB reduction to the linear gain that applies it */
function reductionToGain(reductionDb) {
    return Math.pow(10, -reductionDb / 20);
}

/**
 * Sets the convolution mix amount, gliding to avoid zipper noise
 * @param mix Value from 0 to 1
 */
function setConvolutionMix(mix) {
    convolutionMix = mix;
    if (!activeGraph) return;

    rampGain(activeGraph.dryGain.gain, dryGainFor(mix), MIX_GLIDE);
    rampGain(activeGraph.wetGainLeft.gain, mix, MIX_GLIDE);
    rampGain(activeGraph.wetGainRight.gain, mix, MIX_GLIDE);

    // The BRIR stage runs its own convolver pair off the same mono signal, so
    // it needs the same wet amount applied to its own side of the split.
    if (activeGraph.brirWetLeft) {
        rampGain(activeGraph.brirWetLeft.gain, mix, MIX_GLIDE);
        rampGain(activeGraph.brirWetRight.gain, mix, MIX_GLIDE);
    }
}

// ── Binaural rendering ────────────────────────────────────────────────────

/** Half the angle between the virtual loudspeakers: a stereo listening triangle */
const VIRTUAL_SPEAKER_AZIMUTH = 30;

/** Where they stand when a receiver has no measured distance on record, in feet */
const DEFAULT_SPEAKER_DISTANCE_FEET = 20;

/**
 * Output level of the binaural stage — this mode's calibration point.
 *
 * A listening control: the stage plays at whatever level its own processing
 * produces with nothing taken off. That is deliberately not a good listening
 * level: it is a starting point with an unambiguous direction to move in. A
 * fallback already close to right is the harder thing to calibrate against,
 * because the ear has nothing to push away from and every value sounds nearly
 * as plausible as the last.
 *
 * Expect to land near -2.5 dB. Every virtual speaker is heard by both ears,
 * where a headphone channel reaches only one, so the stage comes back louder
 * than the stereo one. Set trim.binaural per church in ROOMS.
 */
const BINAURAL_TRIM = 0.75;

/**
 * Seconds spent crossfading between the two output stages.
 *
 * Squeezed between two limits rather than chosen for feel. It cannot go to
 * zero: a gain that steps in a single sample is a click, which is what
 * rampGain() exists to avoid. It also should not go below the delay the HRTF
 * panners add — a few milliseconds of convolution latency the stereo stage does
 * not pay — because a fade shorter than that offset would duck both stages at
 * once and punch a hole in the sound.
 *
 * 20 ms clears both and is well under the ~50 ms where a switch stops reading
 * as immediate.
 */
const BINAURAL_CROSSFADE = 0.02;

const BINAURAL_TITLE_ON = "Binaural rendering: on (best with headphones)";
const BINAURAL_TITLE_OFF = "Binaural rendering: off";

/** Whether playback leaves through the binaural stage. Toggled by its button. */
let binauralEnabled = false;

/**
 * One virtual loudspeaker, rendered to both ears through the browser's HRTFs.
 *
 * The listener is never reoriented; that is what makes this the untracked
 * render, and it keeps the image steady however the panorama is dragged.
 *
 * @param azimuthDegrees Angle from straight ahead, positive to the right
 * @param distanceFeet   Measured receiver-to-source distance for this position
 */
function createVirtualSpeaker(audioCtx, azimuthDegrees, distanceFeet) {
    const panner = audioCtx.createPanner();
    panner.panningModel = 'HRTF';

    // Distance places the speaker but must not set its level: the impulse
    // response carries this position's direct-to-reverberant ratio, and its
    // gainDb trim already corrects for distance.
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.rolloffFactor = 0;

    // Web Audio puts the listener at the origin facing -Z, with +X to the right
    const radians = azimuthDegrees * Math.PI / 180;
    const x = Math.sin(radians) * distanceFeet;
    const z = -Math.cos(radians) * distanceFeet;

    // setPosition() is deprecated but is the only spelling older Safari has
    if (panner.positionX) {
        panner.positionX.value = x;
        panner.positionY.value = 0;
        panner.positionZ.value = z;
    } else {
        panner.setPosition(x, 0, z);
    }

    return panner;
}

/**
 * Switches output stage, crossfading rather than rebuilding so the toggle can be
 * pressed mid-playback without interrupting the loop.
 */
function setBinauralEnabled(enabled) {
    if (enabled) engageMode('binaural');
    else if (binauralEnabled) engageMode('stereo');

    refreshModeButtons();
    applyOutputStage();
}

function toggleBinaural() {
    setBinauralEnabled(!binauralEnabled);
}

// ── Measured binaural rendering (BRIR) ────────────────────────────────────

/**
 * The third output stage, and the only one that is measured rather than
 * modelled.
 *
 * The other two render the front L/R pair: stereo sends it to the headphone
 * channels, binaural stands it on virtual loudspeakers filtered by the
 * browser's generic HRTFs. This one convolves the mono source against a
 * binaural room impulse response instead — the room and the head arriving
 * together in one filter, already carrying this position's early reflections
 * from the directions they actually came from.
 *
 * The BRIR pair is produced offline by tools/aformat-to-bformat.js and
 * tools/bformat-to-brir.js, which decode the ambisonic capsules against a
 * SADIE II HRTF set. Neither is run by the app; this only loads the result.
 */

/** Completes currentIr.base for the pair, as "1.wav"/"2.wav" do for the IR */
const BRIR_LEFT_SUFFIX = "BRIR-L.wav";
const BRIR_RIGHT_SUFFIX = "BRIR-R.wav";

/**
 * Output level of the BRIR stage — this mode's calibration point.
 *
 * A listening control, like BINAURAL_TRIM: calibration wants a starting
 * point that is plainly wrong in a known direction.
 *
 * MIND THE VOLUME. Zero here is roughly 14 dB above where this will settle,
 * because the convolver does not normalize — a BRIR carries the absolute level
 * the offline decode arrived at, where the IR convolvers hand theirs to
 * equal-power normalization and lose it. Expect to end near -14 dB. Turn the
 * headphones down before switching an uncalibrated church into this mode.
 */
const BRIR_TRIM = 1;

const BRIR_TITLE_ON = "Measured binaural (BRIR): on (best with headphones)";
const BRIR_TITLE_OFF = "Measured binaural (BRIR): off";
const BRIR_TITLE_UNAVAILABLE = "Measured binaural (BRIR): not recorded for this position";

/** Whether playback leaves through the measured binaural stage */
let brirEnabled = false;

/**
 * Receiver positions whose BRIR pair could not be fetched.
 *
 * Most of the library has no BRIRs — they exist only where the offline tools
 * have been run — and every play would otherwise re-request a pair that is not
 * there. Keyed by currentIr.base, so a position is probed at most once.
 */
const brirMissing = new Set();

/**
 * Whether this mode can be engaged.
 *
 * A running graph is authoritative: the stage was either built or it was not.
 * Stopped, the most that can be said is that nothing has ruled this position out
 * yet — which is enough to let the mode be armed before playback starts, the way
 * the modelled render can be. Disabling everything until the first play made
 * both of these look permanently broken on a freshly loaded page.
 */
function brirAvailable() {
    if (activeGraph) return Boolean(activeGraph.brirOut);
    return !brirMissing.has(currentIr.base);
}

/**
 * Loads the BRIR pair for the current selection, or null where there is none.
 *
 * Failure is not an error here: the mode is an extra that most positions do not
 * carry, so a missing pair silences the stage rather than the playback.
 */
async function loadBrirPair(base) {
    if (brirMissing.has(base)) return null;

    try {
        const [left, right] = await Promise.all([
            loadImpulseResponse(base + BRIR_LEFT_SUFFIX),
            loadImpulseResponse(base + BRIR_RIGHT_SUFFIX),
        ]);
        return { left, right };
    } catch (err) {
        brirMissing.add(base);
        // Deliberately not reportResourceFailure(): a position without a BRIR is
        // the normal case, not a broken one, and the banner is for broken.
        return null;
    }
}

function setBrirEnabled(enabled) {
    if (enabled) engageMode('brir');
    else if (brirEnabled) engageMode('stereo');

    refreshModeButtons();
    applyOutputStage();
}

function toggleBrir() {
    setBrirEnabled(!brirEnabled);
}

/** Reflects the current mode on the BRIR button, if the view has one */
function updateBrirButton() {
    const btn = document.getElementById('brir');
    if (!btn) return;

    const available = brirAvailable();
    btn.classList.toggle('active', brirEnabled && available);
    btn.disabled = !available;
    btn.setAttribute('aria-pressed', String(brirEnabled && available));
    btn.title = !available ? BRIR_TITLE_UNAVAILABLE
        : brirEnabled ? BRIR_TITLE_ON : BRIR_TITLE_OFF;
}

// ── Output stage selection ────────────────────────────────────────────────

/**
 * Which stage carries the signal. Four modes, three flags: engageMode() keeps
 * them mutually exclusive, and this is the single place that resolves them.
 */
function outputStage() {
    if (brirEnabled) return 'brir';
    if (binauralEnabled) return 'binaural';
    return 'stereo';
}

/**
 * Makes one mode the live one. The modes are alternatives, not layers: leaving
 * two engaged would silently pick one and make the other button a lie.
 */
function engageMode(mode) {
    binauralEnabled = mode === 'binaural';
    brirEnabled = mode === 'brir';
}

/** Reflects whichever mode is live on every control the view has */
function refreshModeButtons() {
    updateBinauralButton();
    updateBrirButton();
}

/** The gain each stage's output should rest at for a given mode */
function stageGainsFor(stage) {
    return {
        stereo: stage === 'stereo' ? 1 : 0,
        binaural: stage === 'binaural' ? BINAURAL_TRIM : 0,
        brir: stage === 'brir' ? BRIR_TRIM : 0,
    };
}

/**
 * The stage that will actually be heard: the selected one, or stereo where the
 * selection was never built. Falling back matters because two of the four modes
 * depend on files most positions do not carry, and fading to a stage that is not
 * there would fade to silence.
 */
function builtStage(graph) {
    const stage = outputStage();
    if (stage === 'brir' && !graph.brirOut) return 'stereo';
    return stage;
}

/** Crossfades the live graph to whichever stage the current mode selects */
function applyOutputStage() {
    if (!activeGraph) return;

    const gains = stageGainsFor(builtStage(activeGraph));

    rampGain(activeGraph.stereoOut.gain, gains.stereo, BINAURAL_CROSSFADE);
    rampGain(activeGraph.binauralOut.gain, gains.binaural, BINAURAL_CROSSFADE);
    if (activeGraph.brirOut) {
        rampGain(activeGraph.brirOut.gain, gains.brir, BINAURAL_CROSSFADE);
    }
}

/** Where to stand the speakers for the current selection, in feet */
function speakerDistanceFeet() {
    return currentIr.distanceFeet || DEFAULT_SPEAKER_DISTANCE_FEET;
}

/** Reflects the current mode on the toggle button */
function updateBinauralButton() {
    const btn = document.getElementById('binaural');
    if (!btn) return;

    btn.classList.toggle('active', binauralEnabled);
    btn.setAttribute('aria-pressed', String(binauralEnabled));
    btn.title = binauralEnabled ? BINAURAL_TITLE_ON : BINAURAL_TITLE_OFF;
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
 *   wetGainLeft ──► merger L      ├─► stereoOut ────┐
 *   wetGainRight ─► merger R      ┘                 │
 *                                                   ├──► output ──► destination
 *   dryGain ──────► both speakers ┐                 │
 *   wetGainLeft ──► speaker -30°  ├─► binauralOut ──┤
 *   wetGainRight ─► speaker +30°  ┘                 │
 *                                                   │
 *   dryGain ──────► merger L + R ─┐                 │
 *   brirWetLeft ──► merger L      ├─► brirOut ──────┘
 *   brirWetRight ─► merger R      ┘
 *
 * The third stage is only built where the position has a BRIR pair, and it taps
 * the same splitter rather than the same convolvers: it is the same wet path
 * with a different pair of impulse responses in it, so its convolvers hold the
 * measured binaural room response instead of IR channels 1 and 2. Its output
 * goes straight to the headphone channels, because a BRIR has already been
 * through a head and must not be sent through another one.
 *
 * All available stages are built every time and the unused ones silenced:
 * tearing the graph down to change stage would restart the source and lose its
 * place in the loop.
 *
 * @returns the gain nodes the mix slider and the mode toggles retune, plus the
 *          output node to unhook on stop
 */
function buildConvolutionGraph(audioCtx, sourceNode, { irLeft, irRight, mix, irGainDb, binaural, brir, brirLeft, brirRight, speakerDistance = DEFAULT_SPEAKER_DISTANCE_FEET }) {
    const convolverLeft = audioCtx.createConvolver();
    convolverLeft.buffer = irLeft;
    const convolverRight = audioCtx.createConvolver();
    convolverRight.buffer = irRight;

    // A ConvolverNode equal-power normalizes its impulse response when the
    // buffer is assigned, so a per-position trim baked into the samples would
    // be scaled straight back out. Trimming the signal on its way into the
    // convolvers puts the reduction somewhere normalization cannot undo, and
    // leaves the dry path — which taps the source directly — at full level.
    const irTrim = audioCtx.createGain();
    irTrim.gain.value = reductionToGain(irGainDb);

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

    // Wet path: one convolver per side, both fed the same mono signal
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

    // Binaural stage: the same signals through virtual loudspeakers, dry centred
    // between the pair exactly as it is centred between the headphone channels
    const speakerLeft = createVirtualSpeaker(audioCtx, -VIRTUAL_SPEAKER_AZIMUTH, speakerDistance);
    const speakerRight = createVirtualSpeaker(audioCtx, VIRTUAL_SPEAKER_AZIMUTH, speakerDistance);
    const binauralOut = audioCtx.createGain();
    dryGain.connect(speakerLeft);
    dryGain.connect(speakerRight);
    wetGainLeft.connect(speakerLeft);
    wetGainRight.connect(speakerRight);
    speakerLeft.connect(binauralOut);
    speakerRight.connect(binauralOut);
    binauralOut.connect(output);

    // BRIR stage: the same mono signal off the same splitter, convolved against
    // the measured binaural response instead of the raw IR pair. Built only
    // where the position has one.
    let brirOut = null;
    let brirWetLeft = null;
    let brirWetRight = null;

    if (brirLeft && brirRight) {
        const brirConvolverLeft = audioCtx.createConvolver();
        // The BRIR carries the absolute level the offline decode arrived at, and
        // normalization would scale it back out the way it would an IR trim.
        // BRIR_TRIM is where this stage's level is set instead.
        brirConvolverLeft.normalize = false;
        brirConvolverLeft.buffer = brirLeft;

        const brirConvolverRight = audioCtx.createConvolver();
        brirConvolverRight.normalize = false;
        brirConvolverRight.buffer = brirRight;

        brirWetLeft = audioCtx.createGain();
        brirWetRight = audioCtx.createGain();
        brirWetLeft.gain.value = mix;
        brirWetRight.gain.value = mix;

        const brirMerger = audioCtx.createChannelMerger(2);
        brirOut = audioCtx.createGain();

        splitter.connect(brirConvolverLeft, 0);
        splitter.connect(brirConvolverRight, 0);
        brirConvolverLeft.connect(brirWetLeft);
        brirConvolverRight.connect(brirWetRight);

        // Dry stays centred here exactly as it is in the other two stages
        dryGain.connect(brirMerger, 0, 0);
        dryGain.connect(brirMerger, 0, 1);
        brirWetLeft.connect(brirMerger, 0, 0);
        brirWetRight.connect(brirMerger, 0, 1);
        brirMerger.connect(brirOut);
        brirOut.connect(output);
    }
    const stage = brir && brirOut ? 'brir' : binaural ? 'binaural' : 'stereo';
    const gains = stageGainsFor(stage);
    stereoOut.gain.value = gains.stereo;
    binauralOut.gain.value = gains.binaural;
    if (brirOut) brirOut.gain.value = gains.brir;

    output.connect(audioCtx.destination);

    return {
        dryGain, wetGainLeft, wetGainRight, irTrim,
        stereoOut, binauralOut, brirOut, brirWetLeft, brirWetRight,
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
 * recently used entries can be dropped. Switching receivers restarts playback,
 * which would otherwise re-download and re-decode the same pair every time.
 * Capped because a full set across twelve churches would run to hundreds of MB.
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
 * @param base Path prefix of the pair, as built by impulseResponseBase()
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

function setPlaying(playing) {
    isPlaying = playing;

    const btn = document.getElementById('play');
    if (!btn) return;
    btn.textContent = playing ? 'pause_circle_filled' : 'play_circle_filled';
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

    // Optional, and absent for most of the library. Loaded before the graph is
    // built rather than on demand so the modes can be toggled mid-playback like
    // the other two, without a rebuild that would restart the loop.
    const brirPair = await loadBrirPair(currentIr.base);

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
        binaural: binauralEnabled,
        brir: brirEnabled,
        brirLeft: brirPair && brirPair.left,
        brirRight: brirPair && brirPair.right,
        speakerDistance: speakerDistanceFeet()
    });

    source.start();
    setPlaying(true);

    // This button can only say whether their mode exists once the files have
    // been looked for, which is here rather than at selection time
    updateBrirButton();

    //downloadConvolvedAudio(); // Uncomment to download the convolved output for testing
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

    // Unhooking the output releases the whole graph for collection; leaving it
    // attached to the destination would pin every node of every past playback.
    if (activeGraph) {
        activeGraph.output.disconnect();

        activeGraph = null;
    }

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
 * Renders the convolved (wet+dry mixed) output offline and downloads it as a
 * WAV file. Runs the same graph as playback through an OfflineAudioContext so
 * the result can be inspected without recording the browser's output.
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

    const brirPair = await loadBrirPair(currentIr.base);

    // Room for the source plus the longest tail any built stage leaves behind.
    // A BRIR carries the room and the head together and outruns the raw IR.
    const tail = Math.max(irLeft.length, brirPair ? brirPair.left.length : 0);
    const frames = sourceBuffer.length + tail;
    const offlineCtx = new OfflineAudioContext(2, frames, ctx.sampleRate);

    const offlineSource = offlineCtx.createBufferSource();
    offlineSource.buffer = sourceBuffer;
    buildConvolutionGraph(offlineCtx, offlineSource, {
        irLeft,
        irRight,
        mix: convolutionMix,
        irGainDb: currentIr.gainDb,
        binaural: binauralEnabled,
        brir: brirEnabled,
        brirLeft: brirPair && brirPair.left,
        brirRight: brirPair && brirPair.right,
        speakerDistance: speakerDistanceFeet()
    });

    offlineSource.start();
    const renderedBuffer = await offlineCtx.startRendering();

    const url = URL.createObjectURL(audioBufferToWav(renderedBuffer));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'convolved-output.wav';
    link.click();
    // Revoked on a later turn of the event loop so the download can start
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Encodes an AudioBuffer into a 16-bit PCM WAV file Blob
 */
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
