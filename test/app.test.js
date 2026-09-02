'use strict';
/** App.js — selection state, compile(), the panorama viewer and the error banner */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

/** Puts an app into a chosen room/receiver without going through the dropdown */
function select(app, room, receiver = 'R1') {
    app.state.room = room;
    app.state.srcpos = 'spS_' + room;
    app.state.rcvpos = `rp${receiver}_${room}`;
    return app;
}

// ── compile ───────────────────────────────────────────────────────────────

test('compile points the audio engine at the selected position', async () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R7');
    await app.g.compile();

    assert.equal(app.state.currentIr.base, 'IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R7-');
    assert.equal(app.state.currentIr.gainDb, 1.5, 'R7 carries a 1.5 dB trim');
});

test('compile defaults the trim to zero where a position has none', async () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R1');
    await app.g.compile();
    assert.equal(app.state.currentIr.gainDb, 0);
});

test('compile hands the engine the measured distance to the source', async () => {
    // It places the binaural render's virtual loudspeakers, so a selection that
    // forgot to pass it would stand every church's speakers in the same spot.
    const app = select(createApp(), 'StAugustineIsleta', 'R5');
    await app.g.compile();
    assert.equal(app.state.currentIr.distanceFeet, 90.17);

    const near = select(createApp(), 'CaneRidgeMeetingHouse', 'R1');
    await near.g.compile();
    assert.equal(near.state.currentIr.distanceFeet, 8.7);
});

test('compile shows the panorama for the selected position', async () => {
    const app = select(createApp(), 'BasilicaStFrancis', 'R3');
    await app.g.compile();
    assert.equal(app.viewer.panorama, 'Images/Basilica St. Francis, IN/St Francis_IN_R3.JPG');
});

test('compile aims the camera at that position’s angles', async () => {
    const app = select(createApp(), 'BasilicaStFrancis', 'R8');
    await app.g.compile();

    app.viewer.emit('load');
    const { pitch, yaw } = app.data.ROOMS.BasilicaStFrancis.receivers.R8;
    assert.deepEqual(app.viewer.aimed.slice(0, 3), [pitch, yaw, app.data.PANORAMA_HFOV]);
});

test('compile enables playback and marks the selection green when a recording exists', async () => {
    const app = select(createApp(), 'ChristChurchCathedral', 'R4');
    await app.g.compile();

    assert.equal(app.el('play').disabled, false);
    assert.equal(app.el(':root').style.getPropertyValue('--maincolor2'), '#00f47f');
    assert.equal(app.el('rpR4_ChristChurchCathedral').style.backgroundColor, 'var(--maincolor2)');
    assert.equal(app.el('spS_ChristChurchCathedral').style.backgroundColor, 'var(--maincolor2)');
});

test('compile disables playback and marks the selection red when a recording is missing', async () => {
    const app = select(createApp(), 'ChristChurchCathedral', 'R4');
    app.net.respond = () => ({ ok: false, status: 404 });
    await app.g.compile();

    assert.equal(app.el('play').disabled, true);
    assert.equal(app.el(':root').style.getPropertyValue('--maincolor2'), 'crimson');
    assert.equal(app.el('error').style.display, 'flex', 'the banner should be shown');
    assert.equal(app.viewer.panorama, app.data.DEFAULT_PANORAMA, 'the view should fall back');
});

test('compile hides a stale error once a valid selection is made', async () => {
    const app = select(createApp(), 'ChristChurchCathedral', 'R4');
    app.g.showResourceError('error: something earlier', 'some/file.wav');
    await app.g.compile();

    assert.equal(app.el('error').style.display, 'none');
    assert.equal(app.el('error-message').textContent, app.data.DEFAULT_ERROR_MESSAGE);
});

test('compile ignores selections that are not in the table', async () => {
    const app = createApp();
    app.state.room = 'Select a Church';
    app.state.rcvpos = '';
    await app.g.compile();
    assert.equal(app.state.currentIr.base, '', 'nothing should have been selected');
});

test('compile restarts playback so a receiver switch takes effect immediately', async () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R1');
    app.loadFakeSource();
    await app.g.compile();
    await app.g.playpause();
    const firstGraph = app.state.activeGraph;

    app.state.rcvpos = 'rpR5_CaneRidgeMeetingHouse';
    await app.g.compile();

    assert.equal(app.state.isPlaying, true, 'playback should still be running');
    assert.notEqual(app.state.activeGraph, firstGraph, 'it should be running through the new position');
    assert.equal(app.state.currentIr.gainDb, 3, 'R5 carries a 3 dB trim');
});

