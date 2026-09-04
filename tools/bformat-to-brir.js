#!/usr/bin/env node
'use strict';
/**
 * B-format (AmbiX) → binaural room impulse response, via the SADIE II HRTF set.
 *
 * Takes the <stem>-Bformat.wav files that aformat-to-bformat.js writes and
 * renders each to a stereo BRIR pair — <stem>-BRIR-L.wav and <stem>-BRIR-R.wav,
 * 48 kHz — which AudioEngine.js can then convolve a mono source through in one
 * step, in place of the raw IR pair.
 *
 *   node tools/bformat-to-brir.js --hrir <sadie dir> --dry-run
 *   node tools/bformat-to-brir.js --hrir <sadie dir> "IR/Cane Ridge Meeting House, KY"
 *
 * Offline tool. It does not touch the app.
 *
 * ── HOW THE DECODE WORKS ─────────────────────────────────────────────────────
 *
 * First-order B-format does not become binaural directly; it is decoded to a
 * ring of *virtual* loudspeakers, and each of those is then filtered by the HRIR
 * for the direction it stands in. Summing the pairs gives one BRIR per ear:
 *
 *     BRIR_L = Σⱼ HRIR_L(dirⱼ) ⊛ feedⱼ        feedⱼ = decode of B toward dirⱼ
 *
 * Because the decode is an instantaneous matrix and convolution is linear, the
 * whole chain collapses into 8 speaker feeds, 16 convolutions and two sums —
 * all done here, once, so playback costs two convolvers instead of a decoder.
 *
 * The layout is a cube: eight speakers is the smallest arrangement that samples
 * all three axes symmetrically, which is what a first-order decode needs to
 * avoid favouring one direction over another.
 *
 * ── WHAT YOU MUST SUPPLY AND CHECK ───────────────────────────────────────────
 *
 *   1. THE SADIE II SET ITSELF. It is not in this repository and is not
 *      redistributed here; download it from the University of York and pass
 *      --hrir. Subject D1 (Neumann KU100) or D2 (KEMAR) is the usual choice for
 *      a general-audience render, since neither is anybody's individual head.
 *
 *   2. THE FILENAME CONVENTION. This reads a WAV-per-direction distribution and
 *      parses the angles out of the filenames. --pattern overrides the regex;
 *      --list prints what was parsed so you can confirm it before rendering.
 *
 *   3. THE AZIMUTH SIGN. Whether azimuth counts clockwise or counterclockwise
 *      is a convention, and getting it backwards mirrors the room left-for-right
 *      without any other symptom. --azimuth-sign flips it. Verify by rendering
 *      a position you know and checking that a source you remember on the left
 *      is still on the left.
 *
 *   4. THE INPUT. Everything here assumes the B-format it is given is valid.
 *      If those files came from per-channel peak-normalized captures, this
 *      script will render a confident, plausible-sounding BRIR of a soundfield
 *      that was never measured. aformat-to-bformat.js reports that condition;
 *      this script re-checks what it can and repeats the warning.
 *
 * @author Kritan Duwal
 */

const fs = require('fs');
const path = require('path');

const {
    readWav, writeWav, resample, rms, peak, db, fmtDb, fft,
} = require('./aformat-to-bformat.js');

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * The virtual loudspeaker layout: the eight vertices of a cube.
 *
 * Written as raw ±1 vectors and normalized below, which is the clearest way to
 * see that the layout is symmetric about all three axes. That symmetry is what
 * lets the decode be a plain projection instead of a pseudo-inverse.
 */
const CUBE_VERTICES = [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];

/**
 * Default filename pattern for a WAV-per-direction HRIR set.
 *
 * Deliberately loose: it wants the word "azi"/"az" then a number, and
 * "ele"/"el" then a number, in that order, with either a comma or a dot as the
 * decimal separator (SADIE's exports have used both). Anything it cannot parse
 * is reported rather than skipped silently.
 *
 * The separator class is "_" and whitespace and deliberately NOT "-": a dash
 * between the label and the number is indistinguishable from a minus sign, and
 * a separator class that swallows it turns every negative angle into a positive
 * one — which mirrors half the HRIR set with no other symptom. If your set
 * writes "az-45" meaning positive 45, pass --pattern; losing the sign silently
 * is the worse default.
 */
