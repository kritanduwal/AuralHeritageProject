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
}

// ── Binaural rendering ────────────────────────────────────────────────────

/** Half the angle between the virtual loudspeakers: a stereo listening triangle */
const VIRTUAL_SPEAKER_AZIMUTH = 30;

/** Where they stand when a receiver has no measured distance on record, in feet */
const DEFAULT_SPEAKER_DISTANCE_FEET = 20;

/**
 * Output level of the binaural stage. Every virtual speaker is heard by both
 * ears, where a headphone channel reaches only one, so the stage comes back
 * louder than the stereo one. A listening control, not a derived constant:
 * adjust until the toggle changes the rendering and not the loudness.
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
    binauralEnabled = enabled;
    updateBinauralButton();

    if (!activeGraph) return;

    rampGain(activeGraph.stereoOut.gain, enabled ? 0 : 1, BINAURAL_CROSSFADE);
    rampGain(activeGraph.binauralOut.gain, enabled ? BINAURAL_TRIM : 0, BINAURAL_CROSSFADE);
}

function toggleBinaural() {
    setBinauralEnabled(!binauralEnabled);
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
 *   wetGainLeft ──► speaker -30°  ├─► binauralOut ──┘
 *   wetGainRight ─► speaker +30°  ┘
 *
 * Both stages are built every time and one is silenced: tearing the graph down
 * to change stage would restart the source and lose its place in the loop.
 *
 * @returns the gain nodes the mix slider and the binaural toggle retune, plus
 *          the output node to unhook on stop
 */
function buildConvolutionGraph(audioCtx, sourceNode, { irLeft, irRight, mix, irGainDb, binaural, speakerDistance = DEFAULT_SPEAKER_DISTANCE_FEET }) {
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

    stereoOut.gain.value = binaural ? 0 : 1;
    binauralOut.gain.value = binaural ? BINAURAL_TRIM : 0;

    output.connect(audioCtx.destination);

    return { dryGain, wetGainLeft, wetGainRight, stereoOut, binauralOut, output };
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
        speakerDistance: speakerDistanceFeet()
    });

    source.start();
    setPlaying(true);

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

    // Room for the source plus the reverb tail it leaves behind
    const frames = sourceBuffer.length + irLeft.length;
    const offlineCtx = new OfflineAudioContext(2, frames, ctx.sampleRate);

    const offlineSource = offlineCtx.createBufferSource();
    offlineSource.buffer = sourceBuffer;
    buildConvolutionGraph(offlineCtx, offlineSource, {
        irLeft,
        irRight,
        mix: convolutionMix,
        irGainDb: currentIr.gainDb,
        binaural: binauralEnabled,
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
