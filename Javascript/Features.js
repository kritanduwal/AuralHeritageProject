/**
 * Which optional playback features this visit has access to.
 *
 *   /                     stereo only — the published experience
 *   /ambisonic            adds the Headphones render and the head-tracking
 *                         control that belongs to it
 *
 * A query string works everywhere the path form does — "?ambisonic" — and needs
 * no server routing, which makes it the reliable spelling on a host that serves
 * this directory statically. The path form needs the route in server.js and the
 * redirect in netlify.toml, both of which hand back index.html without changing
 * the URL the browser shows.
 *
 * Gating is presentation only. Nothing here disables engine code: a hidden mode
 * is one nobody can reach, not one that has been removed, so the audio graph
 * and its tests are identical either way.
 *
 * @author Kritan Duwal
 */

/** Feature names that can be switched on, and what each reveals */
const FEATURE_NAMES = ['ambisonic'];

/**
 * Features that carry others with them, e.g. { full: ['basic'] }.
 *
 * Empty today — the one flag stands alone — and kept because implication is the
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

