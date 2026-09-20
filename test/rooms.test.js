'use strict';
/** Rooms.js — the per-church configuration table and its path builders */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

const app = createApp();
const { ROOMS } = app.data;
const { receiverIdOf, impulseResponseBase, panoramaPath } = app.g;

const rooms = Object.entries(ROOMS);

test('receiverIdOf extracts the receiver from a button id', () => {
    assert.equal(receiverIdOf('rpR1_BridgeCommunityChurch'), 'R1');
    assert.equal(receiverIdOf('rpR12_SomeChurch'), 'R12');
});

test('receiverIdOf rejects anything that is not a receiver button', () => {
    for (const id of ['spS_BridgeCommunityChurch', 'play', '', null, undefined, 'rp_R1_X', 'xrpR1_X']) {
        assert.equal(receiverIdOf(id), '', `expected "" for ${JSON.stringify(id)}`);
    }
});

test('impulseResponseBase joins directory, prefix and receiver, ending at the channel', () => {
    assert.equal(
        impulseResponseBase(ROOMS.CaneRidgeMeetingHouse, 'R7'),
        'IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R7-'
    );
    // The trailing "-" matters: AudioEngine appends "1.wav" / "2.wav" to it
    assert.ok(impulseResponseBase(ROOMS.FirstPresbyterianChurchKY, 'R3').endsWith('-'));
});

test('impulseResponseBase honours an irName override', () => {
    // Basilica R8 was filed under a "balcony" name instead of prefix_receiver
    assert.equal(
        impulseResponseBase(ROOMS.BasilicaStFrancis, 'R8'),
        'IR/Basilica St. Francis, IN/Normalized/St Francis_IN_balcony R8-'
    );
    // …and its neighbours still follow the standard pattern
    assert.equal(
        impulseResponseBase(ROOMS.BasilicaStFrancis, 'R7'),
        'IR/Basilica St. Francis, IN/Normalized/St Francis_IN_R7-'
    );
});

// ── the un-normalized originals ───────────────────────────────────────────

/** The same table, read by a visit that asked for the original captures */
const raw = createApp({ path: '/unnormalized' });

const PUBLISHED_BASE = 'IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R3-';
const ORIGINALS_BASE = 'IR/Monastery Immaculate Conception, IN/Not Normalized/MIC_IN_R3-';

test('without the flag both bases are the published library', () => {
    assert.ok(ROOMS.MonasteryImmaculateConception.unnormalized,
        'this church is the one that has originals; the test means nothing if it stops');
    assert.equal(impulseResponseBase(ROOMS.MonasteryImmaculateConception, 'R3'), PUBLISHED_BASE);
    assert.equal(app.g.decodedResponseBase(ROOMS.MonasteryImmaculateConception, 'R3'), PUBLISHED_BASE);
});

test('the flag moves the decoded files and leaves the stereo pair alone', () => {
    // Stereo and the virtual-loudspeaker render convolve channels 1 and 2
    // through normalizing convolvers, so the originals would change how they
    // sound without improving them — and would move the very reference the
    // other stages are matched against.
    const church = raw.data.ROOMS.MonasteryImmaculateConception;
    assert.equal(raw.g.impulseResponseBase(church, 'R3'), PUBLISHED_BASE,
        'the stereo pair must not move');
    assert.equal(raw.g.decodedResponseBase(church, 'R3'), ORIGINALS_BASE,
        'the BRIR and B-format must');
});

test('a church without originals keeps both bases identical under the flag', () => {
    // The flag means "the originals where they exist", so that it can be used
    // across the library while they are recovered one church at a time.
    for (const [key, cfg] of Object.entries(raw.data.ROOMS)) {
        if (cfg.unnormalized) continue;
        const published = impulseResponseBase(ROOMS[key], 'R1');
        assert.equal(raw.g.impulseResponseBase(cfg, 'R1'), published, key);
        assert.equal(raw.g.decodedResponseBase(cfg, 'R1'), published,
            `${key} has no originals, so nothing should have moved`);
    }
});

test('each stage is trimmed from the set it actually plays', () => {
    const church = ROOMS.MonasteryImmaculateConception;
    assert.deepEqual(app.g.stageTrimsOf(church), church.trim,
        'one set playing, one trim');

    const rawChurch = raw.data.ROOMS.MonasteryImmaculateConception;
    const trims = raw.g.stageTrimsOf(rawChurch);
    assert.equal(trims.binaural, rawChurch.trim.binaural,
        'binaural plays the published library, so it keeps its figure');
    assert.equal(trims.brir, rawChurch.unnormalized.trim.brir);
    assert.equal(trims.ambisonic, rawChurch.unnormalized.trim.ambisonic);
});

