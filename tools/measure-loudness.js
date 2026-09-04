#!/usr/bin/env node
'use strict';
/**
 * Measures the loudness of each render mode and works out the trim that would
 * match it to plain stereo.
 *
 * The four modes do not arrive at the same level, and the difference is not a
 * constant: it depends on how much energy a room returns and on how each stage
 * treats it. Stereo is the reference — it is what the app plays with no flag
 * set — so for every church this renders all four modes offline, measures them,
 * and reports the dB each one needs to sit where stereo sits.
 *
 *   node tools/measure-loudness.js --dry-run
 *   node tools/measure-loudness.js --write
 *
 * Loudness is ITU-R BS.1770 / EBU R128 integrated LUFS: K-weighting, mean
 * square per channel, the -70 LUFS absolute gate and the -10 LU relative gate.
 * That rather than peak or plain RMS because it is the measure that tracks what
 * a listener calls "as loud as", which is what the trims are for.
 *
 * ── WHAT IS EXACT AND WHAT IS NOT ────────────────────────────────────────────
 *
 * Three of the four chains are reproduced here exactly as AudioEngine.js builds
 * them, down to the dry taper and the per-position gainDb:
 *
 *   stereo     IR channels 1 and 2, straight to the two ears
 *   brir       the measured binaural pair, one convolution per ear
 *   ambisonic  the B-format IR through Omnitone's own decode — its embedded
 *              HRIRs and its exact routing, so this is the real thing
 *
 * The fourth cannot be. The modelled binaural render uses the browser's
 * PannerNode, whose HRTF database lives inside Chrome and is not reachable from
 * here. This renders it with the SADIE set at the same +-30 degrees instead,
 * which gets the geometry right — two speakers, both ears — but not that
 * particular pair of ears. Its number is reported as an estimate and marked as
 * one. Where a church has already been trimmed by ear, the two are printed side
 * by side so the size of that error can be seen rather than assumed.
 *
 * @author Kritan Duwal
 */

const fs = require('fs');
const path = require('path');

