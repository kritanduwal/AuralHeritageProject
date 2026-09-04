#!/usr/bin/env node
'use strict';
/**
 * A-format → B-format (AmbiX) converter for the room impulse responses in IR/.
 *
 * Each receiver position was captured on a multichannel array whose last four
 * channels are the raw tetrahedral capsule signals of a RØDE NT-SF1. This turns
 * that block into a first-order B-format IR in AmbiX convention — ACN channel
 * order, SN3D normalization — resampled to 48 kHz and written as
 * <stem>-Bformat.wav, ready to hand to Omnitone.
 *
 * Offline tool. It reads IR/ and writes new files beside them; it does not touch
 * the app, and nothing in the app reads its output.
 *
 *   node tools/aformat-to-bformat.js --dry-run
 *   node tools/aformat-to-bformat.js "IR/Cane Ridge Meeting House, KY"
 *
 * ── READ THIS BEFORE TRUSTING THE OUTPUT ─────────────────────────────────────
 *
 * Two of the things this script needs are not published by RØDE, and two more
 * are properties of the library that may invalidate the whole exercise. The
 * script reports on all four rather than hiding them:
 *
 *   1. CAPSULE ORDER. Which WAV channel carries which physical capsule is a
 *      convention of the recording chain, not something recoverable from the
 *      files. CAPSULE_ORDER below is the common tetrahedral default. Verify it
 *      against your session notes before believing any direction. --verify
 *      prints the evidence the IRs themselves can offer.
 *
 *   2. NON-COINCIDENCE CORRECTION. RØDE's own correction lives inside the
 *      SoundField by RØDE plugin and is not documented. What this script
 *      applies instead is derived from first principles for an ideal tetrahedral
 *      array of four cardioids at a given radius — see designCorrection(). It is
 *      a real correction, not a sum/difference, but it is a *generic* one: it
 *      knows the geometry, not this microphone's calibration.
 *
 *   3. CAPSULE RADIUS. The correction's transition frequency falls out of the
 *      capsule radius, which RØDE also does not publish. CAPSULE_RADIUS_M is an
 *      estimate. It is the single most consequential number here — pass
 *      --radius to try others and listen.
 *
 *   4. PER-CHANNEL PEAK NORMALIZATION. A→B is a weighted sum across the four
 *      capsules, so it requires their *relative* levels to be intact. If each
 *      channel was normalized on its own, those levels are gone and the decoded
 *      directions are not the measured ones. The script tests for this and says
 *      so loudly. See "Why not an ambisonic decode" in README.md.
 *
 * @author Kritan Duwal
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Which capsule each of the four A-format channels carries, in file order.
 *
 * The tetrahedral naming is the usual one: F/B front-back, L/R left-right,
 * U/D up-down, so FLU is the front-left-upward-facing capsule. This ordering is
 * the common convention for tetrahedral arrays and is the documented default
 * for most A-format tooling — but it is a convention, and a mic wired or routed
 * differently will silently produce a mirrored or rotated soundfield rather
 * than an error. Override with --order.
 */
const CAPSULE_ORDER = ['FLU', 'FRD', 'BLD', 'BRU'];

/**
 * Unit vectors of the four capsule axes in the AmbiX/Web Audio-adjacent frame
 * used throughout this script: +X front, +Y left, +Z up (the ambisonic
 * convention, which is *not* the Web Audio listener frame — the app's own
 * conversion happens elsewhere).
 *
 * These four directions are the vertices of a regular tetrahedron, which is
 * what makes the sum/difference matrix in matrixAtoB() orthogonal.
 */
const CAPSULE_AXES = {
    FLU: [1, 1, 1],
    FRD: [1, -1, -1],
    BLD: [-1, 1, -1],
    BRU: [-1, -1, 1],
};

