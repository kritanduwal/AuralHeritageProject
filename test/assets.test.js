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

/** The playback controls, in the order they sit leftward from the corner */
const CONTROL_ROW = ['#play', '#binaural', '#brir', '#ambisonic'];

/** The three render modes and the engine call each one makes */
const MODE_TOGGLES = [
    ['binaural', 'toggleBinaural'],
    ['brir', 'toggleBrir'],
    ['ambisonic', 'toggleAmbisonic'],
];

test('every render mode has a button wired to the engine', () => {
    for (const [id, handler] of MODE_TOGGLES) {
        assert.match(html, new RegExp(`id="${id}"`), `no ${id} button in the view`);
        assert.match(html, new RegExp(`id="${id}"[^>]*onclick="${handler}\\(\\)"`),
            `the ${id} button must call the engine, not just sit there`);
        assert.match(html, new RegExp(`id="${id}"[^>]*aria-pressed=`),
            `${id} has to announce its state to assistive technology`);
        assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*mode-toggle`),
            `${id} must carry the shared toggle styling`);
    }
});

test('the modes needing offline-built files start disabled', () => {
    // Most positions have neither a BRIR nor a B-format IR. A button that looks
    // live until it is pressed is worse than one that says so up front.
    for (const id of ['brir', 'ambisonic']) {
        assert.match(html, new RegExp(`id="${id}"[^>]*\\sdisabled`),
            `${id} should start disabled; the engine enables it once the files are found`);
    }
    assert.doesNotMatch(html, /id="binaural"[^>]*\sdisabled/,
        'the modelled binaural render needs no extra files and is always available');
});

test('the playback controls sit in a row without overlapping', () => {
    // All are position: fixed against the bottom-right corner, so a change to
    // any one's size silently stacks it on top of its neighbour.
    const spans = CONTROL_ROW.map(selector => {
        const rule = ruleFor(selector);
        const inner = px(rule, 'right');
        return { selector, inner, outer: inner + px(rule, 'width') };
    });

    for (let i = 1; i < spans.length; i++) {
        const left = spans[i], right = spans[i - 1];
        assert.ok(left.inner >= right.outer,
            `${left.selector} overlaps ${right.selector}: ${right.selector} reaches ` +
            `${right.outer}px from the right, ${left.selector} starts at ${left.inner}px`);
        assert.ok(left.inner - right.outer <= 32,
            `${left.selector} strays from ${right.selector}; the row should read as one group`);
    }
});

test('the playback controls share a centre line', () => {
    const centre = (selector) => {
        const rule = ruleFor(selector);
        return px(rule, 'bottom') + px(rule, 'height') / 2;
    };
    const line = centre('#play');
    for (const selector of CONTROL_ROW) {
        assert.equal(centre(selector), line,
            `${selector} is a different size, so its bottom offset has to differ to line up`);
    }
});

test('the head-tracking control is wired and clears the button row', () => {
    assert.match(html, /id="tracking"[^>]*onchange="setSoundfieldTracking\(this\.checked\)"/,
        'the checkbox must drive the engine');
    assert.match(html, /id="tracking"[^>]*\sdisabled/,
        'tracking applies to one mode only, so it starts unavailable');

    const row = ruleFor('#play');
    const rowTop = px(row, 'bottom') + px(row, 'height');
    assert.ok(px(ruleFor('#tracking-control'), 'bottom') >= rowTop,
        'the tracking control would sit on top of the buttons');
});

test('the engaged colour of a toggle does not double as the availability colour', () => {
    // --maincolor2 turns crimson to report a missing recording. A mode toggle
    // borrowing it would look like it was reporting a failure of its own.
    const rule = ruleFor('\\.mode-toggle\\.active');
    assert.doesNotMatch(rule, /--maincolor2/);
    assert.match(rule, /var\(--activecolor\)/);
    assert.match(read('Style/Root.css'), /--activecolor:/, 'the variable has to be defined somewhere');
});

test('a toggle reports its new state as fast as the audio switches', () => {
    // The fill is the only report these buttons make, so a slow settle here is
    // read as the whole switch being slow however fast the audio actually was.
    const seconds = Number(ruleFor('\\.mode-toggle').match(/transition:[^;]*?([\d.]+)s/)[1]);
    assert.ok(seconds <= 0.1,
        `the colour takes ${seconds}s to arrive, long after the 0.02s audio crossfade`);
});

test('hovering a toggle never looks like engaging it', () => {
    // No glyph changes with its mode, so colour is the only state there is —
    // and the pointer is still on the button the instant it is switched off. A
    // hover that painted it the engaged colour would report the mode just left.
    const fill = (selector) => {
        const match = ruleFor(selector).match(/background-color:\s*var\((--[\w-]+)\)/);
        assert.ok(match, `${selector} must set a background colour`);
        return match[1];
    };

    const resting = fill('\\.mode-toggle');
    const hover = fill('\\.mode-toggle:hover');
    const engaged = fill('\\.mode-toggle\\.active');
    const engagedHover = fill('\\.mode-toggle\\.active:hover');

    assert.notEqual(hover, engaged, 'hovering an off toggle must not paint it the engaged colour');
    assert.notEqual(hover, resting, 'hover still has to answer the pointer');
    assert.notEqual(engagedHover, hover, 'the two states must stay apart under the pointer too');

    const root = read('Style/Root.css');
    for (const name of [hover, engagedHover]) {
        assert.match(root, new RegExp(name + ':'), `${name} has to be defined somewhere`);
    }
});

test('an unavailable mode does not answer the pointer as though it were live', () => {
    // Two of the three modes are disabled on most positions. A greyed button
    // that still lit up on hover would look pressable.
    const disabled = ruleFor('\\.mode-toggle:disabled');
    assert.match(disabled, /cursor:\s*not-allowed/);
    assert.match(disabled, /opacity:/, 'a disabled mode has to look different from an off one');
    assert.match(ruleFor('\\.mode-toggle:disabled:hover'), /background-color:\s*var\(--belmont-blue\)/,
        'hovering a mode that does not exist here must not tint it');
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
        // <base href="/"> names the document's root, not a file to load
        if (m[1] === '/') continue;
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
test('no church trim is left at a level the engine would refuse', () => {
    // These are dB: zero leaves the stage alone and negative takes level off,
    // which is the whole working range. A positive value is a dropped minus
    // sign, and the engine ignores it — silently, so it has to be caught here.
    const bad = [];
    for (const key of roomKeys) {
        for (const [stage, db] of Object.entries(ROOMS[key].trim)) {
            if (typeof db !== 'number' || !Number.isFinite(db) || db > 0) {
                bad.push(`${key}.${stage} = ${JSON.stringify(db)}`);
            }
        }
    }
    assert.deepEqual(bad, [], 'trims must be finite numbers at or below 0 dB');
});

test('a calibrated trim stays within a level anyone would actually set', () => {
    // Not a hard limit, a tripwire. The stages settle somewhere between a
    // couple of dB and the high teens; something far past that is a typo — a
    // misplaced decimal point, or dB confused with a linear gain.
    const outliers = [];
    for (const key of roomKeys) {
        for (const [stage, db] of Object.entries(ROOMS[key].trim)) {
            if (db < -40) outliers.push(`${key}.${stage} = ${db} dB`);
        }
    }
    assert.deepEqual(outliers, [], 'a trim below -40 dB is almost certainly a mistake');
});