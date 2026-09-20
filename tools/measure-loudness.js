#!/usr/bin/env node
'use strict';
/**
 * Measures the loudness of the headphone render and works out the trim that
 * would match it to plain stereo.
 *
 * The two stages do not arrive at the same level, and the difference is not a
 * constant: it depends on how much energy a room returns and on how each stage
 * treats it. Stereo is the reference — it is what the app plays with the button
 * off — so for every recovered set this renders both offline, measures them,
 * and reports the dB the render needs to sit where stereo sits.
 *
 *   node tools/measure-loudness.js --dry-run
 *   node tools/measure-loudness.js --write
 *
 * Loudness is ITU-R BS.1770 / EBU R128 integrated LUFS: K-weighting, mean
 * square per channel, the -70 LUFS absolute gate and the -10 LU relative gate.
 * That rather than peak or plain RMS because it is the measure that tracks what
 * a listener calls "as loud as", which is what the trims are for.
 *
 * ── BOTH CHAINS ARE REPRODUCED EXACTLY ───────────────────────────────────────
 *
 * Each is rebuilt here as AudioEngine.js builds it, down to the dry taper, the
 * per-position gainDb, and which convolvers normalize and which do not:
 *
 *   stereo     IR channels 1 and 2, straight to the two ears
 *   ambisonic  the B-format IR through Omnitone's own decode — its embedded
 *              HRIRs and its exact routing
 *
 * No part of this measurement is an estimate: the ambisonic column runs the
 * decode the browser runs, not a model of it.
 *
 * @author Kritan Duwal
 */

const fs = require('fs');
const path = require('path');

const {
    readWav, resample, db, fft, findPositions, ambisonicBlock, peak: peakOf,
} = require('./aformat-to-bformat.js');

/** ROOMS, read the way the harness does: the file declares a bare const */
function loadRooms() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'Javascript', 'Rooms.js'), 'utf8');
    return new Function(source + '; return ROOMS;')();
}

// ── Configuration ─────────────────────────────────────────────────────────

/** Source the app loads on startup, and so the one a visitor hears */
const DEFAULT_SOURCE = 'Source Files/Clarinet.wav';

/**
 * Seconds of source to measure.
 *
 * Integrated loudness settles quickly on material this uniform, and every mode
 * is measured on the same excerpt, so what matters is that it is long enough
 * for the relative gate to have something to work with. Longer costs real time:
 * the convolutions are the whole expense here.
 */
const DEFAULT_SECONDS = 12;

/** The app's defaults: the slider at 100%, so the dry path sits at its floor */
const MIX = 1.0;
const DRY_GAIN_AT_FULL_WET = 0.35;

/** Omnitone's own FOA decode filters, extracted from the library it ships */
const OMNITONE_HRIR = ['HRIR/omnitone-foa-1.wav', 'HRIR/omnitone-foa-2.wav'];

// ── BS.1770 loudness ──────────────────────────────────────────────────────

/**
 * K-weighting, stage one: the shelving filter that stands in for the way a head
 * lifts everything above about 1.5 kHz. Coefficients as published in the
 * standard for 48 kHz, which is what everything in this library runs at.
 */
const K_SHELF = {
    b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
    a: [1, -1.69065929318241, 0.73248077421585],
};

/** K-weighting, stage two: the RLB high-pass that discards inaudible rumble */
const K_HIGHPASS = {
    b: [1.0, -2.0, 1.0],
    a: [1, -1.99004745483398, 0.99007225036621],
};

/** Direct-form-I biquad, run over a whole channel */
function biquad(signal, { b, a }) {
    const out = new Float64Array(signal.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < signal.length; n++) {
        const x0 = signal[n];
        const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
        out[n] = y0;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
    }
    return out;
}

/**
 * Integrated loudness in LUFS.
 *
 * The gating is what separates this from a plain weighted RMS: 400 ms blocks
 * overlapping by 75%, everything below -70 LUFS thrown out as silence, then a
 * second pass throwing out everything more than 10 LU below what remains. Both
 * gates exist so that pauses in the material do not drag the answer down, which
 * is exactly the failure that would make two rooms with different reverb tails
 * look like they were at different levels when they are not.
 *
 * @param channels Planar float channels, left first
 */
