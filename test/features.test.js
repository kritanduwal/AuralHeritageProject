'use strict';
/** Features.js — the URL feature flags, and the controls each one reveals */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/harness.js');

/**
 * Copies a value out of the app's vm realm. Objects the sandbox builds carry
 * its prototypes, and deepStrictEqual compares those, so an identical result
 * fails without this.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Reads flags out of a made-up address without booting a whole app */
const flagsFor = (app, pathname, search = '') => plain(app.data.readFeatures({ pathname, search }));

// ── reading the address ───────────────────────────────────────────────────

test('the plain address gives the published experience and nothing else', () => {
    const app = createApp();
    assert.deepEqual(plain(app.data.FEATURE_NAMES).map(n => app.state.FEATURES[n]), [false, false]);
});

test('a path segment switches on the feature it names', () => {
    const app = createApp();
    assert.deepEqual(flagsFor(app, '/binaural'), { binaural: true, ambisonic: false });
    assert.deepEqual(flagsFor(app, '/ambisonic'), { binaural: false, ambisonic: true });
    assert.deepEqual(flagsFor(app, '/binaural/ambisonic'), { binaural: true, ambisonic: true });
});

test('a query string does the same, for hosts that cannot route paths', () => {
    const app = createApp();
    assert.deepEqual(flagsFor(app, '/', '?binaural'), { binaural: true, ambisonic: false });
    assert.deepEqual(flagsFor(app, '/', '?binaural=1&ambisonic'), { binaural: true, ambisonic: true });
});

test('flags match whole segments, never a word inside one', () => {
    // A church folder or query value that happened to contain one of these
    // words must not quietly hand out a research feature.
    const app = createApp();
    assert.equal(flagsFor(app, '/not-binaural').binaural, false);
    assert.equal(flagsFor(app, '/binauralism').binaural, false);
    assert.equal(flagsFor(app, '/', '?church=binaurally').binaural, false);
});

test('the flags are read case-insensitively', () => {
    const app = createApp();
    assert.equal(flagsFor(app, '/Binaural').binaural, true);
    assert.equal(flagsFor(app, '/', '?AMBISONIC').ambisonic, true);
});

test('the app reads its own address on load', () => {
    assert.equal(createApp({ path: '/ambisonic' }).state.FEATURES.ambisonic, true);
    assert.equal(createApp({ query: '?binaural' }).state.FEATURES.binaural, true);
});

// ── what each flag reveals ────────────────────────────────────────────────

const hidden = (app, id) => app.el(id).style.display === 'none';

test('a plain visit is shown no render toggles at all', () => {
    const app = createApp();
    app.g.applyFeatureGating();

    for (const id of ['binaural', 'brir', 'ambisonic', 'tracking-control']) {
        assert.ok(hidden(app, id), `${id} should not be reachable without a flag`);
    }
});

test('the binaural flag reveals only the modelled render', () => {
    const app = createApp({ path: '/binaural' });
    app.g.applyFeatureGating();

    assert.ok(!hidden(app, 'binaural'));
    for (const id of ['brir', 'ambisonic', 'tracking-control']) {
        assert.ok(hidden(app, id), `${id} belongs to the other flag`);
    }
});

test('the ambisonic flag is the full build and carries the modelled render too', () => {
    // The measured renders are only worth reaching if they can be compared
    // against the modelled one, so asking for them asks for that as well.
    const app = createApp({ path: '/ambisonic' });
    app.g.applyFeatureGating();

    for (const id of ['binaural', 'brir', 'ambisonic', 'tracking-control']) {
        assert.ok(!hidden(app, id), id + ' should come with the ambisonic flag');
    }
    assert.equal(app.g.featureEnabled('binaural'), true, 'implied, though never named');
    assert.equal(app.state.FEATURES.binaural, false, 'the flag itself was not set');
});

test('the implication runs one way only', () => {
    const app = createApp({ path: '/binaural' });
    assert.equal(app.g.featureEnabled('binaural'), true);
    assert.equal(app.g.featureEnabled('ambisonic'), false,
        'the modelled render must not unlock the measured ones');
});

test('naming both flags is the same as naming the wider one', () => {
    const app = createApp({ query: '?binaural&ambisonic' });
    app.g.applyFeatureGating();

    for (const id of ['binaural', 'brir', 'ambisonic', 'tracking-control']) {
        assert.ok(!hidden(app, id));
    }
});

test('help text describing a hidden feature is hidden with it', () => {
    const entries = [
        { feature: 'binaural', style: {}, getAttribute() { return this.feature; } },
    ];
    const app = createApp({ querySelectorAll: () => entries });
    app.g.applyFeatureGating();

    assert.equal(entries[0].style.display, 'none',
        'instructions for a control nobody can see would only confuse');
});

// ── the row closes its gaps ───────────────────────────────────────────────

const seatOf = (app, id) => app.el(id).style.right;

test('the visible toggles sit in a row with no gap where a hidden one was', () => {
    // Each toggle is positioned individually against the corner, so hiding one
    // would otherwise leave a hole in the middle of the row.
    const app = createApp({ path: '/binaural' });
    const { TOGGLE_ROW_START_PX } = app.data;
    app.g.applyFeatureGating();

    assert.equal(seatOf(app, 'binaural'), TOGGLE_ROW_START_PX + 'px',
        'the only visible toggle takes the first seat, beside play');
});

test('with every toggle shown the row matches the stylesheet', () => {
    const app = createApp({ path: '/ambisonic' });
    const { TOGGLE_ROW_START_PX, TOGGLE_ROW_STEP_PX } = app.data;
    app.g.applyFeatureGating();

    ['binaural', 'brir', 'ambisonic'].forEach((id, slot) => {
        assert.equal(seatOf(app, id), (TOGGLE_ROW_START_PX + slot * TOGGLE_ROW_STEP_PX) + 'px');
    });
});

test('the row geometry agrees with the CSS it mirrors', () => {
    // Layout.css positions the full row; the JS reseats it when a flag hides
    // one. The two have to start from the same numbers, or an ungated visit
    // would shift its buttons the moment the page loaded.
    const fs = require('fs'), path = require('path');
    const { ROOT } = require('./helpers/harness.js');
    const css = fs.readFileSync(path.join(ROOT, 'Style', 'Layout.css'), 'utf8');
    const app = createApp();

    const rightOf = (selector) =>
        Number(css.match(new RegExp('^' + selector + '\\s*\\{([^}]*)\\}', 'm'))[1]
            .match(/right:\s*(\d+)px/)[1]);

    assert.equal(rightOf('#binaural'), app.data.TOGGLE_ROW_START_PX);
    assert.equal(rightOf('#brir') - rightOf('#binaural'), app.data.TOGGLE_ROW_STEP_PX);
    assert.equal(rightOf('#ambisonic') - rightOf('#brir'), app.data.TOGGLE_ROW_STEP_PX);
});
