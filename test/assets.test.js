'use strict';
/**
 * Integrity of the things the code points at: that every path in ROOMS resolves
 * to a real file with the exact case it is spelled in, and that the markup,
 * stylesheets and data table all agree on the same set of rooms and receivers.
 *
 * These are the checks that catch a church going half-missing after files are
 * added or renamed, and they run without a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp, ROOT, APP_FILES } = require('./helpers/harness.js');

const app = createApp();
const { ROOMS } = app.data;
const { impulseResponseBase, panoramaPath } = app.g;

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('index.html');
const layoutCss = read('Style/Layout.css');
const buttonsCss = read('Style/ChurchButtons.css');

const roomKeys = Object.keys(ROOMS);
const receiversOf = (key) => Object.keys(ROOMS[key].receivers);

/**
 * Case-sensitive existence check. Windows and macOS resolve paths
 * case-insensitively, so plain existsSync would pass for a file whose real name
 * differs in case — and then 404 on the deployed, case-sensitive host.
 */
function existsExactly(relative) {
    const parts = relative.split('/');
    let dir = ROOT;
    for (let i = 0; i < parts.length; i++) {
        let entries;
        try {
            entries = fs.readdirSync(dir);
        } catch {
            return false;
        }
        if (!entries.includes(parts[i])) return false;
        dir = path.join(dir, parts[i]);
    }
    return true;
}

test('the case-sensitive existence check is itself sound', () => {
    assert.equal(existsExactly('index.html'), true);
    assert.equal(existsExactly('Index.html'), false, 'a wrong-case path must not pass');
    assert.equal(existsExactly('Images/default.jpg'), true);
    assert.equal(existsExactly('Images/nothing-here.jpg'), false);
});

test('every receiver has both impulse response channels on disk', () => {
    const missing = [];
    for (const key of roomKeys) {
        for (const rid of receiversOf(key)) {
            for (const channel of ['1', '2']) {
                const file = impulseResponseBase(ROOMS[key], rid) + channel + '.wav';
                if (!existsExactly(file)) missing.push(file);
            }
        }
    }
    assert.deepEqual(missing, [], 'impulse responses referenced by ROOMS but not present');
});

test('every receiver has its panorama on disk, spelled with the right case', () => {
    const missing = [];
    for (const key of roomKeys) {
        for (const rid of receiversOf(key)) {
            const file = panoramaPath(ROOMS[key], rid);
            if (!existsExactly(file)) missing.push(file);
        }
    }
    assert.deepEqual(missing, [], 'panoramas referenced by ROOMS but not present (check .jpg vs .JPG)');
});

test('every cover photo named in ChurchData exists, spelled with the right case', () => {
    const missing = [];
    for (const key of roomKeys) {
        const cover = app.data.churchData[key].cover;
        if (cover && !existsExactly(cover)) missing.push(`${key}: ${cover}`);
    }
    assert.deepEqual(missing, [], 'cover photos named but not present (check .jpg vs .jpeg)');
});

test('a cover photo on disk is not left unlisted', () => {
    // A cover added to a church folder but never named in ChurchData would
    // silently never appear, which is hard to notice from the page alone
    const unlisted = [];
    for (const key of roomKeys) {
        if (app.data.churchData[key].cover) continue;
        const dir = path.join(ROOT, ROOMS[key].panorama.dir);
        const found = fs.readdirSync(dir).filter(f => /^Info cover\./i.test(f));
        if (found.length) unlisted.push(`${key}: ${found.join(', ')}`);
    }
    assert.deepEqual(unlisted, [], 'cover photos present on disk but not listed in ChurchData');
});

test('the modal has somewhere to put a cover photo', () => {
    assert.match(html, /id="church-info-cover"/, 'no cover element in the info modal');
    assert.match(html, /id="church-info-cover"[^>]*onerror=/,
        'the cover should hide itself if the file cannot be retrieved');
});

