const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

/**
 * The page has one address per state, and index.html is not part of any of
 * them. Spelling the file out still works — it is a static directory — but it
 * is a dead end the moment a feature is appended to it: /index.html/ambisonic
 * is a path no file lives at. Both spellings are folded back onto the clean
 * URL so the address bar shows what can actually be shared, and so appending
 * a feature to whatever is on screen lands somewhere real.
 */
app.get(/^\/index\.html(\/.*)?$/, (req, res) => {
    res.redirect(301, req.params[0] || '/');
});

app.use(express.static(path.join(__dirname)));

/**
 * Feature-gated entry points. Each serves the same page; Features.js reads the
 * path and decides which optional renders are reachable. Listed explicitly
 * rather than matched by pattern so that an unknown path still 404s.
 */
const FEATURE_PATHS = ['/binaural', '/ambisonic'];

app.get(FEATURE_PATHS, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/source-files', (req, res) => {
    const dir = path.join(__dirname, 'Source Files');
    const files = fs.readdirSync(dir).filter(f => /\.(wav|mp3)$/i.test(f));
    res.json(files);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
