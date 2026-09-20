'use strict';
/**
 * Features.js — the URL feature flags, and the controls each one reveals.
 *
 * NOTHING IS GATED TODAY, which makes this the suite that keeps the mechanism
 * honest while it has no work to do. The first two sections declare a flag of
 * their own and drive the real readFeatures()/resolveImplied(), so the parts
 * that are easy to get subtly wrong — whole-segment matching, the query
 * spelling, transitive implication — stay covered against the day the next
 * research build needs them. The last section checks the opposite: that the
 * roster really is empty and nothing has been left half-gated behind it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp, ROOT } = require('./helpers/harness.js');

/**
 * Copies a value out of the app's vm realm. Objects the sandbox builds carry
 * its prototypes, and deepStrictEqual compares those, so an identical result
 * fails without this.
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The app as it ships: no flags declared, nothing gated */
const app0 = createApp();

/**
 * An app with flags declared, since the shipped roster is empty.
 *
 * FEATURE_NAMES is read live by readFeatures() and resolveImplied(), so pushing
 * onto it exercises the real resolver rather than a copy of it. FEATURES is
 * not: the app reads its address once at load, before these names existed, so
 * it is re-read here — through the same function, against the same address —
 * rather than assigned by hand.
 *
 * @param names  flags to declare, as FEATURE_NAMES would
 * @param where  the address this visit arrived at, { path, query }
 */
function withFlags(names, where = {}) {
    const { path: pathname = '/', query: search = '' } = where;
    const app = createApp({ path: pathname, query: search });

    app.data.FEATURE_NAMES.push(...names);
    Object.assign(app.state.FEATURES, app.data.readFeatures({ pathname, search }));
    return app;
}

/** Reads flags out of a made-up address without booting a whole app */
const flagsFor = (app, pathname, search = '') => plain(app.data.readFeatures({ pathname, search }));

/** The flag set an address should produce: the ones named true, the rest false */
const only = (app, ...on) => Object.fromEntries(
    plain(app.data.FEATURE_NAMES).map(name => [name, on.includes(name)]));

// ── reading the address ───────────────────────────────────────────────────

test('a path segment switches on the feature it names', () => {
    const app = withFlags(['demo', 'other']);
    assert.deepEqual(flagsFor(app, '/demo'), only(app, 'demo'));
    assert.deepEqual(flagsFor(app, '/demo/other'), only(app, 'demo', 'other'));
});

test('a query string does the same, for hosts that cannot route paths', () => {
    const app = withFlags(['demo', 'other']);
    assert.deepEqual(flagsFor(app, '/', '?demo'), only(app, 'demo'));
    assert.deepEqual(flagsFor(app, '/', '?demo=1&other'), only(app, 'demo', 'other'));
});

test('flags match whole segments, never a word inside one', () => {
    // A church folder or query value that happened to contain one of these
    // words must not quietly hand out a research feature.
    const app = withFlags(['demo']);
    assert.equal(flagsFor(app, '/not-demo').demo, false);
    assert.equal(flagsFor(app, '/demoted').demo, false);
    assert.equal(flagsFor(app, '/', '?church=demonstration').demo, false);
});

test('the flags are read case-insensitively', () => {
    const app = withFlags(['demo']);
    assert.equal(flagsFor(app, '/Demo').demo, true);
    assert.equal(flagsFor(app, '/', '?DEMO').demo, true);
});

test('an address naming something undeclared manufactures no flag', () => {
    // readFeatures() answers for FEATURE_NAMES and only those, which is what
    // stops a removed flag from coming back to life through an old bookmark.
    const app = createApp({ path: '/ambisonic' });
    assert.deepEqual(plain(app.state.FEATURES), {});
    assert.equal(app.g.featureEnabled('ambisonic'), false);
});

// ── implication ───────────────────────────────────────────────────────────

test('implication is transitive, so a chain can be declared one link at a time', () => {
    // The failure this prevents is silent: resolved one step deep, the far end
    // of a chain simply does not appear, and the symptom is a missing button.
    const app = withFlags(['near', 'middle', 'far'], { path: '/near' });
    Object.assign(app.data.FEATURE_IMPLIES, { near: ['middle'], middle: ['far'] });

    assert.equal(app.g.featureEnabled('middle'), true, 'named directly');
    assert.equal(app.g.featureEnabled('far'), true, 'reached through the middle link');
    assert.ok(!app.state.FEATURES.far, 'though the flag itself was never named');
});

test('implication runs one way only', () => {
    const app = withFlags(['near', 'middle'], { path: '/middle' });
    Object.assign(app.data.FEATURE_IMPLIES, { near: ['middle'] });

    assert.equal(app.g.featureEnabled('middle'), true);
    assert.equal(app.g.featureEnabled('near'), false,
        'the narrower flag must not unlock the wider one');
});

test('a mutual implication resolves rather than hanging', () => {
    // Nothing declares one; the guard exists so that adding one is a design
    // decision rather than a frozen tab.
    const app = withFlags(['near', 'other'], { path: '/near' });
    Object.assign(app.data.FEATURE_IMPLIES, { near: ['other'], other: ['near'] });

    assert.equal(app.g.featureEnabled('other'), true);
});