/**
 * Distance from the array centre to each capsule, in metres.
 *
 * ESTIMATE — RØDE does not publish this for the NT-SF1. It sets the frequency
 * above which the capsules stop behaving as a coincident point, f = c/(2πr),
 * and so it sets where the correction starts working. 12 mm puts that near
 * 4.5 kHz, which is the right order for a mic this size, but it is not a
 * measurement. Pass --radius to explore.
 */
const CAPSULE_RADIUS_M = 0.012;

/** Speed of sound, m/s, at room temperature */
const SPEED_OF_SOUND = 343;

/** Taps in the correction filter. Odd, so it has an exact centre to delay by. */
const CORRECTION_TAPS = 511;

/**
 * Ceiling on the correction's boost, in dB.
 *
 * The ideal-array model divides by the array's own response, which collapses
 * toward zero at high frequencies where the capsules fight each other. Left
 * alone that becomes an enormous boost of whatever noise sits up there. The
 * cap is what keeps the correction a correction.
 */
const MAX_CORRECTION_DB = 12;

/** Output sample rate, per the AmbiX files Omnitone expects */
const DEFAULT_OUTPUT_RATE = 48000;

/** Half-width of the resampler's windowed-sinc kernel, in input samples */
const RESAMPLE_HALF_TAPS = 48;

/**
 * A channel is treated as peak-normalized if its peak sits this close to full
 * scale. Normalization lands exactly on 1.0; a natural peak essentially never
 * does.
 */
const NORMALIZED_PEAK_EPSILON = 1e-4;

// ── WAV reading ───────────────────────────────────────────────────────────

/** Reads a RIFF/WAVE file into planar float channels */
function readWav(file) {
    const buf = fs.readFileSync(file);
    if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' ||
        buf.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error(`${file}: not a RIFF/WAVE file`);
    }

    let format = null;
    let data = null;

    // Walk the chunk list rather than assuming fmt/data sit at fixed offsets:
    // real files carry LIST, bext and other chunks ahead of the audio.
    let pos = 12;
    while (pos + 8 <= buf.length) {
        const id = buf.toString('ascii', pos, pos + 4);
        const size = buf.readUInt32LE(pos + 4);
        const body = pos + 8;

        if (id === 'fmt ') {
            let code = buf.readUInt16LE(body);
            const channels = buf.readUInt16LE(body + 2);
            const sampleRate = buf.readUInt32LE(body + 4);
            const bits = buf.readUInt16LE(body + 14);
            // WAVE_FORMAT_EXTENSIBLE hides the real format in its GUID's first
            // two bytes; everything else about the header stays where it was.
            if (code === 0xFFFE && size >= 40) code = buf.readUInt16LE(body + 24);
            format = { code, channels, sampleRate, bits };
        } else if (id === 'data') {
            data = buf.subarray(body, Math.min(body + size, buf.length));
        }

        pos = body + size + (size % 2); // chunks are word-aligned
    }

    if (!format) throw new Error(`${file}: no fmt chunk`);
    if (!data) throw new Error(`${file}: no data chunk`);

    const { code, channels, sampleRate, bits } = format;
    const bytes = bits / 8;
    const frames = Math.floor(data.length / (bytes * channels));
    const out = Array.from({ length: channels }, () => new Float64Array(frames));

    const readSample = sampleReader(code, bits, file);
    for (let f = 0; f < frames; f++) {
        for (let c = 0; c < channels; c++) {
            out[c][f] = readSample(data, (f * channels + c) * bytes);
        }
    }

    return { sampleRate, channels, frames, data: out };
}

/** Picks the decoder for one sample of a given format, or refuses the file */
function sampleReader(code, bits, file) {
    if (code === 3) {                                   // IEEE float
        if (bits === 32) return (b, o) => b.readFloatLE(o);
        if (bits === 64) return (b, o) => b.readDoubleLE(o);
    }
    if (code === 1) {                                   // integer PCM
        if (bits === 16) return (b, o) => b.readInt16LE(o) / 32768;
        if (bits === 24) return (b, o) => {
            // No readInt24LE; assemble it and sign-extend by hand
            const v = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
            return (v & 0x800000 ? v - 0x1000000 : v) / 8388608;
        };
        if (bits === 32) return (b, o) => b.readInt32LE(o) / 2147483648;
        if (bits === 8) return (b, o) => (b[o] - 128) / 128;   // 8-bit PCM is unsigned
    }
    throw new Error(`${file}: unsupported WAV format (code ${code}, ${bits}-bit)`);
}