test('compile leaves playback stopped if it was already stopped', async () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R1');
    app.loadFakeSource();
    await app.g.compile();
    assert.equal(app.state.isPlaying, false);
});

// ── the race guard ────────────────────────────────────────────────────────

test('a slow response cannot overwrite a newer selection', async () => {
    const app = select(createApp(), 'ChristChurchCathedral', 'R1');

    // Hold every probe open so their order can be controlled
    const gates = [];
    app.net.respond = () => new Promise(resolve => gates.push(() => resolve({ ok: true, status: 200 })));

    const first = app.g.compile();                                  // R1
    app.state.rcvpos = 'rpR6_ChristChurchCathedral';
    const second = app.g.compile();                                 // R6

    gates[1]();                                                     // the newer one lands first
    await second;
    const viewersAfterNewer = app.viewers.length;
    assert.equal(app.viewer.panorama, 'Images/Christ Church Cathedral/Christ Church Cathedral_R6.jpg');

    gates[0]();                                                     // now the stale one
    await first;

    assert.equal(app.viewers.length, viewersAfterNewer, 'the stale response built another view');
    assert.equal(app.viewer.panorama, 'Images/Christ Church Cathedral/Christ Church Cathedral_R6.jpg',
        'the stale response overwrote the newer selection');
});

test('each compile takes a new ticket', async () => {
    const app = select(createApp(), 'ChristChurchCathedral', 'R1');
    const before = app.state.compileSequence;
    await app.g.compile();
    await app.g.compile();
    assert.equal(app.state.compileSequence, before + 2);
});

// ── the panorama viewer ───────────────────────────────────────────────────

test('setImage destroys the previous viewer before building the next', () => {
    const app = createApp();
    const first = app.g.setImage('Images/default.jpg');
    const second = app.g.setImage('Images/default.jpg');

    assert.equal(first.destroyed, true, 'stacked viewers leak WebGL contexts');
    assert.equal(second.destroyed, false);
    assert.equal(app.state.viewer, second);
});

test('setImage returns the viewer it created', () => {
    const app = createApp();
    assert.equal(app.g.setImage('Images/default.jpg'), app.state.viewer);
});

test('a panorama that fails to load is named in the banner and falls back', () => {
    const app = createApp();
    const view = app.g.setImage('Images/Somewhere/broken.jpg');
    view.emit('error', 'could not load image');

    assert.equal(app.el('error').style.display, 'flex');
    assert.match(app.el('error-message').textContent, /could not load image/);
    assert.equal(app.el('error-resource').textContent, 'Images/Somewhere/broken.jpg');

    app.timers.flush();
    assert.equal(app.viewer.panorama, app.data.DEFAULT_PANORAMA);
});

test('a failing default backdrop does not loop forever', () => {
    const app = createApp();
    const view = app.g.setImage(app.data.DEFAULT_PANORAMA);
    view.emit('error', 'nope');
    assert.equal(app.timers.pending, 0, 'the backdrop must not try to replace itself');
});

test('aimViewer does not swing a viewer that has already been replaced', () => {
    const app = createApp();
    const stale = app.g.setImage('Images/default.jpg');
    app.g.aimViewer(stale, -15, 90);
    app.g.setImage('Images/default.jpg');      // the user moved on

    stale.emit('load');
    app.timers.flush();
    assert.equal(stale.aimed, null, 'a superseded selection must not aim the current view');
});

test('aimViewer aims once, whether the load event or the fallback gets there first', () => {
    const app = createApp();
    const view = app.g.setImage('Images/default.jpg');
    app.g.aimViewer(view, -2, 4);

    view.emit('load');
    assert.deepEqual(view.aimed.slice(0, 3), [-2, 4, app.data.PANORAMA_HFOV]);

    view.aimed = null;
    app.timers.flush();          // the 100 ms fallback
    view.emit('load');           // and a duplicate event
    assert.equal(view.aimed, null, 'the camera should only be aimed once');
});

test('destroyView returns to the neutral backdrop', () => {
    const app = createApp();
    app.g.setImage('Images/Somewhere/church.jpg');
    app.g.destroyView();
    assert.equal(app.viewer.panorama, app.data.DEFAULT_PANORAMA);
});

// ── the error banner ──────────────────────────────────────────────────────