const DEFAULT_PATTERN =
    String.raw`az(?:i|imuth)?[_\s]*(-?\d+(?:[.,]\d+)?).*?el(?:e|evation)?[_\s]*(-?\d+(?:[.,]\d+)?)`;

/** Output sample rate the app expects */
const DEFAULT_OUTPUT_RATE = 48000;

/**
 * Angular distance, in degrees, beyond which a substituted HRIR stops being a
 * reasonable stand-in for the direction actually wanted. A dense set answers
 * every cube vertex to within a degree or two; anything worse than this means
 * the set is sparse enough that the layout, not the set, should change.
 */
const MAX_HRIR_MISMATCH_DEG = 10;

/** Signature of a per-channel peak-normalized file, as in the A-format step */
const NORMALIZED_PEAK_EPSILON = 1e-4;

// ── HRIR set ──────────────────────────────────────────────────────────────

/**
 * Loads a WAV-per-direction HRIR set into a list of measured directions.
 *
 * Each file is expected to hold one measurement position as a stereo pair:
 * channel 0 the left ear, channel 1 the right. That is the near-universal
 * layout for HRIR distributions, and a mono file is refused rather than
 * guessed at.
 */
function loadHrirSet(dir, options) {
    const pattern = new RegExp(options.pattern, 'i');
    const files = [];
    walk(dir, files);

    const entries = [];
    const unparsed = [];

    for (const file of files) {
        const match = pattern.exec(path.basename(file, '.wav'));
        if (!match) { unparsed.push(file); continue; }

        const azimuth = Number(match[1].replace(',', '.')) * options.azimuthSign;
        const elevation = Number(match[2].replace(',', '.'));
        if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) {
            unparsed.push(file);
            continue;
        }

        entries.push({ file, azimuth, elevation, direction: toCartesian(azimuth, elevation) });
    }

    if (!entries.length) {
        throw new Error(
            `no HRIR files parsed from ${dir}\n` +
            `  ${files.length} .wav file(s) found; none matched the pattern\n` +
            `  pattern: ${options.pattern}\n` +
            `  try --pattern with a regex capturing azimuth then elevation, or --list`);
    }

    return { entries, unparsed, dir };
}

function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, out);
        else if (/\.wav$/i.test(name)) out.push(full);
    }
}

/**
 * Unit vector for an azimuth/elevation, in the ambisonic frame: +X front,
 * +Y left, +Z up, azimuth counterclockwise from front.
 */
function toCartesian(azimuthDeg, elevationDeg) {
    const az = azimuthDeg * Math.PI / 180;
    const el = elevationDeg * Math.PI / 180;
    return [
        Math.cos(el) * Math.cos(az),
        Math.cos(el) * Math.sin(az),
        Math.sin(el),
    ];
}

/** Angle between two unit vectors, in degrees */
function angleBetween(a, b) {
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    return Math.acos(dot) * 180 / Math.PI;
}

/** The measured direction closest to the one wanted, with the error it costs */
function nearestHrir(set, direction) {
    let best = null;
    let bestAngle = Infinity;
    for (const entry of set.entries) {
        const angle = angleBetween(entry.direction, direction);
        if (angle < bestAngle) { bestAngle = angle; best = entry; }
    }
    return { entry: best, errorDeg: bestAngle };
}

// ── Decode ────────────────────────────────────────────────────────────────

