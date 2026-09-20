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

/**
 * The flag set an address should produce: the ones named true, the rest false.
 *
 * Built from FEATURE_NAMES rather than written out, so that adding a flag does
 * not turn every one of these into a failure about a flag it was not testing.
 */
const only = (app, ...on) => Object.fromEntries(
    plain(app.data.FEATURE_NAMES).map(name => [name, on.includes(name)]));

// ── reading the address ───────────────────────────────────────────────────

test('the plain address gives the published experience and nothing else', () => {
    const app = createApp();
    assert.deepEqual(plain(app.data.FEATURE_NAMES).map(n => app.state.FEATURES[n]),
        plain(app.data.FEATURE_NAMES).map(() => false));
});

test('a path segment switches on the feature it names', () => {
    const app = createApp();
    assert.deepEqual(flagsFor(app, '/ambisonic'), only(app, 'ambisonic'));
});

test('a query string does the same, for hosts that cannot route paths', () => {
    const app = createApp();
    assert.deepEqual(flagsFor(app, '/', '?ambisonic'), only(app, 'ambisonic'));
    assert.deepEqual(flagsFor(app, '/', '?ambisonic=1'), only(app, 'ambisonic'));
});

test('flags match whole segments, never a word inside one', () => {
    // A church folder or query value that happened to contain one of these
    // words must not quietly hand out a research feature.
    const app = createApp();
    assert.equal(flagsFor(app, '/not-ambisonic').ambisonic, false);
    assert.equal(flagsFor(app, '/ambisonics').ambisonic, false);
    assert.equal(flagsFor(app, '/', '?church=ambisonically').ambisonic, false);
});

test('the flags are read case-insensitively', () => {
    const app = createApp();
    assert.equal(flagsFor(app, '/Ambisonic').ambisonic, true);
    assert.equal(flagsFor(app, '/', '?AMBISONIC').ambisonic, true);
});

test('the app reads its own address on load', () => {
    assert.equal(createApp({ path: '/ambisonic' }).state.FEATURES.ambisonic, true);
    assert.equal(createApp({ query: '?ambisonic' }).state.FEATURES.ambisonic, true);
});

test('a flag nobody declared is never switched on', () => {
    // readFeatures() answers for FEATURE_NAMES and only those, so an address
    // naming something else must not manufacture a flag out of it.
    const app = createApp({ path: '/binaural' });
    assert.deepEqual(plain(app.state.FEATURES), only(app));
});

// ── what each flag reveals ────────────────────────────────────────────────

const hidden = (app, id) => app.el(id).style.display === 'none';

test('a plain visit is shown no render toggles at all', () => {
    const app = createApp();
    app.g.applyFeatureGating();

    for (const id of ['headphones', 'tracking-control']) {
        assert.ok(hidden(app, id), `${id} should not be reachable without a flag`);
    }
});

test('the ambisonic flag reveals the headphone render and its head tracking', () => {
    // Tracking belongs to this render and to no other, so it arrives with it
    // rather than needing a flag of its own.
    const app = createApp({ path: '/ambisonic' });
    app.g.applyFeatureGating();

    for (const id of ['headphones', 'tracking-control']) {
        assert.ok(!hidden(app, id), id + ' should come with the ambisonic flag');
    }
});

test('every gated control names a flag that exists', () => {
    // A control keyed to a flag nobody declares would be hidden forever, with
    // nothing in the address able to bring it back.
    const app = createApp();
    const declared = plain(app.data.FEATURE_NAMES);

    for (const feature of Object.keys(plain(app.data.FEATURE_CONTROLS))) {
        assert.ok(declared.includes(feature), `${feature} gates controls but is not a flag`);
    }
});

test('implication is transitive, so a chain can be declared one link at a time', () => {
    // Nothing declares one today. The mechanism is what is being checked, since
    // the failure it prevents is silent: resolved one step deep, the far end of
    // a chain simply does not appear.
    const app = createApp({ path: '/ambisonic' });
    const implies = plain(app.data.FEATURE_IMPLIES);
    assert.deepEqual(implies, {}, 'no chain is declared yet, so this test builds its own');

    // featureEnabled() reads the live FEATURE_IMPLIES, so declaring a chain
    // here exercises the resolver rather than a copy of it.
    app.data.FEATURE_NAMES.push('middle', 'far');
    Object.assign(app.data.FEATURE_IMPLIES, { ambisonic: ['middle'], middle: ['far'] });
    try {
        assert.equal(app.g.featureEnabled('middle'), true, 'named directly');
        assert.equal(app.g.featureEnabled('far'), true, 'reached through the middle link');
        assert.ok(!app.state.FEATURES.far, 'though the flag itself was never named');
    } finally {
        app.data.FEATURE_NAMES.length = 1;
        delete app.data.FEATURE_IMPLIES.ambisonic;
        delete app.data.FEATURE_IMPLIES.middle;
    }
});

test('a mutual implication resolves rather than hanging', () => {
    // Nothing declares one; the guard exists so that adding one is a design
    // decision rather than a frozen tab.
    const app = createApp({ path: '/ambisonic' });
    app.data.FEATURE_NAMES.push('other');
    Object.assign(app.data.FEATURE_IMPLIES, { ambisonic: ['other'], other: ['ambisonic'] });
    try {
        assert.equal(app.g.featureEnabled('other'), true);
    } finally {
        app.data.FEATURE_NAMES.length = 1;
        delete app.data.FEATURE_IMPLIES.ambisonic;
        delete app.data.FEATURE_IMPLIES.other;
    }
});

test('help text describing a hidden feature is hidden with it', () => {
    const entries = [
        { feature: 'ambisonic', style: {}, getAttribute() { return this.feature; } },
    ];
    const app = createApp({ querySelectorAll: () => entries });
    app.g.applyFeatureGating();

    assert.equal(entries[0].style.display, 'none',
        'instructions for a control nobody can see would only confuse');
});

// ── the row closes its gaps ───────────────────────────────────────────────

const seatOf = (app, id) => app.el(id).style.right;

test('the visible toggles sit in a row beside the play button', () => {
    // Each toggle is positioned individually against the corner, so hiding one
    // would otherwise leave a hole in the row.
    const app = createApp({ path: '/ambisonic' });
    const { TOGGLE_ROW_START_PX, TOGGLE_ROW_STEP_PX } = app.data;
    app.g.applyFeatureGating();

    app.data.MODE_TOGGLE_IDS.forEach((id, slot) => {
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

    const ids = plain(app.data.MODE_TOGGLE_IDS);
    assert.equal(rightOf('#' + ids[0]), app.data.TOGGLE_ROW_START_PX);
    for (let i = 1; i < ids.length; i++) {
        assert.equal(rightOf('#' + ids[i]) - rightOf('#' + ids[i - 1]),
            app.data.TOGGLE_ROW_STEP_PX);
    }
});
