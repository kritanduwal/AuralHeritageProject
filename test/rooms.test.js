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
        'IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R7-'
    );
    // The trailing "-" matters: AudioEngine appends "1.wav" / "2.wav" to it
    assert.ok(impulseResponseBase(ROOMS.FirstPresbyterianChurchKY, 'R3').endsWith('-'));
});

test('impulseResponseBase honours an irName override', () => {
    // Basilica R8 was filed under a "balcony" name instead of prefix_receiver
    assert.equal(
        impulseResponseBase(ROOMS.BasilicaStFrancis, 'R8'),
        'IR/Basilica St. Francis, IN/St Francis_IN_balcony R8-'
    );
    // …and its neighbours still follow the standard pattern
    assert.equal(
        impulseResponseBase(ROOMS.BasilicaStFrancis, 'R7'),
        'IR/Basilica St. Francis, IN/St Francis_IN_R7-'
    );
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