/**
 * The virtual loudspeaker layout, as directions plus their decode weights.
 *
 * DECODE
 *
 * For a symmetric layout the first-order decode is a projection: each speaker
 * gets the B-format signal evaluated in its own direction. In N3D that is
 *
 *     gⱼ = (1/N) Σ_acn B_acn · Y_acn(dirⱼ)
 *
 * The input here is SN3D, which differs from N3D by √3 on the first-order
 * channels — and Y_acn is also √3 larger — so the two √3 multiply to the 3
 * that appears below. Writing it out this way rather than converting to N3D and
 * back keeps the whole conversion in one visible line.
 *
 * MAX-rE
 *
 * The plain projection spreads each source across every speaker that faces even
 * slightly toward it, which at first order smears the image badly. Max-rE damps
 * the directional channels to concentrate the energy vector, at the cost of a
 * broader but far more stable image. The weights are aₙ = Pₙ(cos θ_E) with
 * cos θ_E the largest root of P_{N+1}; for first order P₂ gives 1/√3, so
 * a₀ = 1 and a₁ = 1/√3. Multiplied into the 3 above, the directional term
 * becomes √3.
 */
function virtualSpeakers(useMaxRe) {
    const directionalWeight = useMaxRe ? Math.sqrt(3) : 3;

    return CUBE_VERTICES.map(v => {
        const norm = Math.hypot(v[0], v[1], v[2]);
        const direction = [v[0] / norm, v[1] / norm, v[2] / norm];
        return {
            direction,
            azimuth: Math.atan2(direction[1], direction[0]) * 180 / Math.PI,
            elevation: Math.asin(direction[2]) * 180 / Math.PI,
            // Applied to [W, Y, Z, X] in ACN order, which is how the file is laid out
            weights: [
                1 / CUBE_VERTICES.length,
                directionalWeight * direction[1] / CUBE_VERTICES.length,
                directionalWeight * direction[2] / CUBE_VERTICES.length,
                directionalWeight * direction[0] / CUBE_VERTICES.length,
            ],
        };
    });
}

// ── Frequency-domain convolution ──────────────────────────────────────────

/**
 * Convolves and accumulates entirely in the frequency domain.
 *
 * Sixteen convolutions of a multi-second IR against an HRIR would be slow done
 * directly and are nearly free done as spectra: every speaker feed and every
 * HRIR is transformed once, the products are summed per ear while still
 * complex, and only the two ear signals are transformed back.
 */
function makeConvolver(length) {
    const size = 1 << Math.ceil(Math.log2(length));
    return {
        size,
        /** Zero-padded forward transform of a real signal */
        forward(signal) {
            const re = new Float64Array(size);
            const im = new Float64Array(size);
            re.set(signal.subarray ? signal.subarray(0, Math.min(signal.length, size))
                : signal.slice(0, size));
            fft(re, im, false);
            return { re, im };
        },
        /** acc += a · b, complex, bin by bin */
        multiplyAccumulate(acc, a, b) {
            for (let i = 0; i < size; i++) {
                acc.re[i] += a.re[i] * b.re[i] - a.im[i] * b.im[i];
                acc.im[i] += a.re[i] * b.im[i] + a.im[i] * b.re[i];
            }
        },
        empty() {
            return { re: new Float64Array(size), im: new Float64Array(size) };
        },
        /** Back to a real signal of the requested length */
        inverse(spectrum, outLength) {
            const re = Float64Array.from(spectrum.re);
            const im = Float64Array.from(spectrum.im);
            fft(re, im, true);
            return re.subarray(0, outLength);
        },
    };
}

// ── Rendering one position ────────────────────────────────────────────────