// ── WAV writing ───────────────────────────────────────────────────────────

/**
 * Writes planar float channels as 32-bit float WAV.
 *
 * Float rather than integer PCM on purpose: B-format W and XYZ can exceed the
 * peak of any single capsule, and the correction filter adds more on top. In
 * float that is simply a number above 1.0, and the decoder scales it back. In
 * 24-bit it would be a clipped IR — the one kind of damage that cannot be
 * undone downstream.
 */
function writeWav(file, channels, sampleRate) {
    const numChannels = channels.length;
    const frames = channels[0].length;
    const bytesPerSample = 4;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = frames * blockAlign;

    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(3, 20);              // IEEE float
    buf.writeUInt16LE(numChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * blockAlign, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bytesPerSample * 8, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let f = 0; f < frames; f++) {
        for (let c = 0; c < numChannels; c++) {
            buf.writeFloatLE(channels[c][f], offset);
            offset += 4;
        }
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
}

// ── FFT ───────────────────────────────────────────────────────────────────

/** In-place iterative radix-2 FFT. `re`/`im` are Float64Arrays of equal 2^k length. */
function fft(re, im, inverse = false) {
    const n = re.length;

    // Bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }

    for (let len = 2; len <= n; len <<= 1) {
        const angle = (inverse ? 2 : -2) * Math.PI / len;
        const wRe = Math.cos(angle), wIm = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < len / 2; j++) {
                const aRe = re[i + j], aIm = im[i + j];
                const bRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
                const bIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
                re[i + j] = aRe + bRe;
                im[i + j] = aIm + bIm;
                re[i + j + len / 2] = aRe - bRe;
                im[i + j + len / 2] = aIm - bIm;
                const nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }

    if (inverse) {
        for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
}

// ── Non-coincidence correction ────────────────────────────────────────────

/**
 * Designs the pair of correction filters the A→B matrix needs.
 *
 * WHY THERE IS ANYTHING TO CORRECT
 *
 * The sum/difference matrix assumes the four capsules sit at the same point.
 * They do not: each sits a radius r out along its own axis, so a wave arriving
 * from direction u reaches capsule i early or late by (r/c)(u·dᵢ). Below
 * f = c/(2πr) that delay is a small fraction of a period and the assumption
 * holds. Above it the capsules fall out of step, and because W is a sum and
 * XYZ are differences, they fall out of step in opposite directions: the sum
 * loses level to cancellation while the differences gain it. Uncorrected, the
 * result is a soundfield whose directional components are progressively wrong
 * with frequency — audible as a bright, diffuse, badly localized decode.
 *
 * WHAT THIS DERIVES
 *
 * For a plane wave from +X, a cardioid capsule on axis dᵢ produces
 *
 *     pᵢ(k) = ½(1 + u·dᵢ) · exp(j·k·r·(u·dᵢ))
 *              └ directivity ┘  └ the displacement the matrix ignores ┘
 *
 * Two capsules face +X at u·dᵢ = +1/√3 and two face away at −1/√3, so summing
 * and differencing gives the array's actual W and X responses in closed form.
 * Dividing the ideal coincident response by those gives the correction:
 *
 *     H_W(k) = W_ideal / W_array(k)        H_XYZ(k) = X_ideal / X_array(k)
 *
 * Both are real and even by construction here, so the filters come out
 * linear-phase — the whole point for an impulse response, where a correction
 * with phase of its own would smear the arrival times the IR exists to record.
 *
 * ASSUMPTIONS, all of which this microphone violates a little: ideal cardioids,
 * matched capsules, free field, and no diffraction or shadowing from the mic
 * body. It is the geometry's correction, not the NT-SF1's own.
 *
 * @returns { w, xyz } linear-phase FIR kernels, CORRECTION_TAPS long
 */
function designCorrection(sampleRate, radiusM) {
    const size = 1 << Math.ceil(Math.log2(CORRECTION_TAPS * 4));
    const half = size / 2;
    const maxGain = Math.pow(10, MAX_CORRECTION_DB / 20);

    // Projection of the capsule axes onto the reference direction: two capsules
    // lean toward it, two away, by the same amount for a regular tetrahedron.
    const proj = 1 / Math.sqrt(3);
    const near = 1 + proj;    // 2 × ½(1 + 1/√3), the pair facing the wave
    const far = 1 - proj;     // 2 × ½(1 − 1/√3), the pair facing away

    // The coincident array these filters aim at (r → 0 above)
    const idealW = near + far;
    const idealX = near - far;

    const wRe = new Float64Array(size), wIm = new Float64Array(size);
    const xRe = new Float64Array(size), xIm = new Float64Array(size);

    for (let bin = 0; bin <= half; bin++) {
        const freq = bin * sampleRate / size;
        const kr = 2 * Math.PI * freq * radiusM / SPEED_OF_SOUND;
        const c = Math.cos(kr * proj), s = Math.sin(kr * proj);

        // W = near·e^{+jkr·proj} + far·e^{−jkr·proj}; the imaginary parts cancel
        // to leave a real, even response. X is the same with the sign flipped.
        const wMag = Math.abs((near + far) * c);
        const xMag = Math.hypot((near - far) * c, (near + far) * s);

        const gW = clampGain(idealW / (wMag || 1e-12), maxGain);
        const gX = clampGain(idealX / (xMag || 1e-12), maxGain);

        // Hermitian symmetry, so the inverse transform comes out real
        wRe[bin] = gW; wIm[bin] = 0;
        xRe[bin] = gX; xIm[bin] = 0;
        if (bin > 0 && bin < half) {
            wRe[size - bin] = gW; wIm[size - bin] = 0;
            xRe[size - bin] = gX; xIm[size - bin] = 0;
        }
    }

    return {
        w: kernelFromSpectrum(wRe, wIm),
        xyz: kernelFromSpectrum(xRe, xIm),
    };
}

function clampGain(gain, maxGain) {
    if (!Number.isFinite(gain)) return maxGain;
    return Math.min(Math.max(gain, 1 / maxGain), maxGain);
}

/**
 * Turns a zero-phase magnitude response into a windowed, linear-phase FIR.
 *
 * The inverse transform of a real even spectrum is a real even impulse centred
 * on sample 0 and wrapping around the end of the buffer. Rotating it to the
 * middle and windowing gives a causal kernel whose only cost is a fixed delay
 * of half its length, which trimDelay() takes back out.
 */
function kernelFromSpectrum(re, im) {
    const size = re.length;
    fft(re, im, true);

    const kernel = new Float64Array(CORRECTION_TAPS);
    const centre = (CORRECTION_TAPS - 1) / 2;
    for (let i = 0; i < CORRECTION_TAPS; i++) {
        const shift = i - centre;
        const src = ((shift % size) + size) % size;
        // Blackman, to keep the stopband ripple from ringing on a transient
        const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (CORRECTION_TAPS - 1))
            + 0.08 * Math.cos(4 * Math.PI * i / (CORRECTION_TAPS - 1));
        kernel[i] = re[src] * w;
    }
    return kernel;
}

/** Direct convolution, trimmed to the input length and to the filter's delay */
function convolve(signal, kernel) {
    const delay = (kernel.length - 1) / 2;
    const out = new Float64Array(signal.length);
    for (let n = 0; n < signal.length; n++) {
        let acc = 0;
        const first = Math.max(0, n + delay - signal.length + 1);
        const last = Math.min(kernel.length - 1, n + delay);
        for (let k = first; k <= last; k++) acc += kernel[k] * signal[n + delay - k];
        out[n] = acc;
    }
    return out;
}

// ── A → B matrix ──────────────────────────────────────────────────────────

/**
 * The tetrahedral sum/difference, scaled for SN3D.
 *
 * With cardioid capsules ½(1 + u·dᵢ) on the tetrahedron's four axes, a plane
 * wave of unit amplitude from u gives
 *
 *     Σ pᵢ                     = 2                    (the axes sum to zero)
 *     p_FLU + p_FRD − p_BLD − p_BRU = 2·uₓ/√3
 *
 * SN3D wants W = 1 and X = uₓ for that wave, so the sums carry a factor of ½
 * and the differences √3/2. That √3 between them is the whole normalization —
 * getting it wrong tilts every decode toward or away from the centre, which
 * sounds like a room that is too diffuse or too dry rather than like an error.
 *
 * @param capsules Signals in CAPSULE_ORDER order, keyed by capsule name
 * @returns W, X, Y, Z in the ambisonic frame (+X front, +Y left, +Z up)
 */
function matrixAtoB(capsules) {
    const { FLU, FRD, BLD, BRU } = capsules;
    const frames = FLU.length;

    const W = new Float64Array(frames);
    const X = new Float64Array(frames);
    const Y = new Float64Array(frames);
    const Z = new Float64Array(frames);

    const sumScale = 0.5;
    const diffScale = Math.sqrt(3) / 2;

    for (let i = 0; i < frames; i++) {
        const a = FLU[i], b = FRD[i], c = BLD[i], d = BRU[i];
        W[i] = sumScale * (a + b + c + d);
        X[i] = diffScale * (a + b - c - d);
        Y[i] = diffScale * (a - b + c - d);
        Z[i] = diffScale * (a - b - c + d);
    }

    return { W, X, Y, Z };
}

// ── Resampling ────────────────────────────────────────────────────────────

/**
 * Windowed-sinc resampler.
 *
 * The kernel's cutoff follows the lower of the two rates, so downsampling
 * band-limits before it decimates instead of folding the top octave back down
 * into the reverb tail.
 */
function resample(signal, fromRate, toRate) {
    if (fromRate === toRate) return signal;

    const ratio = toRate / fromRate;
    const frames = Math.round(signal.length * ratio);
    const out = new Float64Array(frames);

    const cutoff = 0.5 * Math.min(1, ratio);   // cycles per input sample
    const taps = RESAMPLE_HALF_TAPS;

    for (let m = 0; m < frames; m++) {
        const centre = m / ratio;
        const first = Math.ceil(centre - taps);
        const last = Math.floor(centre + taps);

        let acc = 0;
        for (let n = first; n <= last; n++) {
            if (n < 0 || n >= signal.length) continue;
            const d = centre - n;
            const w = 0.42 + 0.5 * Math.cos(Math.PI * d / taps)
                + 0.08 * Math.cos(2 * Math.PI * d / taps);
            acc += signal[n] * 2 * cutoff * sinc(2 * cutoff * d) * w;
        }
        out[m] = acc;
    }

    return out;
}

function sinc(x) {
    if (Math.abs(x) < 1e-9) return 1;
    return Math.sin(Math.PI * x) / (Math.PI * x);
}

// ── Measurement ───────────────────────────────────────────────────────────

function rms(signal) {
    let acc = 0;
    for (let i = 0; i < signal.length; i++) acc += signal[i] * signal[i];
    return Math.sqrt(acc / signal.length);
}

function peak(signal) {
    let m = 0;
    for (let i = 0; i < signal.length; i++) m = Math.max(m, Math.abs(signal[i]));
    return m;
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmtDb = (x) => (x > 0 ? db(x).toFixed(2).padStart(8) + ' dB' : '     -inf dB');

// ── Position discovery ────────────────────────────────────────────────────

/**
 * Groups a church's IR files by position.
 *
 * Everything before the trailing "-<channel>.wav" is the stem, so positions
 * group correctly even where the prefix does not match the folder name or an
 * individual position carries an override.
 */
function findPositions(dir) {
    const positions = new Map();

    for (const name of fs.readdirSync(dir)) {
        const match = /^(.*)-(\d+)\.wav$/i.exec(name);
        if (!match) continue;
        const [, stem, channel] = match;
        if (!positions.has(stem)) positions.set(stem, []);
        positions.get(stem).push({ channel: Number(channel), file: path.join(dir, name) });
    }

    for (const list of positions.values()) list.sort((a, b) => a.channel - b.channel);
    return positions;
}

/**
 * The four capsule channels of a position.
 *
 * The ambisonic block is the last four channels in every layout the library
 * uses — 3–6 where a position has six channels, 5–8 where Tennessee's rear pair
 * pushes it to eight — so taking the last four covers both without a table of
 * which church is which.
 */
function ambisonicBlock(channels) {
    if (channels.length < 4) return null;
    return channels.slice(-4);
}

// ── Conversion ────────────────────────────────────────────────────────────

/**
 * Converts one position, returning what it did for the caller to report.
 * @returns null if the position cannot be converted
 */
function convertPosition(stem, channels, options) {
    const block = ambisonicBlock(channels);
    if (!block) {
        return { stem, skipped: `only ${channels.length} channels; need at least 4` };
    }

    const sources = block.map(c => ({ ...c, wav: readWav(c.file) }));

    const rates = new Set(sources.map(s => s.wav.sampleRate));
    if (rates.size > 1) {
        return { stem, skipped: `capsules disagree on sample rate (${[...rates].join(', ')})` };
    }
    const inputRate = sources[0].wav.sampleRate;

    const lengths = sources.map(s => s.wav.frames);
    const frames = Math.min(...lengths);
    if (Math.max(...lengths) !== frames) {
        // Trimming is safe — they are the same measurement — but a real
        // mismatch means the files are not the take you think they are.
        options.warn(`${stem}: capsule lengths differ (${lengths.join(', ')}), trimming to ${frames}`);
    }

    // Only channel 0 of each file; these are mono captures per channel
    const raw = sources.map(s => s.wav.data[0].subarray(0, frames));

    const before = raw.map((signal, i) => ({
        label: `ch${block[i].channel} ${CAPSULE_ORDER[i]}`,
        rms: rms(signal),
        peak: peak(signal),
    }));

    const normalized = before.filter(b => Math.abs(b.peak - 1) < NORMALIZED_PEAK_EPSILON);

    const capsules = {};
    CAPSULE_ORDER.forEach((name, i) => { capsules[name] = raw[i]; });
    let { W, X, Y, Z } = matrixAtoB(capsules);

    // The correction goes after the matrix, not before it. Every capsule feeds
    // both the sum and the differences, so the two corrections have nowhere to
    // live upstream — W and XYZ only exist as separate signals once the matrix
    // has run, and it is W and XYZ that drifted apart, not the capsules.
    if (options.eq) {
        const correction = designCorrection(inputRate, options.radius);
        W = convolve(W, correction.w);
        X = convolve(X, correction.xyz);
        Y = convolve(Y, correction.xyz);
        Z = convolve(Z, correction.xyz);
    }

    // AmbiX: ACN order is W, Y, Z, X — not W, X, Y, Z. Omnitone reads ACN, so
    // a file written in the intuitive order decodes with front and left swapped.
    let out = [W, Y, Z, X];

    if (inputRate !== options.rate) {
        out = out.map(ch => resample(ch, inputRate, options.rate));
    }

    const labels = ['W (ACN 0)', 'Y (ACN 1)', 'Z (ACN 2)', 'X (ACN 3)'];
    const after = out.map((signal, i) => ({
        label: labels[i],
        rms: rms(signal),
        peak: peak(signal),
    }));

    let written = null;
    if (!options.dryRun) {
        const dir = options.out || path.dirname(block[0].file);
        written = path.join(dir, `${stem}-Bformat.wav`);
        writeWav(written, out, options.rate);
    }

    return {
        stem, before, after, written, normalized,
        inputRate, outputRate: options.rate, frames,
    };
}

// ── Reporting ─────────────────────────────────────────────────────────────

function reportPosition(result) {
    if (result.skipped) {
        console.log(`\n  ${result.stem}\n    skipped: ${result.skipped}`);
        return;
    }

    const { before, after, inputRate, outputRate, frames } = result;
    console.log(`\n  ${result.stem}  (${frames} frames @ ${inputRate} Hz` +
        `${inputRate !== outputRate ? ` → ${outputRate} Hz` : ''})`);

    console.log('    A-format in                 RMS          peak');
    for (const c of before) {
        console.log(`      ${c.label.padEnd(20)}${fmtDb(c.rms)}  ${fmtDb(c.peak)}`);
    }

    console.log('    B-format out (AmbiX)        RMS          peak');
    for (const c of after) {
        console.log(`      ${c.label.padEnd(20)}${fmtDb(c.rms)}  ${fmtDb(c.peak)}`);
    }

    // The one ratio worth reading at a glance. For a diffuse tail the SN3D
    // convention puts each of X/Y/Z near W/√3 ≈ −4.8 dB; a decode that is wildly
    // off that is usually a capsule-order or normalization problem, not a room.
    const w = after[0].rms;
    const directional = [after[3].rms, after[1].rms, after[2].rms];   // X, Y, Z
    if (w > 0) {
        const ratios = directional.map(r => db(r / w).toFixed(1) + ' dB');
        console.log(`    X/W, Y/W, Z/W:        ${ratios.join('   ')}` +
            `   (diffuse field ≈ -4.8 dB each)`);
    }

    if (result.written) console.log(`    wrote ${path.basename(result.written)}`);
}

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const options = {
        dirs: [],
        out: null,
        radius: CAPSULE_RADIUS_M,
        rate: DEFAULT_OUTPUT_RATE,
        eq: true,
        dryRun: false,
        warnings: [],
        warn(message) { this.warnings.push(message); },
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--out') options.out = argv[++i];
        else if (arg === '--radius') options.radius = Number(argv[++i]);
        else if (arg === '--rate') options.rate = Number(argv[++i]);
        else if (arg === '--order') {
            const order = argv[++i].split(',').map(s => s.trim().toUpperCase());
            if (order.length !== 4 || order.some(n => !CAPSULE_AXES[n])) {
                throw new Error(`--order needs four of ${Object.keys(CAPSULE_AXES).join(', ')}`);
            }
            CAPSULE_ORDER.splice(0, 4, ...order);
        }
        else if (arg === '--no-eq') options.eq = false;
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        else options.dirs.push(arg);
    }

    if (!Number.isFinite(options.radius) || options.radius <= 0) {
        throw new Error('--radius must be a positive number of metres');
    }
    return options;
}

const USAGE = `
A-format → B-format (AmbiX) converter for the NT-SF1 IRs in IR/

  node tools/aformat-to-bformat.js [options] [<dir> ...]

  <dir>            church folder(s) to convert; default: every folder in IR/
  --out <dir>      write here instead of beside the sources
  --radius <m>     capsule radius for the correction (default ${CAPSULE_RADIUS_M})
  --rate <hz>      output sample rate (default ${DEFAULT_OUTPUT_RATE})
  --order <spec>   capsule order, e.g. FLU,FRD,BLD,BRU
  --no-eq          matrix only, no non-coincidence correction
  --dry-run        measure and report, write nothing
  --help

Read the header of this file before trusting the output.
`;

function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`error: ${err.message}`);
        console.error(USAGE);
        process.exit(1);
    }

    if (options.help) {
        console.log(USAGE);
        return;
    }

    const root = path.join(__dirname, '..', 'IR');
    const dirs = options.dirs.length
        ? options.dirs
        : fs.readdirSync(root)
            .map(d => path.join(root, d))
            .filter(d => fs.statSync(d).isDirectory());

    console.log(`A-format → B-format (AmbiX: ACN, SN3D)`);
    console.log(`  capsule order      ${CAPSULE_ORDER.join(', ')}   [verify against session notes]`);
    console.log(`  capsule radius     ${options.radius} m` +
        `  → correction from ${(SPEED_OF_SOUND / (2 * Math.PI * options.radius)).toFixed(0)} Hz` +
        `   [estimate, not published by RØDE]`);
    console.log(`  correction         ${options.eq
        ? `ideal-tetrahedron model, capped at ±${MAX_CORRECTION_DB} dB` : 'DISABLED (--no-eq)'}`);
    console.log(`  output             ${options.rate} Hz, 32-bit float, 4ch`);
    if (options.dryRun) console.log(`  dry run — nothing will be written`);

    const results = [];
    for (const dir of dirs) {
        console.log(`\n${path.basename(dir)}`);
        const positions = findPositions(dir);
        if (!positions.size) {
            console.log('  no channel files found');
            continue;
        }
        for (const [stem, channels] of [...positions].sort()) {
            let result;
            try {
                result = convertPosition(stem, channels, options);
            } catch (err) {
                result = { stem, skipped: err.message };
            }
            results.push(result);
            reportPosition(result);
        }
    }

    summarize(results, options);
}

