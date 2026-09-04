/**
 * Which optional playback features this visit has access to.
 *
 *   /                     stereo only — the published experience
 *   /binaural             adds the virtual-loudspeaker render and its toggle
 *   /ambisonic            adds the measured BRIR and live ambisonic renders,
 *                         and the head-tracking control that belongs to them
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
const FEATURE_NAMES = ['binaural', 'ambisonic'];

/**
 * Features that carry others with them.
 *
 * /ambisonic is the full research build rather than a third thing alongside
 * /binaural: the measured renders are only worth reaching if they can be
 * compared against the modelled one, so asking for them asks for that too.
 */
const FEATURE_IMPLIES = { ambisonic: ['binaural'] };

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

/** Whether a named feature is switched on for this visit, directly or implied */
function featureEnabled(name) {
    if (FEATURES[name]) return true;
    return FEATURE_NAMES.some(flag =>
        FEATURES[flag] && (FEATURE_IMPLIES[flag] || []).includes(name));
}

