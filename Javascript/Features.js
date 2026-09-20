/**
 * Which optional playback features this visit has access to.
 *
 * NOTHING IS GATED TODAY. Every render the app can produce is part of the
 * published experience, so a plain visit to / is the whole of it and this file
 * currently answers "no" to everything.
 *
 * It is kept because the next research build will want exactly this again, and
 * because the shape is easy to get subtly wrong: whole-segment matching, the
 * query spelling, and transitive implication are all here and all tested. To
 * put a feature behind an address again:
 *
 *   1. add its name to FEATURE_NAMES below
 *   2. list the controls it reveals in FEATURE_CONTROLS (App.js), and mark any
 *      help text with data-feature="<name>"
 *   3. add "/<name>" to FEATURE_PATHS (server.js) and a redirect to
 *      netlify.toml, so the path form resolves on both hosts
 *
 * A query string works everywhere the path form does — "?<name>" — and needs no
 * server routing, which makes it the reliable spelling on a host that serves
 * this directory statically. Step 3 is only for the path form, which hands back
 * index.html without changing the URL the browser shows.
 *
 * Gating is presentation only. Nothing here disables engine code: a hidden mode
 * is one nobody can reach, not one that has been removed, so the audio graph
 * and its tests are identical either way.
 *
 * @author Kritan Duwal
 */

/** Feature names that can be switched on, and what each reveals. None today. */
const FEATURE_NAMES = [];

/**
 * Features that carry others with them, e.g. { full: ['basic'] }.
 *
 * Empty today — nothing is gated at all — and kept because implication is the
 * part of this that is awkward to add later: resolveImplied() below is written
 * transitively so that a chain can be declared one link at a time rather than
 * every flag having to name everything beneath it.
 */
const FEATURE_IMPLIES = {};

/**
 * Reads the flags out of the address.
 *
 * Matches whole path segments rather than substrings so that a church whose
 * name happened to contain one of these words could never switch it on, and
 * accepts the query form with or without a value ("?binaural", "?binaural=1").
 */
function readFeatures(location) {
    const segments = String(location.pathname || '').toLowerCase().split('/').filter(Boolean);
    const query = String(location.search || '').toLowerCase();

    const enabled = {};
    for (const name of FEATURE_NAMES) {
        enabled[name] = segments.includes(name) ||
            new RegExp('[?&]' + name + '(=|&|$)').test(query);
    }
    return enabled;
}

/** The flags for this page load, read once */
const FEATURES = readFeatures(typeof location === 'undefined' ? {} : location);

/**
 * Every feature a set of named flags reaches, following implications as far as
 * they go.
 *
 * Transitive rather than one step deep, so a chain can be declared one link at
 * a time: a flag naming only the one below it still reaches the whole chain.
 * Resolved one step deep instead, the far end of a chain would simply not
 * appear — a gap with no symptom except a missing button.
 *
 * Skipping what `reached` already holds is what stops a mutual implication from
 * looping. Nothing declares one today; the guard is so that adding one is a
 * design decision rather than a hang.
 */
function resolveImplied(flags) {
    const reached = new Set();
    const pending = FEATURE_NAMES.filter(name => flags[name]);

    while (pending.length) {
        const name = pending.pop();
        if (reached.has(name)) continue;
        reached.add(name);
        pending.push(...(FEATURE_IMPLIES[name] || []));
    }
    return reached;
}

/** Whether a named feature is switched on for this visit, directly or implied */
function featureEnabled(name) {
    return resolveImplied(FEATURES).has(name);
}

