/**
 * Network logging in the browser console, for development.
 *
 * Off unless asked for, so a visitor's console stays quiet:
 *
 *   ?netlog                 on for this page load, e.g. /?netlog or /5?netlog
 *   netlog(true)            in the console: on, and remembered for later visits
 *   netlog(false)           off again, and forgotten
 *
 * Two sources, because the page fetches in two ways:
 *
 *   fetch()        the app's own requests, labelled by what they are:
 *                    ir       the stereo impulse response pair
 *                    bformat  the B-format the headphone and speaker stages decode
 *                    source   the audio being played into the room
 *                    probe    the HEAD that checks a position has a recording
 *                    api      /api/source-files
 *                  Logged with status, size and time, failures with the reason.
 *                  A download is timed to its last byte, when the app has read
 *                  it, with the first response's time beside it, and marked
 *                  "from cache" when nothing crossed the network.
 *   everything     panoramas (pannellum), map tiles (Leaflet), diagrams (CSS),
 *   else           scripts, fonts. Seen through the Resource Timing API, which
 *                  reports size and time; status only where the browser does.
 *
 * Every entry is also kept in `netlogEntries`, so `console.table(netlogEntries)`
 * shows the session so far, and `netlogSummary()` totals it by kind.
 *
 * Loaded first, so the wrapper is in place before any other script fetches.
 * It is not a feature flag (see Features.js): it changes nothing on the page.
 *
 * @author Kritan Duwal
 */

/** Where netlog(true) is remembered */
const NETLOG_STORAGE_KEY = 'netlog';

/** Every request seen this session, oldest first, capped so it cannot grow forever */
const netlogEntries = [];
const NETLOG_MAX_ENTRIES = 2000;

/** Whether this page load logs: ?netlog in the address, or remembered */
function netlogRequested() {
    const query = typeof location === 'undefined' ? '' : String(location.search || '');
    if (/[?&]netlog(=|&|$)/i.test(query)) return true;

    try {
        return localStorage.getItem(NETLOG_STORAGE_KEY) === '1';
    } catch {
        return false;   // blocked storage is the same as never having asked
    }
}

/** A URL as it would be read: decoded, and relative to this site where it is on it */
function netlogUrl(url) {
    let text = String(url && url.url ? url.url : url);
    const origin = typeof location !== 'undefined' && location.origin;
    if (origin && text.startsWith(origin + '/')) text = text.slice(origin.length + 1);
    try {
        return decodeURI(text);
    } catch {
        return text;
    }
}

function netlogBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '?';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Keeps one entry and writes its line */
function netlogRecord(entry) {
    netlogEntries.push(entry);
    if (netlogEntries.length > NETLOG_MAX_ENTRIES) netlogEntries.shift();

    const status = entry.status === undefined ? '' : ` ${entry.status}`;
    const line = `[net] ${entry.kind}${status} ${entry.method || ''} ${entry.url} ` +
        `${netlogBytes(entry.bytes)} ${Math.round(entry.ms)} ms${entry.note ? ' — ' + entry.note : ''}`;

    if (entry.failed) console.warn(line.replace(/\s+/g, ' '));
    else console.info(line.replace(/\s+/g, ' '));
}

/**
 * What an app request is for, read off its readable path. A HEAD is always the
 * availability probe, whatever it asks about. Anything unrecognised stays
 * plain "fetch" rather than being guessed at.
 */
