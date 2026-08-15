/**
 * Behaviour for the church dropdown and the source file picker
 * @author Ben Jordan, Kritan Duwal
 */

/**
 * Switches the selected church: swaps in that room's floorplan overlay, resets
 * the selection to its first receiver, and compiles it.
 *
 * The overlay, source and receiver element ids are all derived from the room
 * key, which is why adding a church needs no change here — only an entry in
 * ROOMS (Rooms.js) and matching markup in index.html.
 *
 * @param selectedRoom Room key from the dropdown, or the placeholder text
 */
function switchRoom(selectedRoom) {
    // Return the outgoing selection to its unselected colours before the
    // overlay it belongs to is hidden
    setButtonColor(rcvpos, "var(--buttoncolor1)");
    setButtonColor(srcpos, "var(--buttoncolor2)");

    room = selectedRoom;
    const config = ROOMS[room];

    Object.keys(ROOMS).forEach(id => {
        const ui = document.getElementById(id + "ui");
        if (ui) ui.style.display = (id === room) ? "flex" : "none";
    });

    const infoBtn = document.getElementById('church-info-btn');
    if (infoBtn) infoBtn.style.display = config ? 'flex' : 'none';

    // The dropdown's placeholder option clears the selection rather than naming a room
    if (!config) {
        srcpos = "";
        rcvpos = "";
        destroyView();
        return;
    }

    srcpos = "spS_" + room;
    rcvpos = "rpR1_" + room;

    // Clear the previous church's view while the new selection is checked
    destroyView();
    compile();
    verifyRoomDiagram(room + "ui");
}

// ── Source file picker ────────────────────────────────────────────────────

/**
 * Shown when no server-side listing is available, e.g. on the static deploy or
 * under `python3 -m http.server`, which cannot enumerate the directory.
 */
const BUNDLED_SOURCE_FILES = [
    { filename: 'Acoustic guitar.wav',          label: 'Acoustic Guitar' },
    { filename: 'Chorus_New.wav',               label: 'Chorus' },
    { filename: 'Clarinet.wav',                 label: 'Clarinet' },
    { filename: 'Sermon_Dr. William Barber.wav',label: 'Sermon – Dr. William Barber' },
    { filename: 'Trumpet.wav',                  label: 'Trumpet' },
];

const BUNDLED_LABEL_MAP = Object.fromEntries(
    BUNDLED_SOURCE_FILES.map(f => [f.filename, f.label])
);

/** Turns "Sermon_Dr. William Barber.wav" into "Sermon Dr. William Barber" */
function formatSourceName(filename) {
    return filename
        .replace(/\.[^/.]+$/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

async function selectSource() {
    try {
        const res = await fetch('/api/source-files');
        if (!res.ok) throw new Error('no server');
        showSourceModal(await res.json());
    } catch {
        showSourceModal(BUNDLED_SOURCE_FILES);
    }
}

/**
 * @param files Either bare filenames from the server listing, or the
 *              {filename, label} entries of BUNDLED_SOURCE_FILES
 */
function showSourceModal(files) {
    const list = document.getElementById('source-file-list');
    list.innerHTML = '';

    files.forEach(file => {
        const filename = typeof file === 'string' ? file : file.filename;
        const label    = typeof file === 'string'
            ? (BUNDLED_LABEL_MAP[file] || formatSourceName(file))
            : file.label;

        const btn = document.createElement('button');
        btn.className = 'source-file-item';
        btn.textContent = label;
        btn.onclick = () => loadSourceFromServer(filename, label);
        list.appendChild(btn);
    });

    document.getElementById('source-modal').classList.add('open');
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.remove('open');
}

async function loadSourceFromServer(filename, label) {
    closeSourceModal();
    if (isPlaying) await playpause();

    const url = '/Source Files/' + encodeURIComponent(filename);
    try {
        await setSourceFromUrl(url);
        // Only claim the new source once it has actually been decoded
        document.getElementById('srcselectlabel').textContent = label || formatSourceName(filename);
    } catch (err) {
        reportResourceFailure(err, "source file", url);
    }
}

/** Lets the visitor play any audio file on their own machine through the church */
function openNativeFilePicker() {
    closeSourceModal();

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wav,.mp3,audio/wav,audio/mpeg';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (isPlaying) await playpause();

        try {
            await setSourceFromBuffer(await file.arrayBuffer());
            document.getElementById('srcselectlabel').textContent = formatSourceName(file.name);
        } catch (err) {
            reportResourceFailure(err, "source file", file.name);
        }
    };
    input.click();
}
