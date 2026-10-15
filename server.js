const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

/**
 * One line per request, written when the response finishes:
 *
 *   14:02:31.118  GET 200  IR/Cane Ridge Meeting House, KY/…/Cane Ridge KY_R1-1.wav  1.4 MB  38 ms
 *
 * Registered first so it sees everything, the redirects and the static files
 * included. A request the browser gives up on before it is answered — a
 * superseded impulse response, a panorama replaced mid-load — is logged as
 * "aborted" rather than left out. Set LOG_REQUESTS=0 to silence it.
 */
const LOG_REQUESTS = process.env.LOG_REQUESTS !== '0';

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readablePath(url) {
    try {
        return decodeURIComponent(url);
    } catch {
        return url;
    }
}

if (LOG_REQUESTS) {
    app.use((req, res, next) => {
        const started = process.hrtime.bigint();
        let logged = false;

        const log = (status) => {
            if (logged) return;
            logged = true;
            const ms = Number(process.hrtime.bigint() - started) / 1e6;
            const time = new Date().toISOString().slice(11, 23);
            const size = formatBytes(Number(res.getHeader('Content-Length')));
            const range = req.headers.range ? `  range ${req.headers.range}` : '';
            const flag = typeof status === 'number' && status >= 400 ? '  <-- ' + (status >= 500 ? 'error' : 'not found') : '';
            console.log(`${time}  ${req.method} ${status}  ${readablePath(req.originalUrl)}  ${size}  ${ms.toFixed(0)} ms${range}${flag}`);
        };

        res.on('finish', () => log(res.statusCode));
        res.on('close', () => log('aborted'));
        next();
    });
}

/**
 * The page has one address per state, and index.html is not part of any of
 * them. Spelling the file out still works — it is a static directory — but it
 * is a dead end the moment a feature is appended to it: /index.html/<flag>
 * is a path no file lives at. Both spellings are folded back onto the clean
 * URL so the address bar shows what can actually be shared, and so appending
 * a feature to whatever is on screen lands somewhere real.
 */
app.get(/^\/index\.html(\/.*)?$/, (req, res) => {
    res.redirect(301, req.params[0] || '/');
});

app.use(express.static(path.join(__dirname)));

/**
 * Feature-gated entry points, each serving the same page for Features.js to
 * read the path of. Listed explicitly rather than matched by pattern so an
 * unknown path still 404s — hence registering nothing when the list is empty.
 *
 * A flag added to FEATURE_NAMES wants its path here and a matching redirect
 * in netlify.toml.
 */
const FEATURE_PATHS = ['/5'];

if (FEATURE_PATHS.length) {
    app.get(FEATURE_PATHS, (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

app.get('/api/source-files', (req, res) => {
    const dir = path.join(__dirname, 'Source Files');
    const files = fs.readdirSync(dir).filter(f => /\.(wav|mp3)$/i.test(f));
    res.json(files);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
