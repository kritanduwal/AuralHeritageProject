/**
 * Audio routing, processing, and playback
 *
 * A dry copy of the source is mixed against a convolved ("wet") copy of it,
 * one convolver per ear, using the impulse response pair recorded at the
 * selected receiver position. See "Reverb ratios" in README.md for the mix law.
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
 *   base   – path prefix; "1.wav" and "2.wav" complete the left/right pair
 *   gainDb – level reduction for this position, in dB (0 = play as recorded)
 */
let currentIr = { base: "", gainDb: 0 };

function setImpulseResponse(base, gainDb) {
    currentIr = { base, gainDb };
}

// ── Wet / dry mix ─────────────────────────────────────────────────────────

/** Wet/dry balance: 0 plays the bare source, 1 the full room. */
let convolutionMix = 1.0;

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

    const target = ctx.currentTime + 0.05;
    activeGraph.dryGain.gain.linearRampToValueAtTime(dryGainFor(mix), target);
    activeGraph.wetGainLeft.gain.linearRampToValueAtTime(mix, target);
    activeGraph.wetGainRight.gain.linearRampToValueAtTime(mix, target);
}

/**
 * Wires a source node through the wet/dry convolution graph to the context's
 * destination.
 *
 *   source ─┬─ dryGain ───────────────────────────────► merger L+R
 *           └─ irTrim ─ splitter ─┬─ convL ─ wetL ────► merger L
 *                                 └─ convR ─ wetR ────► merger R
 *
 * @returns the gain nodes the mix slider retunes, plus the merger to unhook on stop
 */
function buildConvolutionGraph(audioCtx, sourceNode, { irLeft, irRight, mix, irGainDb }) {
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
    const merger = audioCtx.createChannelMerger(2);

    const dryGain = audioCtx.createGain();
    const wetGainLeft = audioCtx.createGain();
    const wetGainRight = audioCtx.createGain();
    dryGain.gain.value = dryGainFor(mix);
    wetGainLeft.gain.value = mix;
    wetGainRight.gain.value = mix;

    // Dry path: unconvolved source to both ears
    sourceNode.connect(dryGain);
    dryGain.connect(merger, 0, 0);
    dryGain.connect(merger, 0, 1);

    // Wet path: one convolver per ear, both fed the same mono signal
    sourceNode.connect(irTrim);
    irTrim.connect(splitter);
    splitter.connect(convolverLeft, 0);
    splitter.connect(convolverRight, 0);
    convolverLeft.connect(wetGainLeft);
    convolverRight.connect(wetGainRight);
    wetGainLeft.connect(merger, 0, 0);
    wetGainRight.connect(merger, 0, 1);

    merger.connect(audioCtx.destination);

    return { dryGain, wetGainLeft, wetGainRight, output: merger };
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
        irGainDb: currentIr.gainDb
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

    // Unhooking the merger releases the whole graph for collection; leaving it
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
        irGainDb: currentIr.gainDb
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