function renderPosition(bformatFile, set, options) {
    const stem = path.basename(bformatFile).replace(/-Bformat\.wav$/i, '');
    const wav = readWav(bformatFile);

    if (wav.channels < 4) {
        return { stem, skipped: `${wav.channels} channels; first-order B-format needs 4` };
    }

    const [W, Y, Z, X] = wav.data;           // AmbiX: ACN 0..3
    const frames = wav.frames;

    const before = [
        { label: 'W (ACN 0)', rms: rms(W), peak: peak(W) },
        { label: 'Y (ACN 1)', rms: rms(Y), peak: peak(Y) },
        { label: 'Z (ACN 2)', rms: rms(Z), peak: peak(Z) },
        { label: 'X (ACN 3)', rms: rms(X), peak: peak(X) },
    ];

    const speakers = virtualSpeakers(options.maxRe);

    // Load each speaker's HRIR pair once, noting how far it had to reach
    const assigned = speakers.map(speaker => {
        const { entry, errorDeg } = nearestHrir(set, speaker.direction);
        const hrir = readWav(entry.file);
        if (hrir.channels < 2) {
            throw new Error(`${entry.file}: HRIR must be a stereo (left/right ear) file`);
        }
        return { speaker, entry, errorDeg, hrir };
    });

    const worstMismatch = Math.max(...assigned.map(a => a.errorDeg));
    const hrirLength = Math.max(...assigned.map(a => a.hrir.frames));
    const hrirRate = assigned[0].hrir.sampleRate;

    if (assigned.some(a => a.hrir.sampleRate !== hrirRate)) {
        return { stem, skipped: 'HRIR files disagree on sample rate' };
    }
    if (hrirRate !== wav.sampleRate) {
        return {
            stem,
            skipped: `HRIR set is ${hrirRate} Hz but the B-format is ${wav.sampleRate} Hz; ` +
                `resample one to match (this script will not silently stretch an HRIR)`,
        };
    }

    // Room for the whole convolution tail, then to the next power of two
    const conv = makeConvolver(frames + hrirLength);
    const left = conv.empty();
    const right = conv.empty();

    for (const { speaker, hrir } of assigned) {
        const [wW, wY, wZ, wX] = speaker.weights;

        // The decode is instantaneous, so the feed is just a weighted sum
        const feed = new Float64Array(frames);
        for (let i = 0; i < frames; i++) {
            feed[i] = wW * W[i] + wY * Y[i] + wZ * Z[i] + wX * X[i];
        }

        const feedSpectrum = conv.forward(feed);
        conv.multiplyAccumulate(left, feedSpectrum, conv.forward(hrir.data[0]));
        conv.multiplyAccumulate(right, feedSpectrum, conv.forward(hrir.data[1]));
    }

    const outLength = frames + hrirLength - 1;
    let brirL = conv.inverse(left, outLength);
    let brirR = conv.inverse(right, outLength);

    if (wav.sampleRate !== options.rate) {
        brirL = resample(brirL, wav.sampleRate, options.rate);
        brirR = resample(brirR, wav.sampleRate, options.rate);
    }

    const after = [
        { label: 'BRIR L', rms: rms(brirL), peak: peak(brirL) },
        { label: 'BRIR R', rms: rms(brirR), peak: peak(brirR) },
    ];

    let written = null;
    if (!options.dryRun) {
        const dir = options.out || path.dirname(bformatFile);
        written = [
            path.join(dir, `${stem}-BRIR-L.wav`),
            path.join(dir, `${stem}-BRIR-R.wav`),
        ];
        writeWav(written[0], [brirL], options.rate);
        writeWav(written[1], [brirR], options.rate);
    }

    return {
        stem, before, after, written, assigned, worstMismatch,
        inputRate: wav.sampleRate, outputRate: options.rate,
        frames, outLength,
        normalized: before.filter(b => Math.abs(b.peak - 1) < NORMALIZED_PEAK_EPSILON),
    };
}

// ── Reporting ─────────────────────────────────────────────────────────────

