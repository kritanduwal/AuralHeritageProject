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

const PUBLISHED_BASE = 'IR/Monastery Immaculate Conception, IN/Normalized/MIC_IN_R3-';
const ORIGINALS_BASE = 'IR/Monastery Immaculate Conception, IN/Not Normalized/MIC_IN_R3-';

test('the two bases point at the two sets', () => {
    // Stereo stays on the published library everywhere, which is what keeps it
    // the reference the render is trimmed against
    const church = ROOMS.MonasteryImmaculateConception;
    assert.ok(church.unnormalized,
        'this church is one of those that have originals; the test means nothing if it stops');
    assert.equal(impulseResponseBase(church, 'R3'), PUBLISHED_BASE);
    assert.equal(app.g.decodedResponseBase(church, 'R3'), ORIGINALS_BASE);
});

test('a church without originals offers nothing to decode', () => {
    // A decode of peak-normalized capsules places sound in directions nobody
    // measured, while sounding entirely convincing
    for (const [key, cfg] of Object.entries(ROOMS)) {
        if (cfg.unnormalized) continue;
        assert.equal(app.g.decodedResponseBase(cfg, 'R1'), '', key);
        assert.match(impulseResponseBase(cfg, 'R1'), /\/Normalized\//,
            `${key}: stereo still plays the published library`);
    }
});

test('the trim comes from the set the stage actually plays, at that position', () => {
    const church = ROOMS.MonasteryImmaculateConception;
    assert.deepEqual(
        JSON.parse(JSON.stringify(app.g.stageTrimsOf(church, 'R3'))),
        { ambisonic: church.unnormalized.trim.ambisonic.R3 });
});

test('two positions of one church get two levels', () => {
    // Stereo was normalized per position and the recovered set was not, so the
    // gap between them grows with distance from the source
    const church = ROOMS.StAugustineIsleta;
    const front = app.g.stageTrimsOf(church, 'R1').ambisonic;
    const back = app.g.stageTrimsOf(church, 'R4').ambisonic;

    assert.equal(front, church.unnormalized.trim.ambisonic.R1);
    assert.equal(back, church.unnormalized.trim.ambisonic.R4);
    assert.ok(Math.abs(front - back) > 6,
        'a church-wide figure would be several dB out at both ends');
});

test('a church with no recovered set has no trim to state', () => {
    // It has no stage but stereo, and stereo is the reference — never trimmed.
    assert.deepEqual(Object.keys(app.g.stageTrimsOf(ROOMS.CaneRidgeMeetingHouse, 'R1')), []);
});

test('a position missing from the table is left to the engine constant', () => {
    // Rather than borrowing a neighbour's level, which no measurement backs
    const church = ROOMS.MonasteryImmaculateConception;
    assert.deepEqual(Object.keys(app.g.stageTrimsOf(church, 'R99')), []);
});

test('the originals calibrate the one stage that reads them, and no others', () => {
    // A figure nothing reads goes stale and then gets believed
    for (const [key, cfg] of rooms) {
        if (!cfg.unnormalized) continue;
        assert.deepEqual(Object.keys(cfg.unnormalized.trim), ['ambisonic'],
            `${key}.unnormalized.trim should carry the headphone render only`);
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

test('the soundfield orientation comes from the set that is playing', () => {
    // The church's value was found against an invalid decode, so a correct set
    // must be able to disagree with it
    const church = ROOMS.MonasteryImmaculateConception;
    assert.equal(app.g.soundfieldYawOf(church), church.unnormalized.soundfieldYaw);
    assert.notEqual(church.unnormalized.soundfieldYaw, church.soundfieldYaw,
        'the two disagree here, which is the case worth testing');
});

test('an explicit zero orientation is honoured rather than falling back', () => {
    // 0 is the value that matters here and the one a loose `||` would drop, so
    // a set that states it must not inherit the church's half turn instead.
    const church = ROOMS.MonasteryImmaculateConception;
    assert.equal(church.unnormalized.soundfieldYaw, 0, 'the case this guards');
    assert.notEqual(church.soundfieldYaw, 0, 'and the value it must not inherit');
    assert.equal(app.g.soundfieldYawOf(church), 0);
});

test('a set that states no orientation inherits the church', () => {
    const church = ROOMS.MonasteryImmaculateConception;
    const borrowed = { ...church, unnormalized: { ir: church.unnormalized.ir, trim: church.unnormalized.trim } };
    assert.equal(app.g.soundfieldYawOf(borrowed), church.soundfieldYaw);
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
// Reference text in the Church Info modal; nothing in playback reads them.

test('every receiver distance is stated in a form the modal can show', () => {
    // A stray unit or missing number would appear verbatim in the table
    for (const [key, data] of Object.entries(app.data.churchData)) {
        for (const [r, text] of Object.entries(data.receivers)) {
            assert.match(text, /^\d+(\.\d+)? ft$/,
                `${key}.${r}: "${text}" is not a distance in feet`);
        }
    }
});
