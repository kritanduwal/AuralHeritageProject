'use strict';
/**
 * tools/aformat-to-bformat.js — the two-capsule rebuild the headphone render
 * plays, and the pieces it is made from.
 *
 * Driven by a synthetic room rather than the library: a frontal plane wave,
 * then a diffuse tail of thousands of arrivals from random directions, as four
 * ideal coincident cardioids would hear it. Every expected value is then known
 * exactly, which no recording can offer.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('./helpers/harness.js');
const T = require(path.join(ROOT, 'tools', 'aformat-to-bformat.js'));

const RATE = 48000;
const ms = (m) => Math.round(m * RATE / 1000);
const ONSET = 1000;
const FRAMES = ms(600);

/** Seeded, so a failure is the same failure every run */
function prng(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const unit = (v) => v.map(c => c / Math.hypot(...v));
const AXES = { FLU: unit([1, 1, 1]), FRD: unit([1, -1, -1]), BLD: unit([-1, 1, -1]), BRU: unit([-1, -1, 1]) };
const cardioid = (axis, u) => 0.5 * (1 + axis[0] * u[0] + axis[1] * u[1] + axis[2] * u[2]);

/**
 * Four capsule signals: a unit plane wave from `from` at ONSET, then a diffuse
 * tail from 3 ms on — clear of the direct-sound window — decaying with a
 * 150 ms time constant.
 */
function room({ from = [1, 0, 0], arrivals = 6000, tail = true, seed = 7 } = {}) {
    const caps = Object.fromEntries(Object.keys(AXES).map(n => [n, new Float64Array(FRAMES)]));
    for (const n of Object.keys(AXES)) caps[n][ONSET] = cardioid(AXES[n], from);
    if (!tail) return caps;

    const random = prng(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
    for (let k = 0; k < arrivals; k++) {
        const t = ONSET + ms(3) + Math.floor(random() * (FRAMES - ONSET - ms(3)));
        const z = 2 * random() - 1, phi = 2 * Math.PI * random(), r = Math.sqrt(1 - z * z);
        const u = [r * Math.cos(phi), r * Math.sin(phi), z];
        const a = 0.3 * gauss() * Math.exp(-(t - ONSET) / ms(150));
        for (const n of Object.keys(AXES)) caps[n][t] += a * cardioid(AXES[n], u);
    }
    return caps;
}

const rebuild = (caps) => T.rebuildFromPair(caps, RATE, { eq: false, radius: T.CAPSULE_RADIUS_M });
const energy = (s, a, b) => { let e = 0; for (let i = a; i < b; i++) e += s[i] * s[i]; return e; };
const corr = (p, q, a, b) => {
    let pq = 0, pp = 0, qq = 0;
    for (let i = a; i < b; i++) { pq += p[i] * q[i]; pp += p[i] * p[i]; qq += q[i] * q[i]; }
    return pq / Math.sqrt(pp * qq);
};
const db = (x) => 10 * Math.log10(x);
const delayed = (s, n) => { const out = new Float64Array(s.length); out.set(s.subarray(0, s.length - n), n); return out; };

const base = room();
const built = rebuild(base);

// ── the direct sound ──────────────────────────────────────────────────────

test('a frontal plane wave comes out as exactly the B-format of one', () => {
    // W = FRD + BLD = 1, and the figure-8 reaches the diagonal at cos 45°, which
    // the √2 gives back: W = 1, X = 1, Y = Z = 0
    assert.ok(Math.abs(built.W[ONSET] - 1) < 1e-9, `W ${built.W[ONSET]}`);
    assert.ok(Math.abs(built.X[ONSET] - 1) < 1e-9, `X ${built.X[ONSET]}`);
    const end = ONSET + ms(T.DIRECT_WINDOW_MS);
    for (const [name, c] of [['Y', built.Y], ['Z', built.Z]]) {
        const loudest = c.subarray(0, end).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        assert.ok(loudest < 1e-9, `${name} carries ${loudest} through the direct sound`);
    }
    assert.equal(built.lag, 0);
    assert.equal(built.reversed, false);
});

test('the direct sound reads straight ahead and level', () => {
    const { azimuth, elevation } = T.directionOf(built, RATE);
    assert.ok(Math.abs(azimuth) < 0.5, `azimuth ${azimuth}`);
    assert.ok(Math.abs(elevation) < 0.5, `elevation ${elevation}`);
});

test('an array that faced away is turned round', () => {
    // Swapping the capsules is the same signal as the source behind the array
    const swapped = rebuild({ ...base, FRD: base.BLD, BLD: base.FRD });
    assert.equal(swapped.reversed, true);
    assert.ok(Math.abs(swapped.X[ONSET] - 1) < 1e-9, `X ${swapped.X[ONSET]}`);
});

// ── the diffuse fill ──────────────────────────────────────────────────────

test('the tail fills X, Y and Z alike, and none of them follows another', () => {
    const [a, b] = [ONSET + ms(150), FRAMES - ms(30)];
    const ex = energy(built.X, a, b);
    for (const [name, c] of [['Y', built.Y], ['Z', built.Z]]) {
        const gap = db(energy(c, a, b) / ex);
        assert.ok(Math.abs(gap) < 1.5, `${name} sits ${gap.toFixed(2)} dB from X in the tail`);
    }
    for (const [name, p, q] of [['X·Y', built.X, built.Y], ['X·Z', built.X, built.Z], ['Y·Z', built.Y, built.Z],
        ['W·Y', built.W, built.Y], ['W·Z', built.W, built.Z]]) {
        const r = corr(p, q, a, b);
        assert.ok(Math.abs(r) < 0.1, `${name} correlate at ${r.toFixed(3)}; a diffuse fill should not`);
    }
});

test('the early fill runs EARLY_DIFFUSE_GAIN_DB above the tail\'s', () => {
    const ratio = (a, b) => db(energy(built.Y, a, b) / energy(built.X, a, b));
    const early = ratio(ONSET + ms(10), ONSET + ms(70));
    const late = ratio(ONSET + ms(150), FRAMES - ms(30));
    const boost = early - late;
    assert.ok(Math.abs(boost - T.EARLY_DIFFUSE_GAIN_DB) < 1,
        `early Y sits ${boost.toFixed(2)} dB above the late ratio, want ${T.EARLY_DIFFUSE_GAIN_DB}`);
});

// ── realigning the pair ───────────────────────────────────────────────────

test('a recording-chain lag between the capsules is found and taken out', () => {
    // St Francis R7 runs 907 samples late; 500 stands in for it
    const late = rebuild({ ...base, BLD: delayed(base.BLD, 500) });
    assert.equal(late.lag, 500);
    for (const name of ['W', 'X']) {
        let worst = 0;
        for (let i = 0; i < FRAMES - 600; i++) worst = Math.max(worst, Math.abs(late[name][i] - built[name][i]));
        assert.ok(worst < 1e-9, `${name} differs by ${worst} once realigned`);
    }
});

test('a lag capsule spacing can explain is left alone', () => {
    const near = rebuild({ ...base, BLD: delayed(base.BLD, 2) });
    assert.equal(near.lag, 0);
});

test('tails with nothing in common read as no lag, not the end of the search', () => {
    // With no tail every lag correlates to zero, and the first one tried used to win
    const dry = room({ tail: false });
    assert.equal(T.chainLag(dry.FRD, dry.BLD, RATE, ONSET), 0);
});

// ── the parts ─────────────────────────────────────────────────────────────

test('a decorrelator is a unit-energy, flat-magnitude all-pass', () => {
    const h = T.designDecorrelator(1);
    assert.equal(h.length, 1024);
    assert.ok(Math.abs(energy(h, 0, h.length) - 1) < 1e-9, 'unit energy');

    const re = Float64Array.from(h), im = new Float64Array(h.length);
    T.fft(re, im);
    let worst = 0;
    for (let k = 0; k < h.length; k++) worst = Math.max(worst, Math.abs(Math.hypot(re[k], im[k]) - 1));
    assert.ok(worst < 1e-9, `magnitude strays ${worst} from flat`);

    assert.deepEqual(Array.from(T.designDecorrelator(1)), Array.from(h), 'the same seed, the same filter');
    assert.ok(Math.abs(h[0]) < 0.5, 'not a delta in disguise');
});

test('two seeds\' decorrelators give unrelated outputs', () => {
    const random = prng(3);
    const noise = Float64Array.from({ length: ms(200) }, () => random() - 0.5);
    const a = T.fftConvolve(noise, T.designDecorrelator(1));
    const b = T.fftConvolve(noise, T.designDecorrelator(2));
    const r = corr(a, b, 1024, noise.length);
    assert.ok(Math.abs(r) < 0.1, `seeds 1 and 2 correlate at ${r.toFixed(3)}`);
});

test('fftConvolve is causal convolution, trimmed to the signal', () => {
    const random = prng(5);
    const signal = Float64Array.from({ length: 300 }, (_, i) => (i < 100 ? 0 : random() - 0.5));
    const kernel = Float64Array.from({ length: 37 }, () => random() - 0.5);
    const got = T.fftConvolve(signal, kernel);
    assert.equal(got.length, signal.length);
    for (let n = 0; n < signal.length; n++) {
        let want = 0;
        for (let k = 0; k < kernel.length && k <= n; k++) want += kernel[k] * signal[n - k];
        assert.ok(Math.abs(got[n] - want) < 1e-12, `sample ${n}: ${got[n]} against ${want}`);
    }
});

test('the dependence check tells an independent capsule from a leaked one', () => {
    // An independent cardioid regressed on two others leaves about −3 dB; the
    // library's FLU, a fixed mix of FRD and BLD, leaves next to nothing
    const independent = T.residualDb(base.FLU, base.FRD, base.BLD, RATE, ONSET);
    assert.ok(independent > -6 && independent < -1, `independent capsule leaves ${independent.toFixed(2)} dB`);

    const leak = base.FRD.map((v, i) => 0.12 * v + 0.09 * base.BLD[i]);
    const leaked = T.residualDb(leak, base.FRD, base.BLD, RATE, ONSET);
    assert.ok(leaked < -40, `a pure leak leaves ${leaked.toFixed(2)} dB`);
});

// ── the command line ──────────────────────────────────────────────────────

test('the rebuild is the default, and the four-capsule decode cannot overwrite it', () => {
    // Beside the sources is where the app reads from
    assert.equal(T.parseArgs([]).pair, true);
    assert.equal(T.parseArgs(['--pair']).pair, true, 'old commands still parse');
    assert.throws(() => T.parseArgs(['--four-capsule']), /overwrite the files the app plays/);
    assert.equal(T.parseArgs(['--four-capsule', '--dry-run']).pair, false);
    assert.equal(T.parseArgs(['--four-capsule', '--out', 'elsewhere']).pair, false);
});