const {
    readWav, resample, db, fft, findPositions, ambisonicBlock,
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

/** Where the modelled render's virtual speakers stand, matching the engine */
const VIRTUAL_SPEAKER_AZIMUTH = 30;

/** The app's defaults: the slider at 100%, so the dry path sits at its floor */
const MIX = 1.0;
const DRY_GAIN_AT_FULL_WET = 0.35;

/** Omnitone's own FOA decode filters, extracted from the library it ships */
const OMNITONE_HRIR = ['HRIR/omnitone-foa-1.wav', 'HRIR/omnitone-foa-2.wav'];

/**
 * The two responses the binaural stage convolves against, as the app loads
 * them. Reading these rather than picking a nearest match out of the full SADIE
 * set is what makes this measurement exact: it is the same two files.
 */
const VIRTUAL_SPEAKER_HRIR = ['HRIR/virtual-speaker-left.wav', 'HRIR/virtual-speaker-right.wav'];

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
 * easy to forget because it happens invisibly: the stereo and modelled-binaural
 * stages hand their impulse responses to a convolver at its default setting, so
 * the browser divides out the response's own RMS and multiplies by a fixed
 * calibration constant. The BRIR and ambisonic stages set normalize = false, so
 * they keep whatever level the offline decode gave them. Measuring one against
 * the other without reproducing this reports two stages as nearly matched when
 * they are fifteen-odd dB apart.
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
 * Renders every mode a position can offer, as stereo pairs.
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
        ir.brir ? ir.brir.left.length : 0,
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
    // BRIR and ambisonic stages set normalize = false and keep their own level.
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

    // Modelled binaural: the same two signals on virtual speakers at +-30
    if (options.speakers) {
        const feedLeft = modes.stereo[0];
        const feedRight = modes.stereo[1];
        const [near, far] = options.speakers;    // hrir pairs for -30 and +30
        const left = new Float64Array(outLength);
        const right = new Float64Array(outLength);
        const s = makeConvolver(outLength + near.left.length);
        const fl = s.spectrum(feedLeft);
        const fr = s.spectrum(feedRight);
        addScaled(left, s.multiply(fl, s.spectrum(near.left), outLength), 1);
        addScaled(left, s.multiply(fr, s.spectrum(far.left), outLength), 1);
        addScaled(right, s.multiply(fl, s.spectrum(near.right), outLength), 1);
        addScaled(right, s.multiply(fr, s.spectrum(far.right), outLength), 1);
        modes.binaural = [left, right];
    }

    // Measured binaural: the room and the head in one filter, straight out
    if (ir.brir) {
        modes.brir = [
            addScaled(Float64Array.from(dry), convolve(ir.brir.left), MIX),
            addScaled(Float64Array.from(dry), convolve(ir.brir.right), MIX),
        ];
    }

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

/** What a position can offer, skipping whatever it does not have */
function loadPosition(base) {
    const ir = { left: monoOf(base + '1.wav').data, right: monoOf(base + '2.wav').data };

    const brirLeft = base + 'BRIR-L.wav';
    if (fs.existsSync(brirLeft)) {
        ir.brir = { left: monoOf(brirLeft).data, right: monoOf(base + 'BRIR-R.wav').data };
    }

    const bformat = base + 'Bformat.wav';
    if (fs.existsSync(bformat)) {
        const wav = readWav(bformat);
        if (wav.channels >= 4) ir.bformat = wav.data.slice(0, 4);
    }

    return ir;
}

/**
 * The per-position reverb trim the app would apply, in dB.
 *
 * It sits upstream of every convolver, so it moves all four modes together —
 * but it moves only the wet path, so leaving it out would measure each mode at
 * a slightly different wet-to-dry balance than a listener hears.
 */
function gainDbFor(rooms, dir, stem) {
    const folder = path.basename(dir);
    for (const config of Object.values(rooms)) {
        if (path.basename(config.ir.dir) !== folder) continue;
        const match = /_(R\d+)$|\b(R\d+)$/.exec(stem);
        const receiver = match && (match[1] || match[2]);
        const entry = receiver && config.receivers[receiver];
        return (entry && entry.gainDb) || 0;
    }
    return 0;
}

/** Rewrites each church's trim line in Rooms.js with the measured levels */
function writeTrims(rooms, suggested) {
    const file = path.join(__dirname, '..', 'Javascript', 'Rooms.js');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const written = [];

    const round = (v) => (v === null || v === undefined ? 0 : Math.round(v * 10) / 10);

    for (const [key, config] of Object.entries(rooms)) {
        const folder = path.basename(config.ir.dir);
        const trims = suggested[folder];
        if (!trims) continue;

        // Line-by-line rather than a pattern over the whole file: church names
        // carry commas, full stops and apostrophes, and escaping them into a
        // regex is a great deal of care spent to arrive back where a plain
        // string comparison already is.
        const irLine = lines.findIndex(l => l.includes('ir:') && l.includes(config.ir.dir));
        if (irLine < 0) continue;

        const trimLine = lines.findIndex((l, i) =>
            i > irLine && l.trimStart().startsWith('trim:'));
        const nextChurch = lines.findIndex((l, i) => i > irLine && /^\s{4}\w+: \{/.test(l));
        if (trimLine < 0 || (nextChurch >= 0 && trimLine > nextChurch)) continue;

        const binaural = trims.binaural === null || trims.binaural === undefined
            ? 0 : round(trims.binaural);

        lines[trimLine] = `        trim:     { binaural: ${binaural}, ` +
            `brir: ${round(trims.brir)}, ambisonic: ${round(trims.ambisonic)} },`;
        written.push(`${key.padEnd(30)} ${lines[trimLine].trim()}`);
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
Measure each render mode's loudness and derive the trim that matches it to stereo

  node tools/measure-loudness.js [options] [<church dir> ...]

  --source <file>    what to measure through (default ${DEFAULT_SOURCE})
  --seconds <n>      excerpt length (default ${DEFAULT_SECONDS})
  --positions <n>    measure only the first n positions per church (0 = all)
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

    // The very files the app convolves against, so nothing is approximated
    let speakers = null;
    if (VIRTUAL_SPEAKER_HRIR.every(f => fs.existsSync(f))) {
        speakers = VIRTUAL_SPEAKER_HRIR.map(hrirPair);
    } else {
        console.warn('warning: speaker HRIRs not found, skipping the binaural mode');
    }

    console.log('Loudness match against stereo (ITU-R BS.1770 integrated LUFS)');
    console.log(`  source     ${options.source}, first ${(frames / src.sampleRate).toFixed(1)} s`);
    console.log(`  mix        100% (dry at ${dryGainFor(MIX).toFixed(3)}), stage gains at unity`);
    console.log(`  ambisonic  ${omnitone ? "Omnitone's own decode — exact" : 'skipped'}`);
    console.log(`  binaural   ${speakers
        ? `the app's own SADIE ears at +-${VIRTUAL_SPEAKER_AZIMUTH} deg — exact`
        : 'skipped'}`);

    const root = path.join(__dirname, '..', 'IR');
    const dirs = options.dirs.length ? options.dirs
        : fs.readdirSync(root).map(d => path.join(root, d))
            .filter(d => fs.statSync(d).isDirectory());

    const rooms = loadRooms();
    const perChurch = [];
    for (const dir of dirs) {
        const positions = [...findPositions(dir)].sort();
        const limit = options.positions || positions.length;
        const rows = [];

        for (const [stem, channels] of positions.slice(0, limit)) {
            const block = ambisonicBlock(channels);
            if (!block) continue;
            const base = path.join(dir, stem + '-');
            let ir;
            try {
                ir = loadPosition(base);
            } catch (err) {
                continue;
            }
            const modes = renderModes(source, ir, { gainDb: gainDbFor(rooms, dir, stem), speakers, omnitone, sampleRate: src.sampleRate });
            const lufs = {};
            for (const [name, pair] of Object.entries(modes)) {
                lufs[name] = integratedLufs(pair, src.sampleRate);
            }
            rows.push({ stem, lufs });
        }

        if (rows.length) perChurch.push({ dir, rows });
        reportChurch(dir, rows);
    }

    const suggested = summarize(perChurch, options);
    if (options.write) {
        const written = writeTrims(rooms, suggested);
        console.log(`\nWrote ${written.length} trim row(s) into Rooms.js:`);
        for (const row of written) console.log('  ' + row);
    }
}

/** Mean of a set of dB figures, in the energy domain where they belong */
function meanDb(values) {
    const usable = values.filter(Number.isFinite);
    if (!usable.length) return null;
    const mean = usable.reduce((a, v) => a + Math.pow(10, v / 10), 0) / usable.length;
    return 10 * Math.log10(mean);
}

const MODES = ['stereo', 'binaural', 'brir', 'ambisonic'];

function reportChurch(dir, rows) {
    console.log(`\n${path.basename(dir)}`);
    if (!rows.length) { console.log('  nothing measurable here'); return; }

    console.log('  position                       ' +
        MODES.map(m => m.padStart(10)).join('') + '      trims');
    for (const row of rows) {
        const cells = MODES.map(m => (Number.isFinite(row.lufs[m])
            ? row.lufs[m].toFixed(1) : '-').padStart(10)).join('');
        const trims = MODES.slice(1).map(m => Number.isFinite(row.lufs[m])
            ? (row.lufs.stereo - row.lufs[m]).toFixed(1) : '-').join(' / ');
        console.log('  ' + row.stem.padEnd(29) + cells + '   ' + trims);
    }
}

function summarize(perChurch, options) {
    console.log(`\n${'─'.repeat(78)}`);
    console.log('Per church, averaged over its positions. Trim = stereo LUFS - mode LUFS.\n');
    console.log('  church                          binaural      brir  ambisonic');

    const suggested = {};
    for (const { dir, rows } of perChurch) {
        const trimFor = (mode) => meanDb(rows
            .filter(r => Number.isFinite(r.lufs[mode]) && Number.isFinite(r.lufs.stereo))
            .map(r => r.lufs.stereo - r.lufs[mode]));

        const trims = {
            binaural: trimFor('binaural'),
            brir: trimFor('brir'),
            ambisonic: trimFor('ambisonic'),
        };
        suggested[path.basename(dir)] = trims;

        console.log('  ' + path.basename(dir).padEnd(30) +
            ['binaural', 'brir', 'ambisonic']
                .map(m => (trims[m] === null ? '-' : trims[m].toFixed(1)).padStart(10)).join(''));
    }

    console.log(`
Every column runs the filters the app runs: the same SADIE ears across all three
renders, and Omnitone's own decode for the ambisonic one. No part of this is an
estimate any more.`);

    if (!options.write) {
        console.log('\nNothing written. Pass --write to put these into Rooms.js.');
    }
    return suggested;
}

if (require.main === module) main();

module.exports = { integratedLufs, biquad, renderModes, meanDb, K_SHELF, K_HIGHPASS };