function netlogKind(url, method) {
    const path = String(url).replace(/^\//, '');
    if (method === 'HEAD') return 'probe';
    if (/-Bformat\.wav$/i.test(path)) return 'bformat';
    if (/^IR\//.test(path)) return 'ir';
    if (/^Source Files\//.test(path)) return 'source';
    if (/^api\//.test(path)) return 'api';
    return 'fetch';
}

/** The Resource Timing entry the browser kept for a fetch, if it kept one */
function netlogTiming(input) {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByName !== 'function') return null;
    try {
        const raw = String(input && input.url ? input.url : input);
        const base = typeof location !== 'undefined' ? (location.href || location.origin + '/') : undefined;
        const entries = performance.getEntriesByName(new URL(raw, base).href)
            .filter(e => e.initiatorType === 'fetch');
        return entries.length ? entries[entries.length - 1] : null;
    } catch {
        return null;   // an address URL() cannot read is one the browser did not time either
    }
}

/** A body's size once read: the bytes of a buffer or blob, the length of text */
function netlogBodyBytes(body) {
    if (body && Number.isFinite(body.byteLength)) return body.byteLength;
    if (body && Number.isFinite(body.size)) return body.size;
    if (typeof body === 'string') return body.length;
    return NaN;
}

/** The ways a caller can read a response's body */
const NETLOG_BODY_READERS = ['arrayBuffer', 'blob', 'json', 'text'];

/**
 * Wraps fetch() so each call is logged once, with the response and any error
 * going back to the caller untouched; the log only watches.
 *
 * A download is logged when its body has been read, not when fetch() resolves.
 * fetch() resolves on the response's headers, and the file itself is still on
 * its way: timed then, a 2.7 MB B-format reads as however long the server took
 * to answer. So the readers on the response are wrapped, and the line is
 * written when the first of them finishes, carrying the full time and the time
 * to first response beside it.
 *
 * Logged at once instead where there is no body to wait for: a HEAD, a failed
 * status the caller throws on without reading, or a response with no readers.
 * Every call site in the app reads the body of a successful GET, so none goes
 * unlogged.
 */
function wrapFetchForLog(realFetch) {
    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now() : Date.now());

    return async function loggedFetch(input, init) {
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const url = netlogUrl(input);
        const kind = netlogKind(url, method);
        const started = now();

        let response;
        try {
            response = await realFetch(input, init);
        } catch (err) {
            netlogRecord({
                kind, method, url, status: 'failed',
                bytes: NaN, ms: now() - started,
                failed: true, note: (err && err.message) || String(err),
            });
            throw err;
        }

        const firstResponse = now() - started;
        // A missing header is unknown, not empty: Number(null) is 0
        const header = response.headers && typeof response.headers.get === 'function'
            ? response.headers.get('Content-Length') : null;
        const length = header === null || header === '' ? NaN : Number(header);
        const entry = { kind, method, url, status: response.status, failed: !response.ok };

        // A HEAD reports the size of the file it asked about, none of which was
        // transferred; logged bare it would look like a download
        if (method === 'HEAD') {
            netlogRecord({
                ...entry, bytes: 0, ms: firstResponse,
                note: 'headers only' + (Number.isFinite(length) ? `, file is ${netlogBytes(length)}` : ''),
            });
            return response;
        }

        const readers = NETLOG_BODY_READERS.filter(name => typeof response[name] === 'function');
        if (!response.ok || !readers.length) {
            netlogRecord({ ...entry, bytes: length, ms: firstResponse, note: '' });
            return response;
        }

        let logged = false;
        const finish = (body, err) => {
            if (logged) return;
            logged = true;
            const notes = [`first response ${Math.round(firstResponse)} ms`];
            let bytes = Number.isFinite(length) ? length : netlogBodyBytes(body);

            const timing = netlogTiming(input);
            if (timing && timing.transferSize === 0 && timing.decodedBodySize > 0) {
                bytes = timing.decodedBodySize;   // the file's size, not the zero that crossed the wire
                notes.push('from cache');
            }
            if (err) notes.push('body failed: ' + ((err && err.message) || String(err)));

            netlogRecord({ ...entry, bytes, ms: now() - started, failed: Boolean(err), note: notes.join(', ') });
        };

        for (const name of readers) {
            const read = response[name];
            response[name] = (...args) => read.apply(response, args).then(
                body => { finish(body); return body; },
                err => { finish(undefined, err); throw err; });
        }
        return response;
    };
}

/**
 * Logs everything the page loads that did not come through fetch(): images,
 * tiles, scripts, stylesheets, fonts. fetch() is skipped here because the
 * wrapper already reports it, with more.
 *
 * transferSize is 0 for a file served from the browser's cache, which is worth
 * saying, since a cached panorama costs nothing.
 */
function observeResourcesForLog() {
    if (typeof PerformanceObserver !== 'function') return null;

    const report = (resource) => {
        if (resource.initiatorType === 'fetch') return;
        const cached = resource.transferSize === 0 && resource.decodedBodySize > 0;
        const status = resource.responseStatus || undefined;   // only some browsers report it
        netlogRecord({
            kind: resource.initiatorType || 'resource',
            url: netlogUrl(resource.name),
            status,
            bytes: cached ? resource.decodedBodySize : resource.transferSize,
            ms: resource.duration,
            failed: status >= 400,
            note: cached ? 'from cache' : '',
        });
    };

    try {
        const observer = new PerformanceObserver(list => list.getEntries().forEach(report));
        // buffered: the scripts and stylesheets that loaded before this ran
        observer.observe({ type: 'resource', buffered: true });
        return observer;
    } catch (err) {
        console.error(err);
        return null;
    }
}

/**
 * The session so far, totalled by kind: how many requests, how many failed,
 * and how much came over the wire.
 */
function netlogSummary() {
    const byKind = {};
    for (const entry of netlogEntries) {
        const row = byKind[entry.kind] ||= { requests: 0, failed: 0, bytes: 0, ms: 0 };
        row.requests++;
        if (entry.failed) row.failed++;
        if (Number.isFinite(entry.bytes)) row.bytes += entry.bytes;
        row.ms += entry.ms;
    }

    const table = {};
    for (const [kind, row] of Object.entries(byKind)) {
        table[kind] = {
            requests: row.requests,
            failed: row.failed,
            size: netlogBytes(row.bytes),
            'avg ms': Math.round(row.ms / row.requests),
        };
    }
    if (typeof console.table === 'function') console.table(table);
    return table;
}

/** Whether logging is running on this page */
let netlogActive = false;

function startNetworkLog() {
    if (netlogActive) return;
    netlogActive = true;

    if (typeof fetch === 'function') globalThis.fetch = wrapFetchForLog(fetch);
    observeResourcesForLog();
    console.info('[net] logging network requests. console.table(netlogEntries) for the list, ' +
        'netlogSummary() for totals, netlog(false) to stop remembering this.');
}

/**
 * Switches logging on or off from the console, remembered across visits.
 * Turning it on starts at once; turning it off takes effect on the next load,
 * since requests already wrapped cannot be unwrapped cleanly.
 */
function netlog(on = true) {
    try {
        if (on) localStorage.setItem(NETLOG_STORAGE_KEY, '1');
        else localStorage.removeItem(NETLOG_STORAGE_KEY);
    } catch {
        // Not remembered, but it can still run for this page
    }

    if (on) startNetworkLog();
    else console.info('[net] logging will be off from the next page load.');
    return on;
}

if (netlogRequested()) startNetworkLog();