test('setResourceError writes the banner without revealing it', () => {
    const app = createApp();
    app.el('error').style.display = 'none';
    app.g.setResourceError('error: nope', 'IR/x/y.wav');

    assert.equal(app.el('error-message').textContent, 'error: nope');
    assert.equal(app.el('error-resource').textContent, 'IR/x/y.wav');
    assert.equal(app.el('error').style.display, 'none', 'callers decide when to show it');
});

test('the banner shows percent-encoded paths in a readable form', () => {
    const app = createApp();
    app.g.showResourceError('error: nope', 'IR/Cane%20Ridge/x.wav');
    assert.equal(app.el('error-resource').textContent, 'IR/Cane Ridge/x.wav');
});

test('a malformed path is shown as-is rather than throwing', () => {
    const app = createApp();
    app.g.showResourceError('error: nope', 'IR/100%/x.wav');
    assert.equal(app.el('error-resource').textContent, 'IR/100%/x.wav');
});

test('clearResourceError restores the default text and hides the banner', () => {
    const app = createApp();
    app.g.showResourceError('error: nope', 'IR/x/y.wav');
    app.g.clearResourceError();

    assert.equal(app.el('error').style.display, 'none');
    assert.equal(app.el('error-message').textContent, app.data.DEFAULT_ERROR_MESSAGE);
    assert.equal(app.el('error-resource').textContent, '');
});

test('reportResourceFailure names the resource carried by the error', () => {
    const app = createApp();
    const err = new app.data.MissingResourceError('IR/x/y-1.wav', 404);
    app.g.reportResourceFailure(err, 'impulse response', 'ignored/fallback.wav');

    assert.equal(app.el('error-message').textContent, 'error: impulse response could not be retrieved (404)');
    assert.equal(app.el('error-resource').textContent, 'IR/x/y-1.wav');
});

test('reportResourceFailure falls back to the given URL for plain errors', () => {
    const app = createApp();
    app.g.reportResourceFailure(null, 'source file', 'Source Files/Clarinet.wav');
    assert.equal(app.el('error-message').textContent, 'error: source file could not be loaded');
    assert.equal(app.el('error-resource').textContent, 'Source Files/Clarinet.wav');
});

test('a church diagram that 404s is reported, since CSS backgrounds fail silently', () => {
    const app = createApp({ backgroundImage: 'url("http://localhost:8000/Images/X/Diagram.png")' });
    app.g.verifyRoomDiagram('CaneRidgeMeetingHouseui');

    assert.equal(app.probes.length, 1, 'the diagram should have been probed');
    app.probes[0].onerror();

    assert.equal(app.el('error').style.display, 'flex');
    assert.equal(app.el('error-resource').textContent, 'Images/X/Diagram.png', 'the origin should be stripped');
});

test('verifyRoomDiagram is quiet when there is no background to check', () => {
    const app = createApp({ backgroundImage: 'none' });
    app.g.verifyRoomDiagram('CaneRidgeMeetingHouseui');
    assert.equal(app.probes.length, 0);
});

// ── selection colours ─────────────────────────────────────────────────────

test('updateSelectedColor sets a custom property without clearing other inline styles', () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R2');
    app.el(':root').style.setProperty('--something-else', 'keep me');

    app.g.updateSelectedColor(true);

    assert.equal(app.el(':root').style.getPropertyValue('--maincolor2'), '#00f47f');
    assert.equal(app.el(':root').style.getPropertyValue('--something-else'), 'keep me',
        'assigning cssText would have wiped this');
});

test('choosing a receiver deselects the previous one', () => {
    const app = select(createApp(), 'CaneRidgeMeetingHouse', 'R2');
    app.g.updateRcvpos('rpR5_CaneRidgeMeetingHouse');

    assert.equal(app.el('rpR2_CaneRidgeMeetingHouse').style.backgroundColor, 'var(--buttoncolor1)');
    assert.equal(app.state.rcvpos, 'rpR5_CaneRidgeMeetingHouse');
});

test('selection helpers tolerate nothing being selected yet', () => {
    const app = createApp();
    assert.doesNotThrow(() => app.g.setButtonColor('', 'red'));
    assert.doesNotThrow(() => app.g.updateSelectedColor(true));
});

// ── slider and startup ────────────────────────────────────────────────────