test('the cover photo is shown whole rather than cropped', () => {
    const rule = read('Style/Layout.css').match(/#church-info-cover\s*\{([^}]*)\}/)[1];

    assert.doesNotMatch(rule, /object-fit:\s*cover/, 'object-fit: cover crops the photo to fill its box');
    assert.match(rule, /width:\s*auto/, 'the width must follow the photo, not the container');
    assert.match(rule, /height:\s*auto/, 'the height must follow the aspect ratio so nothing is cut off');
    assert.match(rule, /max-width:/, 'the photo must be capped to the width of the modal');
    assert.match(rule, /max-height:/, 'a tall photo must not push the history out of view');
});

// ── the playback controls ─────────────────────────────────────────────────

/** Pulls the px value of one property out of a CSS rule body */
const px = (rule, prop) => Number(rule.match(new RegExp(prop + ':\\s*(-?[\\d.]+)px'))[1]);
/** Body of the rule whose selector is exactly `selector`, at the start of a line */
const ruleFor = (selector) =>
    layoutCss.match(new RegExp('^' + selector + '\\s*\\{([^}]*)\\}', 'm'))[1];

test('the binaural toggle is in the markup and wired to the engine', () => {
    assert.match(html, /id="binaural"/, 'no binaural button in the view');
    assert.match(html, /id="binaural"[^>]*onclick="toggleBinaural\(\)"/,
        'the button must call the engine, not just sit there');
    assert.match(html, /id="binaural"[^>]*aria-pressed=/,
        'a toggle has to announce its state to assistive technology');
});

test('the binaural toggle sits beside the play button without overlapping it', () => {
    // Both are position: fixed against the bottom-right corner, so a change to
    // either one's size can silently stack them on top of each other.
    const play = ruleFor('#play');
    const binaural = ruleFor('#binaural');

    const playInner = px(play, 'right');
    const playOuter = playInner + px(play, 'width');
    const binauralInner = px(binaural, 'right');

    assert.ok(binauralInner >= playOuter,
        `the buttons overlap: play reaches ${playOuter}px from the right, binaural starts at ${binauralInner}px`);
    assert.ok(binauralInner - playOuter <= 32,
        'the two controls should read as a pair, not as strays at opposite ends');
});

test('the two playback controls share a centre line', () => {
    const centre = (rule) => px(rule, 'bottom') + px(rule, 'height') / 2;
    assert.equal(centre(ruleFor('#binaural')), centre(ruleFor('#play')),
        'the buttons are different sizes, so their bottom offsets have to differ to line up');
});

test('the engaged colour of a toggle does not double as the availability colour', () => {
    // --maincolor2 turns crimson to report a missing recording. A mode toggle
    // borrowing it would look like it was reporting a failure of its own.
    const rule = ruleFor('#binaural\\.active');
    assert.doesNotMatch(rule, /--maincolor2/);
    assert.match(rule, /var\(--activecolor\)/);
    assert.match(read('Style/Root.css'), /--activecolor:/, 'the variable has to be defined somewhere');
});

test('the toggle reports its new state as fast as the audio switches', () => {
    // The fill is the only report this button makes, so a slow settle here is
    // read as the whole switch being slow however fast the audio actually was.
    const seconds = Number(ruleFor('#binaural').match(/transition:[^;]*?([\d.]+)s/)[1]);
    assert.ok(seconds <= 0.1,
        `the colour takes ${seconds}s to arrive, long after the 0.02s audio crossfade`);
});

test('hovering the toggle never looks like engaging it', () => {
    // The headset glyph is the same in both modes, so colour is the only state
    // there is — and the pointer is still on the button the instant it is
    // switched off. A hover that painted it the engaged colour would report the
    // mode it had just left.
    const fill = (selector) => {
        const match = ruleFor(selector).match(/background-color:\s*var\((--[\w-]+)\)/);
        assert.ok(match, `${selector} must set a background colour`);
        return match[1];
    };

    const resting = fill('#binaural');
    const hover = fill('#binaural:hover');
    const engaged = fill('#binaural\\.active');
    const engagedHover = fill('#binaural\\.active:hover');

    assert.notEqual(hover, engaged, 'hovering an off toggle must not paint it the engaged colour');
    assert.notEqual(hover, resting, 'hover still has to answer the pointer');
    assert.notEqual(engagedHover, hover, 'the two states must stay apart under the pointer too');

    const root = read('Style/Root.css');
    for (const name of [hover, engagedHover]) {
        assert.match(root, new RegExp(name + ':'), `${name} has to be defined somewhere`);
    }
});

test('every church diagram referenced by CSS exists, spelled with the right case', () => {
    const missing = [];
    for (const m of layoutCss.matchAll(/url\("\.\.\/([^"]+)"\)/g)) {
        if (!existsExactly('Images/' + m[1].replace(/^Images\//, ''))) missing.push(m[1]);
    }
    assert.deepEqual(missing, [], 'diagram backgrounds are invisible failures — a 404 leaves an empty panel');
});

test('every local file referenced by index.html exists', () => {
    const missing = [];
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (/^(https?:|#|mailto:|data:)/.test(m[1])) continue;
        if (!existsExactly(m[1])) missing.push(m[1]);
    }
    assert.deepEqual(missing, []);
});

test('index.html loads every application script, in dependency order', () => {
    const loaded = Array.from(html.matchAll(/<script src="Javascript\/([^"]+)"/g), m => m[1]);
    assert.deepEqual(loaded, APP_FILES,
        'the harness loads these files in this order; index.html must agree');
});

test('index.html has no leftover references to deleted per-church files', () => {
    assert.doesNotMatch(html, /Compile\w+\.js/, 'the per-church compile files were replaced by Rooms.js');
    for (const key of roomKeys) {
        assert.ok(!html.includes(`${key}Buttons.css`),
            `${key}Buttons.css was merged into ChurchButtons.css`);
    }
});

test('the dropdown offers exactly the rooms in the table', () => {
    const options = Array.from(html.matchAll(/<option value="([^"]+)">/g), m => m[1]);
    assert.deepEqual(options.slice().sort(), roomKeys.slice().sort());
});

test('every room has an overlay and a source marker in the markup', () => {
    for (const key of roomKeys) {
        assert.ok(html.includes(`id="${key}ui"`), `${key}: no overlay div`);
        assert.ok(html.includes(`id="spS_${key}"`), `${key}: no source marker`);
    }
});

test('the receiver markers in the markup match the table exactly', () => {
    for (const key of roomKeys) {
        const inMarkup = Array.from(html.matchAll(new RegExp(`id="rp(R\\d+)_${key}"`, 'g')), m => m[1]);
        assert.deepEqual(inMarkup, receiversOf(key), `${key}: markup and ROOMS disagree`);
    }
});

test('every marker in the markup is positioned by a CSS rule', () => {
    const positioned = new Set(Array.from(buttonsCss.matchAll(/#([\w-]+)\s*\{/g), m => m[1]));
    const unpositioned = [];
    for (const key of roomKeys) {
        for (const id of [`spS_${key}`, ...receiversOf(key).map(r => `rp${r}_${key}`)]) {
            if (!positioned.has(id)) unpositioned.push(id);
        }
    }
    assert.deepEqual(unpositioned, [], 'markers without a rule stack up in the corner of the diagram');
});

test('every positioned marker gives both coordinates', () => {
    const incomplete = [];
    for (const m of buttonsCss.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)) {
        if (!/top\s*:/.test(m[2]) || !/left\s*:/.test(m[2])) incomplete.push(m[1]);
    }
    assert.deepEqual(incomplete, []);
});

test('markers rely on the shared position rule rather than repeating it', () => {
    assert.doesNotMatch(buttonsCss, /^\s*position\s*:/m,
        'position: absolute belongs on .bluebutton / .yellowsquare in Root.css');
    const root = read('Style/Root.css');
    for (const cls of ['.bluebutton', '.yellowsquare']) {
        const rule = root.match(new RegExp(`\\${cls}\\s*\\{([^}]*)\\}`))[1];
        assert.match(rule, /position\s*:\s*absolute/, `${cls} must position its markers`);
    }
});

test('every room overlay has a diagram and a size', () => {
    for (const key of roomKeys) {
        const rule = layoutCss.match(new RegExp(`#${key}ui\\s*\\{([^}]*)\\}`));
        assert.ok(rule, `${key}: no overlay rule in Layout.css`);
        assert.match(rule[1], /background-image\s*:\s*url/, `${key}: no diagram`);
        assert.match(rule[1], /width\s*:/, `${key}: no width`);
        assert.match(rule[1], /height\s*:/, `${key}: no height`);
    }
});

test('every stylesheet and script the page loads is one that exists', () => {
    const links = Array.from(html.matchAll(/<link[^>]+href="(Style\/[^"]+)"/g), m => m[1]);
    assert.ok(links.length > 0);
    for (const href of links) assert.ok(existsExactly(href), `${href} is linked but missing`);

    const loaded = links.map(href => href.replace(/^Style\//, '')).sort();
    const shipped = fs.readdirSync(path.join(ROOT, 'Style')).filter(f => f.endsWith('.css')).sort();
    assert.deepEqual(loaded, shipped, 'a stylesheet ships but is never loaded, or vice versa');
});

test('the impulse response library is organised the way README describes', () => {
    // Tennessee measurements have 8 channels per position, the rest 6
    const eightChannel = ['BridgeCommunityChurch', 'ChristChurchCathedral', 'DowntownPresbyterianChurch',
        'FirstBaptistChurchCapitolHill', 'HolyTrinityEpiscopalChurch', 'UnitedMethodistChurch'];

    for (const key of roomKeys) {
        const files = fs.readdirSync(path.join(ROOT, ROOMS[key].ir.dir));
        const channels = new Set(Array.from(files, f => (f.match(/-(\d+)\.wav$/) || [])[1]).filter(Boolean));
        const expected = eightChannel.includes(key) ? 8 : 6;
        assert.equal(channels.size, expected, `${key}: expected ${expected} channels per position`);
    }
});

test('the app only ever loads channels 1 and 2', () => {
    const engine = read('Javascript/AudioEngine.js');
    const channels = new Set(Array.from(engine.matchAll(/currentIr\.base \+ "(\d)\.wav"/g), m => m[1]));
    assert.deepEqual(Array.from(channels).sort(), ['1', '2']);
});

test('no application source references a file that no longer exists', () => {
    const missing = [];
    for (const file of APP_FILES) {
        const src = read('Javascript/' + file);
        for (const m of src.matchAll(/"((?:IR|Images|Source Files)\/[^"]+)"/g)) {
            // Skip the directory/prefix fragments that are joined at runtime
            if (!/\.\w+$/.test(m[1])) continue;
            if (!existsExactly(m[1])) missing.push(`${file}: ${m[1]}`);
        }
    }
    assert.deepEqual(missing, []);
});