function reportPosition(result, options) {
    if (result.skipped) {
        console.log(`\n  ${result.stem}\n    skipped: ${result.skipped}`);
        return;
    }

    console.log(`\n  ${result.stem}  (${result.frames} → ${result.outLength} frames` +
        `${result.inputRate !== result.outputRate
            ? `, ${result.inputRate} → ${result.outputRate} Hz` : ` @ ${result.outputRate} Hz`})`);

    console.log('    B-format in                 RMS          peak');
    for (const c of result.before) {
        console.log(`      ${c.label.padEnd(20)}${fmtDb(c.rms)}  ${fmtDb(c.peak)}`);
    }

    console.log('    BRIR out                    RMS          peak');
    for (const c of result.after) {
        console.log(`      ${c.label.padEnd(20)}${fmtDb(c.rms)}  ${fmtDb(c.peak)}`);
    }

    // A BRIR pair should be close to level-matched between the ears for a
    // roughly centred source; a large imbalance is the first sign of a mirrored
    // azimuth convention or a swapped capsule order upstream.
    const [l, r] = result.after;
    if (l.rms > 0 && r.rms > 0) {
        console.log(`    L/R balance:          ${db(l.rms / r.rms).toFixed(2)} dB`);
    }

    if (options.verbose) {
        console.log('    virtual speakers:');
        for (const a of result.assigned) {
            console.log(`      az ${a.speaker.azimuth.toFixed(1).padStart(7)}° ` +
                `el ${a.speaker.elevation.toFixed(1).padStart(6)}°  →  ` +
                `${path.basename(a.entry.file)}  (${a.errorDeg.toFixed(2)}° away)`);
        }
    }

    if (result.worstMismatch > MAX_HRIR_MISMATCH_DEG) {
        console.log(`    warning: nearest HRIR is ${result.worstMismatch.toFixed(1)}° ` +
            `from a speaker direction; the set may be too sparse for this layout`);
    }

    if (result.written) {
        console.log(`    wrote ${path.basename(result.written[0])}, ` +
            `${path.basename(result.written[1])}`);
    }
}

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const options = {
        dirs: [],
        hrir: null,
        out: null,
        rate: DEFAULT_OUTPUT_RATE,
        pattern: DEFAULT_PATTERN,
        azimuthSign: 1,
        maxRe: true,
        dryRun: false,
        verbose: false,
        list: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--hrir') options.hrir = argv[++i];
        else if (arg === '--out') options.out = argv[++i];
        else if (arg === '--rate') options.rate = Number(argv[++i]);
        else if (arg === '--pattern') options.pattern = argv[++i];
        else if (arg === '--azimuth-sign') options.azimuthSign = Number(argv[++i]);
        else if (arg === '--basic') options.maxRe = false;
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--verbose' || arg === '-v') options.verbose = true;
        else if (arg === '--list') options.list = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        else options.dirs.push(arg);
    }

    if (![1, -1].includes(options.azimuthSign)) {
        throw new Error('--azimuth-sign must be 1 or -1');
    }
    return options;
}