test('the originals calibrate the two stages that read them, and no others', () => {
    // A figure nothing reads is one that goes stale and then gets believed.
    for (const [key, cfg] of rooms) {
        if (!cfg.unnormalized) continue;
        assert.deepEqual(Object.keys(cfg.unnormalized.trim).sort(), ['ambisonic', 'brir'],
            `${key}.unnormalized.trim should carry the decoded stages only`);
    }
});

test('an originals entry describes the files and never the room', () => {
    // Receivers and panoramas describe the room, which the recovery did not
    // change. Duplicating them would let the two sets disagree about the same
    // measurement. Only the three fields that are properties of the files
    // themselves may be restated.
    const allowed = ['ir', 'soundfieldYaw', 'trim'];
    for (const [key, cfg] of rooms) {
        if (!cfg.unnormalized) continue;
        for (const field of Object.keys(cfg.unnormalized)) {
            assert.ok(allowed.includes(field),
                `${key}.unnormalized.${field} is a property of the room, not of its files`);
        }
        assert.ok(cfg.unnormalized.ir.dir, `${key}: missing unnormalized ir.dir`);
        assert.ok(cfg.unnormalized.ir.prefix, `${key}: missing unnormalized ir.prefix`);
        assert.ok(cfg.unnormalized.trim, `${key}: missing unnormalized trim`);
        assert.notEqual(cfg.unnormalized.ir.dir, cfg.ir.dir,
            `${key}: the originals must not point back at the published library`);
    }
});

test('the soundfield orientation follows the set that is playing', () => {
    // The published value was found by ear against a decode whose directions
    // are invalid, so a correctly decoding set must be able to disagree with it.
    const key = 'MonasteryImmaculateConception';
    assert.equal(app.g.soundfieldYawOf(ROOMS[key]), ROOMS[key].soundfieldYaw);
    assert.equal(raw.g.soundfieldYawOf(raw.data.ROOMS[key]),
        raw.data.ROOMS[key].unnormalized.soundfieldYaw);
});

test('an explicit zero orientation is honoured rather than falling back', () => {
    // 0 is the value that matters here and the one a loose `||` would drop, so
    // a set that states it must not inherit the church's half turn instead.
    const church = raw.data.ROOMS.MonasteryImmaculateConception;
    assert.equal(church.unnormalized.soundfieldYaw, 0, 'the case this guards');
    assert.notEqual(church.soundfieldYaw, 0, 'and the value it must not inherit');
    assert.equal(raw.g.soundfieldYawOf(church), 0);
});

test('a set that states no orientation inherits the church', () => {
    const church = raw.data.ROOMS.MonasteryImmaculateConception;
    const borrowed = { ...church, unnormalized: { ir: church.unnormalized.ir, trim: church.unnormalized.trim } };
    assert.equal(raw.g.soundfieldYawOf(borrowed), church.soundfieldYaw);
});

test('panoramaPath joins directory, prefix, receiver and extension', () => {
    assert.equal(
        panoramaPath(ROOMS.MonasteryImmaculateConception, 'R4'),
        'Images/Monastery Immaculate Conception, IN/MIC_IN_R4.JPG'
    );
    assert.equal(
        panoramaPath(ROOMS.BridgeCommunityChurch, 'R2'),
        'Images/Bridge Community Church/Bridge Community Church_R2.jpg'
    );
});

test('every room declares the fields the builders read', () => {
    for (const [key, cfg] of rooms) {
        assert.ok(cfg.ir?.dir, `${key}: missing ir.dir`);
        assert.ok(cfg.ir?.prefix, `${key}: missing ir.prefix`);
        assert.ok(cfg.panorama?.dir, `${key}: missing panorama.dir`);
        assert.ok(cfg.panorama?.prefix, `${key}: missing panorama.prefix`);
        assert.match(cfg.panorama?.ext ?? '', /^\.[A-Za-z]+$/, `${key}: panorama.ext must start with a dot`);
        assert.ok(Object.keys(cfg.receivers).length > 0, `${key}: no receivers`);
    }
});

test('every receiver states pitch and yaw explicitly, including the zeroes', () => {
    // A straight-ahead view should read as a decision, not a missing value
    for (const [key, cfg] of rooms) {
        for (const [rid, r] of Object.entries(cfg.receivers)) {
            assert.equal(typeof r.pitch, 'number', `${key} ${rid}: pitch must be stated`);
            assert.equal(typeof r.yaw, 'number', `${key} ${rid}: yaw must be stated`);
        }
    }
});

test('camera angles are in a sane range', () => {
    for (const [key, cfg] of rooms) {
        for (const [rid, r] of Object.entries(cfg.receivers)) {
            assert.ok(r.pitch >= -90 && r.pitch <= 90, `${key} ${rid}: pitch ${r.pitch} out of range`);
            assert.ok(r.yaw >= -360 && r.yaw <= 360, `${key} ${rid}: yaw ${r.yaw} out of range`);
        }
    }
});

