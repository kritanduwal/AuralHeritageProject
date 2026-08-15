'use strict';
/** SettingsMenu.js — the church dropdown and the source file picker */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

const overlayIds = (app) => Object.keys(app.data.ROOMS).map(k => k + 'ui');
const visibleOverlays = (app) => overlayIds(app).filter(id => app.el(id).style.display === 'flex');

// ── switching church ──────────────────────────────────────────────────────

test('switchRoom shows exactly one floorplan overlay', async () => {
    const app = createApp();
    app.g.switchRoom('CaneRidgeMeetingHouse');
    await app.settle();

    assert.deepEqual(visibleOverlays(app), ['CaneRidgeMeetingHouseui']);
});

test('switching again hides the overlay that was showing', async () => {
    const app = createApp();
    app.g.switchRoom('CaneRidgeMeetingHouse');
    await app.settle();
    app.g.switchRoom('StAugustineIsleta');
    await app.settle();

    assert.deepEqual(visibleOverlays(app), ['StAugustineIsletaui']);
});

test('switchRoom selects the source and first receiver of the new church', async () => {
    const app = createApp();
    app.g.switchRoom('MonasteryImmaculateConception');
    await app.settle();

    assert.equal(app.state.room, 'MonasteryImmaculateConception');
    assert.equal(app.state.srcpos, 'spS_MonasteryImmaculateConception');
    assert.equal(app.state.rcvpos, 'rpR1_MonasteryImmaculateConception');
    assert.equal(app.state.currentIr.base, 'IR/Monastery Immaculate Conception, IN/MIC_IN_R1-');
});

test('switchRoom reveals the church info button', async () => {
    const app = createApp();
    app.g.switchRoom('OurLadyOfGuadalupe');
    await app.settle();
    assert.equal(app.el('church-info-btn').style.display, 'flex');
});

test('the placeholder option clears the selection entirely', async () => {
    const app = createApp();
    app.g.switchRoom('CaneRidgeMeetingHouse');
    await app.settle();

    app.g.switchRoom('Select a Church');
    await app.settle();

    assert.deepEqual(visibleOverlays(app), [], 'no church should be showing');
    assert.equal(app.el('church-info-btn').style.display, 'none');
    assert.equal(app.state.srcpos, '');
    assert.equal(app.state.rcvpos, '');
    assert.equal(app.viewer.panorama, app.data.DEFAULT_PANORAMA);
});

test('switching church returns the previous markers to their unselected colours', async () => {
    const app = createApp();
    app.g.switchRoom('CaneRidgeMeetingHouse');
    await app.settle();
    assert.equal(app.el('rpR1_CaneRidgeMeetingHouse').style.backgroundColor, 'var(--maincolor2)');

    app.g.switchRoom('StAugustineIsleta');
    await app.settle();

    assert.equal(app.el('rpR1_CaneRidgeMeetingHouse').style.backgroundColor, 'var(--buttoncolor1)');
    assert.equal(app.el('spS_CaneRidgeMeetingHouse').style.backgroundColor, 'var(--buttoncolor2)');
});

test('every church in the table can be selected without error', async () => {
    const app = createApp();
    for (const key of Object.keys(app.data.ROOMS)) {
        app.g.switchRoom(key);
        await app.settle();
        assert.deepEqual(visibleOverlays(app), [key + 'ui'], `${key} did not show cleanly`);
        assert.equal(app.el('play').disabled, false, `${key} R1 should be playable`);
    }
});

// ── source file names ─────────────────────────────────────────────────────

test('formatSourceName turns a filename into a label', () => {
    const { formatSourceName } = createApp().g;
    assert.equal(formatSourceName('Chorus_New.wav'), 'Chorus New');
    assert.equal(formatSourceName('Acoustic guitar.wav'), 'Acoustic Guitar');
    assert.equal(formatSourceName('my recording.mp3'), 'My Recording');
    assert.equal(formatSourceName('no-extension'), 'No-Extension');
});

test('the bundled source list matches the files that actually ship', () => {
    const fs = require('fs'), path = require('path');
    const { ROOT } = require('./helpers/harness.js');
    const app = createApp();

    const onDisk = fs.readdirSync(path.join(ROOT, 'Source Files')).filter(f => /\.(wav|mp3)$/i.test(f)).sort();
    // Array.from lifts the sandbox's array into this realm so deepEqual can compare it
    const listed = Array.from(app.data.BUNDLED_SOURCE_FILES, f => f.filename).sort();
    assert.deepEqual(listed, onDisk, 'the fallback list has drifted from Source Files/');
});