const USAGE = `
B-format (AmbiX) → binaural room impulse response, via a SADIE II HRIR set

  node tools/bformat-to-brir.js --hrir <dir> [options] [<dir> ...]

  --hrir <dir>        the HRIR set (required; not shipped with this repo)
  <dir>               church folder(s) holding *-Bformat.wav; default: all of IR/
  --out <dir>         write here instead of beside the sources
  --rate <hz>         output sample rate (default ${DEFAULT_OUTPUT_RATE})
  --pattern <regex>   how to read azimuth then elevation from HRIR filenames
  --azimuth-sign <n>  1 or -1; flip if the render comes out mirrored
  --basic             plain projection decode instead of max-rE
  --list              print the parsed HRIR directions and stop
  --dry-run           measure and report, write nothing
  --verbose           show which HRIR each virtual speaker was given
  --help

Run tools/aformat-to-bformat.js first. Read the header of this file before
trusting the output.
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

    if (options.help) { console.log(USAGE); return; }

    if (!options.hrir) {
        console.error('error: --hrir is required\n');
        console.error('The SADIE II database is not shipped with this repository. Download it');
        console.error('from the University of York and point --hrir at the subject directory');
        console.error('(D1 is the Neumann KU100 dummy head, D2 is KEMAR).');
        console.error(USAGE);
        process.exit(1);
    }

    let set;
    try {
        set = loadHrirSet(options.hrir, options);
    } catch (err) {
        console.error(`error: ${err.message}`);
        process.exit(1);
    }

    const elevations = new Set(set.entries.map(e => e.elevation.toFixed(1)));
    console.log(`B-format → BRIR`);
    console.log(`  HRIR set           ${set.entries.length} directions from ${options.hrir}`);
    console.log(`                     ${elevations.size} elevation ring(s), ` +
        `azimuth sign ${options.azimuthSign > 0 ? '+ (counterclockwise)' : '- (clockwise)'}` +
        `   [convention — verify]`);
    if (set.unparsed.length) {
        console.log(`  unparsed           ${set.unparsed.length} file(s) did not match the pattern`);
    }
    console.log(`  decode             cube, 8 virtual speakers, ` +
        `${options.maxRe ? 'max-rE' : 'basic projection'}`);
    console.log(`  output             ${options.rate} Hz, 32-bit float, mono per ear`);
    if (options.dryRun) console.log(`  dry run — nothing will be written`);

    if (options.list) {
        console.log('\nParsed HRIR directions:');
        for (const e of set.entries.slice().sort((a, b) =>
            a.elevation - b.elevation || a.azimuth - b.azimuth)) {
            console.log(`  az ${e.azimuth.toFixed(1).padStart(7)}°  ` +
                `el ${e.elevation.toFixed(1).padStart(6)}°  ${path.basename(e.file)}`);
        }
        for (const f of set.unparsed) console.log(`  UNPARSED  ${f}`);
        return;
    }

    const root = path.join(__dirname, '..', 'IR');
    const dirs = options.dirs.length
        ? options.dirs
        : fs.readdirSync(root).map(d => path.join(root, d))
            .filter(d => fs.statSync(d).isDirectory());

    const results = [];
    for (const dir of dirs) {
        const files = fs.readdirSync(dir)
            .filter(f => /-Bformat\.wav$/i.test(f))
            .sort()
            .map(f => path.join(dir, f));

        console.log(`\n${path.basename(dir)}`);
        if (!files.length) {
            console.log('  no *-Bformat.wav found — run tools/aformat-to-bformat.js first');
            continue;
        }

        for (const file of files) {
            let result;
            try {
                result = renderPosition(file, set, options);
            } catch (err) {
                result = { stem: path.basename(file), skipped: err.message };
            }
            results.push(result);
            reportPosition(result, options);
        }
    }

    summarize(results);
}

function summarize(results) {
    const done = results.filter(r => !r.skipped);
    const skipped = results.filter(r => r.skipped);

    console.log(`\n${'─'.repeat(72)}`);
    console.log(`${done.length} BRIR pair(s) rendered, ${skipped.length} skipped`);

    const suspect = done.filter(r => r.normalized.length);
    if (suspect.length) {
        console.log(`
${'!'.repeat(72)}
${suspect.length} position(s) arrived with a B-format channel peaking at exactly full
scale. If that came from per-channel peak-normalized capsules, the soundfield
being decoded here is not the one that was measured, and no amount of care in
this step recovers it — a BRIR renders whatever directions it is given, whether
or not anybody stood there. See "Why not an ambisonic decode" in README.md.
${'!'.repeat(72)}`);
    }

    if (done.length) {
        console.log(`
Check before use:
  · L/R balance near 0 dB for a roughly centred source; a large imbalance means
    a mirrored azimuth convention or a capsule order wrong further upstream
  · listen for front/back confusion, which is normal at first order and is what
    max-rE trades image width to reduce
  · the HRIR set is one head, not yours; SADIE's D1/D2 are dummy heads chosen
    for being nobody in particular`);
    }
}

if (require.main === module) main();

module.exports = {
    loadHrirSet, virtualSpeakers, renderPosition, toCartesian, DEFAULT_PATTERN,
    angleBetween, nearestHrir, makeConvolver, CUBE_VERTICES,
};
