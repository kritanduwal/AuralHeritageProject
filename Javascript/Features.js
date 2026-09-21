/**
 * Which optional playback features this visit has access to.
 *
 * Nothing is gated today: / is the whole experience. Kept for the next research
 * build. To put a feature behind an address again:
 *
 *   1. add its name to FEATURE_NAMES below
 *   2. list the controls it reveals in FEATURE_CONTROLS (App.js), and mark any
 *      help text with data-feature="<name>"
 *   3. add "/<name>" to FEATURE_PATHS (server.js) and a redirect to netlify.toml
 *
 * Step 3 is only for the path form; "?<name>" needs no routing at all, which
 * makes it the reliable spelling on a static host.
 *
 * Gating is presentation only. Nothing here disables engine code: a hidden mode
 * is one nobody can reach, not one that has been removed.
 *
 * @author Kritan Duwal
 */

/** Feature names that can be switched on, and what each reveals. None today. */
const FEATURE_NAMES = [];

/**
 * Features that carry others with them, e.g. { full: ['basic'] }. Empty today;
 * resolveImplied() resolves transitively, so a chain can be declared one link
 * at a time.
 */
const FEATURE_IMPLIES = {};

/**
 * Reads the flags out of the address.
 *
 * Whole path segments rather than substrings, so a church name containing a
 * flag's word cannot switch it on. The query form takes an optional value.
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
 * they go. Resolved one step deep instead, the far end of a chain would simply
 * not appear — a gap whose only symptom is a missing button.
 *
 * Skipping what `reached` holds is what stops a mutual implication looping.
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