// ── the picker ────────────────────────────────────────────────────────────

test('the picker lists the server’s files when the listing endpoint answers', async () => {
    const app = createApp();
    app.net.respond = (url) => url === '/api/source-files'
        ? { ok: true, status: 200, json: ['Trumpet.wav', 'Chorus_New.wav'] }
        : { ok: true, status: 200 };

    await app.g.selectSource();

    const labels = app.el('source-file-list').children.map(c => c.textContent);
    assert.deepEqual(labels, ['Trumpet', 'Chorus']);
    assert.ok(app.el('source-modal').classList.contains('open'));
});

test('the picker falls back to the bundled list on a static host', async () => {
    const app = createApp();     // the harness answers /api/source-files with 404
    await app.g.selectSource();

    const labels = app.el('source-file-list').children.map(c => c.textContent);
    assert.deepEqual(labels, Array.from(app.data.BUNDLED_SOURCE_FILES, f => f.label));
});

test('the picker survives the listing endpoint returning nonsense', async () => {
    const app = createApp();
    app.net.respond = () => { throw new Error('connection reset'); };
    await app.g.selectSource();
    assert.equal(app.el('source-file-list').children.length, app.data.BUNDLED_SOURCE_FILES.length);
});

test('choosing a file loads it and relabels the control', async () => {
    const app = createApp();
    await app.g.loadSourceFromServer('Trumpet.wav', 'Trumpet');

    assert.ok(app.state.sourceBuffer, 'nothing was decoded');
    assert.equal(app.el('srcselectlabel').textContent, 'Trumpet');
    assert.equal(app.el('source-modal').classList.contains('open'), false, 'the modal should close');
});

test('a filename with spaces is requested in encoded form', async () => {
    const app = createApp();
    await app.g.loadSourceFromServer('Acoustic guitar.wav', 'Acoustic Guitar');
    assert.ok(app.net.log.some(r => r.url === '/Source Files/Acoustic%20guitar.wav'),
        'the request should be percent-encoded: ' + JSON.stringify(app.net.log));
});

test('a file that fails to load does not relabel the control', async () => {
    const app = createApp();
    app.el('srcselectlabel').textContent = 'Clarinet';
    app.net.respond = () => ({ ok: false, status: 404 });

    await app.g.loadSourceFromServer('Gone.wav', 'Gone');

    assert.equal(app.el('srcselectlabel').textContent, 'Clarinet', 'the label must not claim a source that failed');
    assert.match(app.el('error-message').textContent, /source file could not be retrieved \(404\)/);
});

test('choosing a new source stops playback first', async () => {
    const app = createApp();
    app.loadFakeSource();
    app.g.setImpulseResponse('IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R1-', 0);
    await app.g.playpause();
    assert.equal(app.state.isPlaying, true);

    await app.g.loadSourceFromServer('Trumpet.wav', 'Trumpet');
    assert.equal(app.state.isPlaying, false, 'playback should stop before the source is swapped');
});

test('the native picker decodes a local file and labels it', async () => {
    const app = createApp();
    app.g.openNativeFilePicker();

    const input = app.g.document.createElement('input');   // shape check
    assert.ok(input);

    // Re-open and drive the input the app itself created
    const created = [];
    const realCreate = app.g.document.createElement;
    app.g.document.createElement = (tag) => { const e = realCreate(tag); created.push(e); return e; };
    app.g.openNativeFilePicker();
    const picker = created[0];

    assert.equal(picker.type, 'file');
    assert.match(picker.accept, /wav/);
    assert.equal(picker.clicked, 1, 'the dialog should be opened');

    await picker.onchange({ target: { files: [{ name: 'Field recording.wav', arrayBuffer: async () => new ArrayBuffer(32) }] } });

    assert.ok(app.state.sourceBuffer);
    assert.equal(app.el('srcselectlabel').textContent, 'Field Recording');
});

test('cancelling the native picker changes nothing', async () => {
    const app = createApp();
    app.el('srcselectlabel').textContent = 'Clarinet';
    const created = [];
    const realCreate = app.g.document.createElement;
    app.g.document.createElement = (tag) => { const e = realCreate(tag); created.push(e); return e; };

    app.g.openNativeFilePicker();
    await created[0].onchange({ target: { files: [] } });

    assert.equal(app.el('srcselectlabel').textContent, 'Clarinet');
});