test('receivers are numbered from R1 with no gaps', () => {
    for (const [key, cfg] of rooms) {
        const ids = Object.keys(cfg.receivers);
        const expected = ids.map((_, i) => `R${i + 1}`);
        assert.deepEqual(ids, expected, `${key}: receivers should run R1..R${ids.length} in order`);
    }
});

test('gainDb is a positive reduction where present, and absent otherwise', () => {
    for (const [key, cfg] of rooms) {
        for (const [rid, r] of Object.entries(cfg.receivers)) {
            if (!('gainDb' in r)) continue;
            assert.equal(typeof r.gainDb, 'number', `${key} ${rid}: gainDb must be a number`);
            assert.ok(r.gainDb > 0, `${key} ${rid}: gainDb is a reduction, so it must be > 0`);
            assert.ok(r.gainDb <= 24, `${key} ${rid}: gainDb ${r.gainDb} is implausibly large`);
        }
    }
});

test('trimmed rooms keep reverb quieter as positions get further from the source', () => {
    // Not a hard rule across every church, but within these it is the intent
    for (const key of ['StAugustineIsleta', 'OurLadyOfGuadalupe']) {
        const trims = Object.entries(ROOMS[key].receivers)
            .filter(([rid]) => ['R1', 'R2', 'R3', 'R4'].includes(rid))
            .map(([, r]) => r.gainDb || 0);
        const sorted = [...trims].sort((a, b) => a - b);
        assert.deepEqual(trims, sorted, `${key}: R1..R4 trims should not decrease with distance`);
    }
});

test('irName is only used where the recording really breaks the pattern', () => {
    const overrides = rooms.flatMap(([key, cfg]) =>
        Object.entries(cfg.receivers).filter(([, r]) => r.irName).map(([rid]) => `${key}.${rid}`));
    assert.deepEqual(overrides, ['BasilicaStFrancis.R8']);
});

test('the table covers exactly the twelve churches, with no duplicate paths', () => {
    assert.equal(rooms.length, 12);

    const irDirs = rooms.map(([, c]) => c.ir.dir);
    assert.equal(new Set(irDirs).size, 12, 'two rooms share an IR directory');

    const panoDirs = rooms.map(([, c]) => c.panorama.dir);
    assert.equal(new Set(panoDirs).size, 12, 'two rooms share a panorama directory');
});

test('every room has matching reference data in ChurchData.js', () => {
    for (const [key] of rooms) {
        const data = app.data.churchData[key];
        assert.ok(data, `${key}: no churchData entry`);
        assert.ok(data.name && data.address && data.measured, `${key}: incomplete churchData`);
        assert.ok(Array.isArray(data.history) && data.history.length, `${key}: no history`);

        // The modal lists a distance per receiver; it should cover the real ones
        assert.deepEqual(
            Object.keys(data.receivers),
            Object.keys(ROOMS[key].receivers),
            `${key}: churchData receiver distances do not match the receivers in ROOMS`
        );
    }
});

// ── receiver distances ────────────────────────────────────────────────────
// The binaural render stands its virtual loudspeakers at these, so they are
// load-bearing for playback and no longer only modal text.

test('every receiver in the table yields a usable distance', () => {
    const { receiverDistanceFeet } = app.g;
    for (const [key] of rooms) {
        for (const r of Object.keys(ROOMS[key].receivers)) {
            const feet = receiverDistanceFeet(key, r);
            assert.ok(feet > 0, `${key}.${r}: distance did not parse — the binaural render would fall back`);
            assert.ok(feet < 500, `${key}.${r}: ${feet} ft is not a distance inside a church`);
        }
    }
});

test('receiverDistanceFeet reads the figure the modal shows', () => {
    const { receiverDistanceFeet } = app.g;
    assert.equal(receiverDistanceFeet('StAugustineIsleta', 'R5'), 90.17);
    assert.equal(receiverDistanceFeet('CaneRidgeMeetingHouse', 'R1'), 8.7);
    assert.equal(
        receiverDistanceFeet('StAugustineIsleta', 'R5') + ' ft',
        app.data.churchData.StAugustineIsleta.receivers.R5,
        'the parsed value must be the same number the visitor is shown'
    );
});

test('receiverDistanceFeet reports nothing rather than guessing', () => {
    const { receiverDistanceFeet } = app.g;
    for (const [room, rcv] of [['StAugustineIsleta', 'R99'], ['NoSuchChurch', 'R1'], ['', '']]) {
        assert.equal(receiverDistanceFeet(room, rcv), 0, `expected 0 for ${room}.${rcv}`);
    }
});
