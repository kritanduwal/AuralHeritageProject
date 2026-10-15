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
 *   fetch()        the app's own requests — impulse responses, the B-format,
 *                  source files, the HEAD probe, /api/source-files. Logged with
 *                  status, size and time, and failures with the reason.
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
 * Wraps fetch() so each call is logged when it settles. The response and any
 * error go back to the caller untouched; the log only watches.
 */
function wrapFetchForLog(realFetch) {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    return async function loggedFetch(input, init) {
        const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const url = netlogUrl(input);
        const started = now();

        try {
            const response = await realFetch(input, init);
            const length = response.headers && typeof response.headers.get === 'function'
                ? Number(response.headers.get('Content-Length'))
                : NaN;
            netlogRecord({
                kind: 'fetch', method, url, status: response.status,
                bytes: length, ms: now() - started,
                failed: !response.ok,
            });
            return response;
        } catch (err) {
            netlogRecord({
                kind: 'fetch', method, url, status: 'failed',
                bytes: NaN, ms: now() - started,
                failed: true, note: (err && err.message) || String(err),
            });
            throw err;
        }
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