function integratedLufs(channels, sampleRate) {
    // Channel weights: the front pair count for one apiece
    const weighted = channels.map(ch => biquad(biquad(ch, K_SHELF), K_HIGHPASS));

    const blockSize = Math.round(0.4 * sampleRate);
    const hop = Math.round(0.1 * sampleRate);          // 75% overlap
    const frames = weighted[0].length;
    if (frames < blockSize) return -Infinity;

    // Mean square per block, summed across channels
    const blocks = [];
    for (let start = 0; start + blockSize <= frames; start += hop) {
        let sum = 0;
        for (const ch of weighted) {
            let acc = 0;
            for (let i = start; i < start + blockSize; i++) acc += ch[i] * ch[i];
            sum += acc / blockSize;
        }
        blocks.push(sum);
    }
    if (!blocks.length) return -Infinity;

    const loudnessOf = (meanSquare) => -0.691 + 10 * Math.log10(meanSquare);

    // Absolute gate, then the relative gate computed from what survives it
    const aboveAbsolute = blocks.filter(ms => ms > 0 && loudnessOf(ms) > -70);
    if (!aboveAbsolute.length) return -Infinity;

    const ungated = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length;
    const threshold = loudnessOf(ungated) - 10;

    const kept = aboveAbsolute.filter(ms => loudnessOf(ms) > threshold);
    if (!kept.length) return -Infinity;

    return loudnessOf(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/**
 * The scale a ConvolverNode applies to its buffer when `normalize` is left on.
 *
 * This is the whole reason the modes arrive at such different levels, and it is
 * easy to forget because it happens invisibly: the stereo stage hands its
 * impulse responses to a convolver at its default setting, so the browser
 * divides out the response's own RMS and multiplies by a fixed calibration
 * constant. The ambisonic stage sets normalize = false and keeps whatever level
 * the offline decode gave it. Measuring one against the other without
 * reproducing this reports two stages as matched when they are not.
 *
 * Reproduced from the algorithm the Web Audio specification publishes for it,
 * constants included.
 */
function convolverNormalizationScale(channels, length, sampleRate) {
    const GAIN_CALIBRATION = 0.00125;
    const GAIN_CALIBRATION_SAMPLE_RATE = 44100;
    const MIN_POWER = 0.000125;

    let power = 0;
    for (const channel of channels) {
        for (let i = 0; i < length; i++) power += channel[i] * channel[i];
    }
    power = Math.sqrt(power / (channels.length * length));
    if (!Number.isFinite(power) || power < MIN_POWER) power = MIN_POWER;

    let scale = (1 / power) * GAIN_CALIBRATION
        * (GAIN_CALIBRATION_SAMPLE_RATE / sampleRate);

    // The specification's true-stereo compensation; not reached here, since
    // every response this measures is handed over one channel at a time.
    if (channels.length === 4) scale *= 0.5;

    return scale;
}

// ── Convolution ───────────────────────────────────────────────────────────

/**
 * Overlap-free FFT convolution, sized once per position and reused.
 *
 * Every mode convolves the same source against different responses, so the
 * source is transformed once and the spectrum kept. That is most of the saving:
 * the transforms, not the multiplies, are what this costs.
 */
function makeConvolver(length) {
    const size = 1 << Math.ceil(Math.log2(length));
    return {
        size,
        spectrum(signal) {
            const re = new Float64Array(size);
            const im = new Float64Array(size);
            re.set(signal.subarray(0, Math.min(signal.length, size)));
            fft(re, im, false);
            return { re, im };
        },
        /** a x b, back to the time domain, trimmed to `length` */
        multiply(a, b, outLength) {
            const re = new Float64Array(size);
            const im = new Float64Array(size);
            for (let i = 0; i < size; i++) {
                re[i] = a.re[i] * b.re[i] - a.im[i] * b.im[i];
                im[i] = a.re[i] * b.im[i] + a.im[i] * b.re[i];
            }
            fft(re, im, true);
            return re.subarray(0, outLength);
        },
    };
}

/** out += gain * signal, in place */
function addScaled(out, signal, gain) {
    const n = Math.min(out.length, signal.length);
    for (let i = 0; i < n; i++) out[i] += gain * signal[i];
    return out;
}

// ── Rendering the four modes ──────────────────────────────────────────────

/** The engine's dry taper at a given mix; at 100% it sits at its floor */
function dryGainFor(mix) {
    return Math.min(1.0, Math.pow(DRY_GAIN_AT_FULL_WET, (10 * mix - 1) / 9));
}

function reductionToGain(reductionDb) {
    return Math.pow(10, -reductionDb / 20);
}

/**
 * Renders both stages of a position, as stereo pairs.
 *
 * Mirrors buildConvolutionGraph(): one dry copy at the taper's level, one
 * trimmed copy into the convolvers, and the same dry signal centred in every
 * stage. The stage output gains are deliberately left at unity — what is being
 * measured is where each stage lands before any trim, which is the number the
 * trim is derived from.
 */
function renderModes(source, ir, options) {
    const frames = source.length;
    const tail = Math.max(
        ir.left.length,
        ir.bformat ? ir.bformat[0].length : 0);
    const outLength = frames + tail - 1;

    const conv = makeConvolver(outLength);
    const dryGain = dryGainFor(MIX);
    const trimmed = new Float64Array(frames);
    const irTrim = reductionToGain(options.gainDb);
    for (let i = 0; i < frames; i++) trimmed[i] = source[i] * irTrim;

    const wetSpectrum = conv.spectrum(trimmed);
    const convolve = (response) => conv.multiply(wetSpectrum, conv.spectrum(response), outLength);

    const dry = new Float64Array(outLength);
    addScaled(dry, source, dryGain);

    const modes = {};

    // Stereo: one convolver per ear, dry centred between them
    // The IR pair is the only response the app lets a convolver normalize; the
    // ambisonic stage sets normalize = false and keeps its own level.
    const rate = options.sampleRate;
    const wetLeft = convolve(ir.left);
    const wetRight = convolve(ir.right);
    const normLeft = convolverNormalizationScale([ir.left], ir.left.length, rate);
    const normRight = convolverNormalizationScale([ir.right], ir.right.length, rate);
    for (let n = 0; n < wetLeft.length; n++) wetLeft[n] *= normLeft;
    for (let n = 0; n < wetRight.length; n++) wetRight[n] *= normRight;
    modes.stereo = [
        addScaled(Float64Array.from(dry), wetLeft, MIX),
        addScaled(Float64Array.from(dry), wetRight, MIX),
    ];

    // Live ambisonic: four channels, then Omnitone's own decode
    if (ir.bformat && options.omnitone) {
        const ambi = ir.bformat.map(channel => convolve(channel));
        // Dry enters as a plane wave from straight ahead: W and X only
        addScaled(ambi[0], dry, 1);
        addScaled(ambi[3], dry, 1);

        const [wy, zx] = options.omnitone;
        const a = makeConvolver(outLength + wy.left.length);
        const filtered = {
            w: a.multiply(a.spectrum(ambi[0]), a.spectrum(wy.left), outLength),
            y: a.multiply(a.spectrum(ambi[1]), a.spectrum(wy.right), outLength),
            z: a.multiply(a.spectrum(ambi[2]), a.spectrum(zx.left), outLength),
            x: a.multiply(a.spectrum(ambi[3]), a.spectrum(zx.right), outLength),
        };
        // W, Z and X reach both ears alike; Y is what tells them apart
        const left = new Float64Array(outLength);
        const right = new Float64Array(outLength);
        for (const key of ['w', 'z', 'x']) {
            addScaled(left, filtered[key], 1);
            addScaled(right, filtered[key], 1);
        }
        addScaled(left, filtered.y, 1);
        addScaled(right, filtered.y, -1);
        modes.ambisonic = [left, right];
    }

    return modes;
}

// ── Loading ───────────────────────────────────────────────────────────────

function monoOf(file) {
    const wav = readWav(file);
    return { data: wav.data[0], sampleRate: wav.sampleRate, channels: wav.data };
}

/** Both ears of one HRIR file, as the SADIE set stores them */
function hrirPair(file) {
    const wav = readWav(file);
    return { left: wav.data[0], right: wav.data[1] };
}

/**
 * What a position can offer, skipping whatever it does not have.
 *
 * Two bases, mirroring the engine: the impulse response pair stereo convolves,
 * and the B-format behind the headphone render. Measuring a recovered set means
 * measuring the combination the app actually plays — the originals decoded,
 * against the published library's stereo — rather than the originals on their
 * own, which would calibrate them to a reference no visitor hears.
 */
function loadPosition(base, decodedBase = base) {
    const ir = { left: monoOf(base + '1.wav').data, right: monoOf(base + '2.wav').data };

    const bformat = decodedBase + 'Bformat.wav';
    if (fs.existsSync(bformat)) {
        const wav = readWav(bformat);
        if (wav.channels >= 4) ir.bformat = wav.data.slice(0, 4);
    }

    return ir;
}

/**
 * A directory as ROOMS spells it: relative to the repository, forward slashes.
 *
 * Callers reach this tool with either form — a path typed on the command line
 * or an absolute one built from ROOMS when it defaults to the whole library —
 * land on the same key. Matching on the basename alone used to be enough and no
 * longer is: every church keeps its originals in a folder of the same name, so
 * the tail is the one part of the path that does not identify a church.
 */
const REPO_ROOT = path.join(__dirname, '..');

function irDirKey(dir) {
    return path.relative(REPO_ROOT, path.resolve(REPO_ROOT, dir)).split(path.sep).join('/');
}

/**
 * Which church a directory holds, and which of its two file sets.
 *
 * @returns { key, config, source, set } or null for a directory ROOMS does not
 *          know about — `source` is whichever of the two carries the `ir` and
 *          the `trim` that belong to these files
 */
function setFor(rooms, dir) {
    const wanted = irDirKey(dir);
    for (const [key, config] of Object.entries(rooms)) {
        if (irDirKey(config.ir.dir) === wanted) {
            return { key, config, source: config, set: 'published' };
        }
        if (config.unnormalized && irDirKey(config.unnormalized.ir.dir) === wanted) {
            return { key, config, source: config.unnormalized, set: 'unnormalized' };
        }
    }
    return null;
}

/**
 * How a measured directory is named in the report: the church, plus a marker
 * where the row is its originals rather than its published library.
 *
 * The church comes from the folder above the set, since the set folders are all
 * called the same two things — naming the set instead would print `Normalized`
 * down the whole summary column.
 */
function labelFor(rooms, dir) {
    const found = setFor(rooms, dir);
    if (!found) return path.basename(path.dirname(path.resolve(dir)));
    return path.basename(path.dirname(found.config.ir.dir)) +
        (found.set === 'unnormalized' ? '  (originals)' : '');
}

/**
 * Which receiver a file stem belongs to, e.g. "MIC_IN_R3" -> "R3".
 *
 * Both spellings the library uses: prefix_receiver, and the positions filed
 * under their own name ("St Francis_IN_balcony R8"). "" keeps a stray file out
 * of the trim table.
 */
function receiverOf(stem) {
    const match = /_(R\d+)$|\b(R\d+)$/.exec(stem);
    return (match && (match[1] || match[2])) || '';
}

/**
 * The per-position reverb trim the app would apply, in dB.
 *
 * It sits upstream of every convolver, so it moves both stages together — but
 * it moves only the wet path, so leaving it out would measure each stage at a
 * slightly different wet-to-dry balance than a listener hears.
 *
 * Read off the church rather than off the set: a position's distance from the
 * source is a fact about the room, so both sets of its files carry it.
 */
function gainDbFor(rooms, dir, stem) {
    const found = setFor(rooms, dir);
    if (!found) return 0;

    const entry = found.config.receivers[receiverOf(stem)];
    return (entry && entry.gainDb) || 0;
}

/**
 * Rewrites each measured trim line in Rooms.js with the levels just found.
 *
 * A church can have two of them — the published library's and its originals' —
 * and each is found the same way: locate the `ir:` line naming that set's
 * directory, then take the first `trim:` line below it. Only sets that were
 * actually measured in this run are touched.
 */
function writeTrims(rooms, suggested) {
    const file = path.join(__dirname, '..', 'Javascript', 'Rooms.js');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const written = [];

    const round = (v) => (v === null || v === undefined ? 0 : Math.round(v * 10) / 10);

    const hasLevels = (t) => t && t.ambisonic && Object.keys(t.ambisonic).length;

    // Only the recovered sets carry a trim; a church without one has no line
    const sets = Object.entries(rooms)
        .filter(([, config]) => config.unnormalized)
        .map(([key, config]) => ({ key: key + '.unnormalized', source: config.unnormalized }));

    for (const { key, source } of sets) {
        const trims = suggested[irDirKey(source.ir.dir)];
        if (!hasLevels(trims)) continue;

        // Line-by-line rather than a pattern over the whole file: church names
        // carry commas, full stops and apostrophes, and escaping them into a
        // regex is a great deal of care spent to arrive back where a plain
        // string comparison already is.
        const irLine = lines.findIndex(l => l.includes('ir:') && l.includes(source.ir.dir));
        if (irLine < 0) continue;

        const trimLine = lines.findIndex((l, i) =>
            i > irLine && l.trimStart().startsWith('trim:'));
        const nextChurch = lines.findIndex((l, i) => i > irLine && /^\s{4}\w+: \{/.test(l));
        if (trimLine < 0 || (nextChurch >= 0 && trimLine > nextChurch)) continue;

        // Everything up to the brace is kept as found, so a line is rewritten
        // at whatever indent and alignment it already had — a tool asked only
        // to change some numbers should not reformat the file around them.
        const prefix = lines[trimLine].slice(0, lines[trimLine].indexOf('{'));
        const levels = Object.entries(trims.ambisonic)
            .map(([receiver, db]) => `${receiver}: ${round(db)}`).join(', ');
        lines[trimLine] = `${prefix}{ ambisonic: { ${levels} } },`;
        written.push(`${key.padEnd(34)} ${Object.keys(trims.ambisonic).length} position(s)`);
    }

    fs.writeFileSync(file, lines.join('\r\n'));
    return written;
}

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const options = {
        dirs: [], source: DEFAULT_SOURCE, seconds: DEFAULT_SECONDS,
        write: false, positions: 0,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--source') options.source = argv[++i];
        else if (arg === '--seconds') options.seconds = Number(argv[++i]);
        else if (arg === '--positions') options.positions = Number(argv[++i]);
        else if (arg === '--write') options.write = true;
        else if (arg === '--dry-run') options.write = false;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        else options.dirs.push(arg);
    }
    return options;
}

const USAGE = `
Measure the headphone render's loudness and derive the trim that matches it to stereo

  node tools/measure-loudness.js [options] [<set dir> ...]

  --source <file>    what to measure through (default ${DEFAULT_SOURCE})
  --seconds <n>      excerpt length (default ${DEFAULT_SECONDS})
  --positions <n>    measure only the first n positions per set (0 = all)
  --write            update the trim values in Rooms.js
  --dry-run          report only (default)
  --help
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

    const src = monoOf(options.source);
    const frames = Math.min(src.data.length, Math.round(options.seconds * src.sampleRate));
    const source = src.data.subarray(0, frames);

    let omnitone = null;
    if (OMNITONE_HRIR.every(f => fs.existsSync(f))) {
        omnitone = OMNITONE_HRIR.map(hrirPair);
    } else {
        console.warn('warning: Omnitone HRIRs not found, skipping the ambisonic mode');
    }

    console.log('Loudness match against stereo (ITU-R BS.1770 integrated LUFS)');
    console.log(`  source     ${options.source}, first ${(frames / src.sampleRate).toFixed(1)} s`);
    console.log(`  mix        100% (dry at ${dryGainFor(MIX).toFixed(3)}), stage gains at unity`);
    console.log(`  ambisonic  ${omnitone ? "Omnitone's own decode — exact" : 'skipped'}`);

    const rooms = loadRooms();

    // The recovered sets only: nothing else is rendered through anything but
    // stereo, so nothing else has a trim to derive. Each is still measured
    // against its church's published stereo, via publishedDir below.
    //
    // From ROOMS rather than by walking IR/, since a folder no church points at
    // has nowhere to put the answer.
    const dirs = options.dirs.length ? options.dirs
        : Object.values(rooms)
            .filter(c => c.unnormalized)
            .map(c => path.join(REPO_ROOT, c.unnormalized.ir.dir))
            .filter(d => fs.existsSync(d));

    const perChurch = [];
    for (const dir of dirs) {
        const positions = [...findPositions(dir)].sort();
        const limit = options.positions || positions.length;
        const rows = [];

        // Measuring a recovered set measures the pairing the app plays: these
        // decoded files against the published library's stereo, which is the
        // reference every trim is relative to and which the flag leaves alone.
        const found = setFor(rooms, dir);
        const publishedDir = found && found.set === 'unnormalized'
            ? path.join(REPO_ROOT, found.config.ir.dir) : dir;

        for (const [stem, channels] of positions.slice(0, limit)) {
            const block = ambisonicBlock(channels);
            if (!block) continue;
            const base = path.join(publishedDir, stem + '-');
            const decodedBase = path.join(dir, stem + '-');
            let ir;
            try {
                ir = loadPosition(base, decodedBase);
            } catch (err) {
                continue;
            }
            const modes = renderModes(source, ir, { gainDb: gainDbFor(rooms, dir, stem), omnitone, sampleRate: src.sampleRate });
            const lufs = {};
            const peaks = {};
            for (const [name, pair] of Object.entries(modes)) {
                lufs[name] = integratedLufs(pair, src.sampleRate);
                peaks[name] = Math.max(...pair.map(peakOf));
            }
            rows.push({ stem, receiver: receiverOf(stem), lufs, peaks });
        }

        const label = labelFor(rooms, dir);
        if (rows.length) perChurch.push({ dir, label, rows });
        reportChurch(label, rows);
    }

    const suggested = summarize(perChurch, options);
    if (options.write) {
        const written = writeTrims(rooms, suggested);
        console.log(`\nWrote ${written.length} trim row(s) into Rooms.js:`);
        for (const row of written) console.log('  ' + row);
    }
}

const MODES = ['stereo', 'ambisonic'];

/** The trim one position wants: what it takes to sit where its stereo sits */
function trimOf(row, mode = 'ambisonic') {
    if (!Number.isFinite(row.lufs[mode]) || !Number.isFinite(row.lufs.stereo)) return null;
    return row.lufs.stereo - row.lufs[mode];
}

/**
 * Peak of the stage once its trim is applied, in dBFS. Matching loudness says
 * nothing about crest factor, and anything above 0 dBFS is clipped at the
 * destination rather than merely loud.
 */
function trimmedPeakDb(row, mode = 'ambisonic') {
    const trim = trimOf(row, mode);
    if (trim === null || !(row.peaks[mode] > 0)) return null;
    return db(row.peaks[mode]) + trim;
}

function reportChurch(label, rows) {
    console.log(`\n${label}`);
    if (!rows.length) { console.log('  nothing measurable here'); return; }

    console.log('  position                       ' +
        MODES.map(m => m.padStart(10)).join('') + '       trim      peak');
    for (const row of rows) {
        const cells = MODES.map(m => (Number.isFinite(row.lufs[m])
            ? row.lufs[m].toFixed(1) : '-').padStart(10)).join('');
        const trim = trimOf(row);
        const peak = trimmedPeakDb(row);
        console.log('  ' + row.stem.padEnd(29) + cells +
            (trim === null ? '-' : trim.toFixed(1)).padStart(11) +
            (peak === null ? '-' : peak.toFixed(1)).padStart(10) +
            (peak !== null && peak > 0 ? '  CLIPS' : ''));
    }
}

function summarize(perChurch, options) {
    console.log(`\n${'─'.repeat(78)}`);
    console.log('Per position. Trim = stereo LUFS - ambisonic LUFS.\n');
    console.log('  church                              trims      spread');

    const suggested = {};
    for (const { dir, label, rows } of perChurch) {
        // Per receiver, not per church: stereo was normalized per position
        // and the recovered set scaled as a whole, so the correction differs at
        // every seat. See `trim` in Rooms.js.
        const byReceiver = {};
        for (const row of rows) {
            const trim = trimOf(row);
            if (row.receiver && trim !== null) byReceiver[row.receiver] = trim;
        }

        // Keyed by directory rather than by church: a church measured from both
        // its sets produces two rows, and they must not overwrite each other.
        suggested[irDirKey(dir)] = { ambisonic: byReceiver };

        const values = Object.values(byReceiver);
        const spread = values.length
            ? (Math.max(...values) - Math.min(...values)).toFixed(1) + ' dB' : '-';
        console.log('  ' + label.padEnd(36) + String(values.length).padStart(5) +
            spread.padStart(12));
    }

    const clipping = perChurch.flatMap(({ label, rows }) => rows
        .filter(r => (trimmedPeakDb(r) ?? -Infinity) > 0)
        .map(r => `${label} ${r.stem}`));
    if (clipping.length) {
        console.log(`\n  ${clipping.length} position(s) still peak above 0 dBFS once trimmed:`);
        for (const where of clipping) console.log('    ' + where);
        console.log('  Matching loudness does not bound peak; these want headroom of their own.');
    }

    console.log(`
The ambisonic column runs Omnitone's own decode — the filters the browser runs,
not a model of them — so no part of this is an estimate.`);

    if (!options.write) {
        console.log('\nNothing written. Pass --write to put these into Rooms.js.');
    }
    return suggested;
}

if (require.main === module) main();

module.exports = { integratedLufs, biquad, renderModes, K_SHELF, K_HIGHPASS };
