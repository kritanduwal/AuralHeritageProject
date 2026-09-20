const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

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
 * Empty today. A flag added to FEATURE_NAMES wants its path here and a
 * matching redirect in netlify.toml.
 */
const FEATURE_PATHS = [];

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