test('setMix updates the label, the engine and the track fill together', () => {
    const app = createApp();
    app.g.setMix(40);

    assert.equal(app.el('mixlabel').innerText, '40%');
    assert.equal(app.state.convolutionMix, 0.4);
    assert.match(app.el('convmix').style.background, /#00205b 40%.*#d0d0d0 40%/);
});

test('initApp loads the default source and syncs the slider to its markup value', async () => {
    const app = createApp();
    app.el('convmix').value = '70';

    app.g.initApp();
    await app.settle();

    assert.equal(app.el('mixlabel').innerText, '70%');
    assert.equal(app.state.convolutionMix, 0.7);
    assert.ok(app.net.log.some(r => r.url === app.data.DEFAULT_SOURCE_FILE));
});

// ── church info modal ─────────────────────────────────────────────────────

test('showChurchInfo fills the modal from ChurchData', () => {
    const app = createApp();
    app.state.room = 'CaneRidgeMeetingHouse';
    app.g.showChurchInfo();

    const data = app.data.churchData.CaneRidgeMeetingHouse;
    assert.equal(app.el('church-info-name').textContent, data.name);
    assert.equal(app.el('church-info-address').textContent, data.address);
    assert.equal(app.el('church-info-date').textContent, 'Measured: ' + data.measured);
    assert.equal((app.el('church-info-history').innerHTML.match(/<p>/g) || []).length, data.history.length);
    assert.match(app.el('church-info-dimensions').innerHTML, /Height \(Floor to Ceiling\)/);
    assert.match(app.el('church-info-receivers').innerHTML, /R1 to Speakers/);
    assert.ok(app.el('church-info-modal').classList.contains('open'));
});

test('showChurchInfo heads the modal with the church’s cover photo', () => {
    const app = createApp();
    app.state.room = 'CaneRidgeMeetingHouse';
    app.g.showChurchInfo();

    const cover = app.el('church-info-cover');
    assert.equal(cover.src, app.data.churchData.CaneRidgeMeetingHouse.cover);
    assert.equal(cover.style.display, 'block');
    assert.equal(cover.alt, 'Cane Ridge Meeting House', 'the photo should be described for screen readers');
});

test('a church with no cover photo opens straight onto its history', () => {
    const app = createApp();
    app.state.room = 'BridgeCommunityChurch';
    app.g.showChurchInfo();

    const cover = app.el('church-info-cover');
    assert.equal(cover.style.display, 'none');
    assert.ok(!cover.src, 'no request should be made for a cover that does not exist');
});

test('the cover does not linger when moving to a church that has none', () => {
    const app = createApp();
    app.state.room = 'StAugustineIsleta';
    app.g.showChurchInfo();
    assert.equal(app.el('church-info-cover').style.display, 'block');

    app.state.room = 'BridgeCommunityChurch';
    app.g.showChurchInfo();

    const cover = app.el('church-info-cover');
    assert.equal(cover.style.display, 'none', 'the previous church’s photo is still showing');
    assert.ok(!cover.src, 'the previous church’s photo is still loaded');
});

test('each church gets its own cover, not the one before it', () => {
    const app = createApp();
    for (const key of Object.keys(app.data.ROOMS)) {
        app.state.room = key;
        app.g.showChurchInfo();
        const expected = app.data.churchData[key].cover;
        const cover = app.el('church-info-cover');
        if (expected) assert.equal(cover.src, expected, `${key}: wrong cover`);
        else assert.equal(cover.style.display, 'none', `${key}: should have no cover`);
    }
});

test('showChurchInfo does nothing when no church is selected', () => {
    const app = createApp();
    app.g.showChurchInfo();
    assert.equal(app.el('church-info-modal').classList.contains('open'), false);
});

test('closeChurchInfo closes the modal', () => {
    const app = createApp();
    app.state.room = 'CaneRidgeMeetingHouse';
    app.g.showChurchInfo();
    app.g.closeChurchInfo();
    assert.equal(app.el('church-info-modal').classList.contains('open'), false);
});

test('the info modal follows the page into and out of fullscreen', () => {
    const app = createApp();
    const onFullscreen = app.listeners.fullscreenchange[0];
    const modal = app.el('church-info-modal');
    const view = app.el('view');

    app.g.document.fullscreenElement = view;
    onFullscreen();
    assert.ok(view.children.includes(modal), 'the modal must move inside the fullscreen element to stay visible');
    assert.ok(app.el('fullscreen-btn').classList.contains('pnlm-fullscreen-toggle-button-active'));

    app.g.document.fullscreenElement = null;
    onFullscreen();
    assert.ok(app.el('body').children.includes(modal));
    assert.equal(app.el('fullscreen-btn').classList.contains('pnlm-fullscreen-toggle-button-active'), false);
});