function summarize(results, options) {
    const converted = results.filter(r => !r.skipped);
    const skipped = results.filter(r => r.skipped);

    console.log(`\n${'─'.repeat(72)}`);
    console.log(`${converted.length} position(s) converted, ${skipped.length} skipped`);

    for (const w of options.warnings) console.log(`  warning: ${w}`);

    const suspect = converted.filter(r => r.normalized.length);
    if (suspect.length) {
        const total = suspect.reduce((n, r) => n + r.normalized.length, 0);
        console.log(`
${'!'.repeat(72)}
STOP — ${total} capsule channel(s) across ${suspect.length} position(s) peak at
exactly full scale, which is the signature of per-channel peak normalization.

A→B is a weighted sum across the four capsules, so it needs their relative
levels intact. Normalizing each channel on its own destroys exactly that: every
capsule is rescaled by a different unknown factor, and no matrix, correction or
convention downstream can recover it. The files this run produced are valid
4-channel WAVs and will decode to something plausible-sounding, but the
directions they encode are not the directions that were measured, and the
W/XYZ balance is arbitrary.

This is the finding already recorded in README.md under "Why not an ambisonic
decode". If you have reached this script expecting it to be resolved, what you
need is the un-normalized original captures, not a different conversion.
${'!'.repeat(72)}`);
    } else if (converted.length) {
        console.log(`
No channel peaks at exactly full scale, so the per-channel normalization that
rules out a decode elsewhere in this library does not appear in this set. The
relative capsule levels look intact. Sanity-check the X/Y/Z-to-W ratios above
before going further: near -4.8 dB each is what a diffuse tail should give.`);
    }

    console.log(`
Before trusting any of this:
  · confirm the capsule order against the session notes — a wrong order is
    silent, and yields a mirrored or rotated soundfield, not an error
  · the correction is derived from ideal tetrahedral geometry, not from RØDE's
    own NT-SF1 calibration, which is unpublished
  · --radius is an estimate; it sets where the correction begins`);
}

if (require.main === module) main();

module.exports = {
    readWav, writeWav, matrixAtoB, designCorrection, convolve,
    resample, rms, peak, db, fmtDb, fft, findPositions, ambisonicBlock,
    CAPSULE_ORDER, CAPSULE_AXES, CAPSULE_RADIUS_M,
};
