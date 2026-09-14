/**
 * Which optional playback features this visit has access to.
 *
 *   /                     stereo only — the published experience
 *   /binaural             adds the virtual-loudspeaker render and its toggle
 *   /ambisonic            adds the measured BRIR and live ambisonic renders,
 *                         and the head-tracking control that belongs to them
 *   /unnormalized         puts the un-normalized original captures behind the
 *                         two decoded renders, where a church has them. Stereo
 *                         and the virtual-loudspeaker render do not move.
 *
 * A query string works everywhere the path form does — "?binaural&ambisonic" —
 * and needs no server routing, which makes it the reliable spelling on a host
 * that serves this directory statically. The path form needs the two routes in
 * server.js and the redirects in netlify.toml, both of which hand back
 * index.html without changing the URL the browser shows.
 *
 * Gating is presentation only. Nothing here disables engine code: a hidden mode
 * is one nobody can reach, not one that has been removed, so the audio graph
 * and its tests are identical either way.
 *
 * @author Kritan Duwal
 */

/** Feature names that can be switched on, and what each reveals */
const FEATURE_NAMES = ['binaural', 'ambisonic', 'unnormalized'];

/**
 * Features that carry others with them.
 *
 * /ambisonic is the full research build rather than a third thing alongside
 * /binaural: the measured renders are only worth reaching if they can be
 * compared against the modelled one, so asking for them asks for that too.
 *
 * /unnormalized sits above /ambisonic for the same reason one step further
 * along. Swapping in the original captures changes what every stage convolves,
 * but stereo and the virtual-loudspeaker render pass their impulse responses
 * through convolvers that normalize, which scales most of the difference back
 * out. The decoded stages are the ones that can actually show it, so a visit
 * asking for the originals is asking to hear those.
 *
 * Implication is transitive — see resolveImplied() — so this one line also
 * carries /binaural along behind /ambisonic rather than having to name it.
 */
const FEATURE_IMPLIES = { ambisonic: ['binaural'], unnormalized: ['ambisonic'] };

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
 * a time. /unnormalized implies /ambisonic implies /binaural; resolved one step
 * at a time, asking for the originals would reveal the measured renders but not
 * the modelled one they are compared against — a gap with no symptom except a
 * missing button.
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