// ── what a flag reveals ───────────────────────────────────────────────────

const hidden = (app, id) => app.el(id).style.display === 'none';

test('a flag hides the controls it names from a visit that did not ask', () => {
    const app = withFlags(['demo']);
    app.data.FEATURE_CONTROLS.demo = ['headphones', 'tracking-control'];

    app.g.applyFeatureGating();

    for (const id of ['headphones', 'tracking-control']) {
        assert.ok(hidden(app, id), `${id} should not be reachable without the flag`);
    }
});

test('and reveals them for a visit that did', () => {
    const app = withFlags(['demo'], { path: '/demo' });
    app.data.FEATURE_CONTROLS.demo = ['headphones', 'tracking-control'];

    app.g.applyFeatureGating();

    for (const id of ['headphones', 'tracking-control']) {
        assert.ok(!hidden(app, id), `${id} should come with the flag`);
    }
});

test('help text describing a hidden feature is hidden with it', () => {
    const entries = [
        { feature: 'demo', style: {}, getAttribute() { return this.feature; } },
    ];
    const app = createApp({ querySelectorAll: () => entries });
    app.g.applyFeatureGating();

    assert.equal(entries[0].style.display, 'none',
        'instructions for a control nobody can see would only confuse');
});

// ── nothing is gated today ────────────────────────────────────────────────

test('the roster is empty, so a plain visit gets the whole experience', () => {
    const app = createApp();
    assert.deepEqual(plain(app.data.FEATURE_NAMES), []);
    assert.deepEqual(plain(app.data.FEATURE_CONTROLS), {});
    assert.deepEqual(plain(app.data.FEATURE_IMPLIES), {});
});

test('a plain visit is shown every control the page has', () => {
    // The counterpart of the gating tests above: with nothing declared, the
    // loop must leave the page alone rather than hide what it cannot account
    // for. A stale entry here would grey out the app for every visitor.
    const app = createApp();
    app.g.applyFeatureGating();

    for (const id of ['headphones', 'tracking-control']) {
        assert.ok(!hidden(app, id), `${id} is part of the published experience now`);
    }
});

test('no markup is left waiting on a flag that no longer exists', () => {
    // data-feature is resolved against FEATURE_NAMES, so an attribute naming a
    // removed flag hides that help text permanently and silently.
    const declared = plain(app0.data.FEATURE_NAMES);
    const orphaned = [...read('index.html').matchAll(/data-feature="([^"]+)"/g)]
        .map(m => m[1])
        .filter(name => !declared.includes(name));

    assert.deepEqual(orphaned, [], 'these would never be shown to anybody');
});

test('every gated control names a flag that exists', () => {
    // A control keyed to a flag nobody declares would be hidden forever, with
    // nothing in the address able to bring it back.
    const declared = plain(app0.data.FEATURE_NAMES);

    for (const feature of Object.keys(plain(app0.data.FEATURE_CONTROLS))) {
        assert.ok(declared.includes(feature), `${feature} gates controls but is not a flag`);
    }
});

test('the routes agree with the roster on both hosts', () => {
    // The path form only resolves where a route exists, and a route with no
    // flag behind it serves the page at an address that does nothing. Either
    // mismatch is silent, so both directions are checked.
    const declared = plain(app0.data.FEATURE_NAMES);

    const routed = [...read('server.js').matchAll(/FEATURE_PATHS = \[([^\]]*)\]/g)]
        .flatMap(m => [...m[1].matchAll(/'\/([^']+)'/g)].map(p => p[1]));
    const rewritten = [...read('netlify.toml').matchAll(/^\s*from = "\/([^"]+)"/gm)]
        .map(m => m[1]);

    assert.deepEqual(routed.sort(), [...declared].sort(), 'server.js');
    assert.deepEqual(rewritten.sort(), [...declared].sort(), 'netlify.toml');
});

// ── the row closes its gaps ───────────────────────────────────────────────

const seatOf = (app, id) => app.el(id).style.right;

test('the visible toggles sit in a row beside the play button', () => {
    // Each toggle is positioned individually against the corner, so hiding one
    // would otherwise leave a hole in the row.
    const app = createApp();
    const { TOGGLE_ROW_START_PX, TOGGLE_ROW_STEP_PX } = app.data;
    app.g.applyFeatureGating();

    app.data.MODE_TOGGLE_IDS.forEach((id, slot) => {
        assert.equal(seatOf(app, id), (TOGGLE_ROW_START_PX + slot * TOGGLE_ROW_STEP_PX) + 'px');
    });
});

test('a hidden toggle leaves no hole in the row', () => {
    const app = withFlags(['demo']);
    app.data.FEATURE_CONTROLS.demo = ['headphones'];
    app.g.applyFeatureGating();

    assert.ok(hidden(app, 'headphones'));
    assert.ok(!seatOf(app, 'headphones'),
        'a hidden toggle takes no seat, so the next one moves up into it');
});

test('the row geometry agrees with the CSS it mirrors', () => {
    // Layout.css positions the full row; the JS reseats it when a flag hides
    // one. The two have to start from the same numbers, or an ungated visit
    // would shift its buttons the moment the page loaded.
    const css = read('Style/Layout.css');
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
