/**
 * Behavor for the settings menu
 * @author Ben Jordan, Kritan Duwal
 */

/**
 * Onclick function to switch the room from the settings menu
 * @param selectedRoom The room selected from dropdown
 */
function switchRoom(selectedRoom) {

    room = selectedRoom;

    if(rcvpos !== "")
        document.getElementById(rcvpos).style.backgroundColor = "var(--buttoncolor1)";

    // Hide all room UIs first
    if(selectedRoom !== "Select a Church"){
        document.getElementById("BridgeCommunityChurchui").style.display = "none";
        document.getElementById("ChristChurchCathedralui").style.display = "none";
        document.getElementById("DowntownPresbyterianChurchui").style.display = "none";
        document.getElementById("FirstBaptistChurchCapitolHillui").style.display = "none";
        document.getElementById("HolyTrinityEpiscopalChurchui").style.display = "none";
        document.getElementById("UnitedMethodistChurchui").style.display = "none";
        document.getElementById("CaneRidgeMeetingHouseui").style.display = "none";
        document.getElementById("FirstPresbyterianChurchKYui").style.display = "none";
        document.getElementById("BasilicaStFrancisui").style.display = "none";
        document.getElementById("MonasteryImmaculateConceptionui").style.display = "none";
        document.getElementById("OurLadyOfGuadalupeui").style.display = "none";
        document.getElementById("StAugustineIsletaui").style.display = "none";
    }

    // Update room and related settings    
    if (room === "BridgeCommunityChurch") {
        document.getElementById("BridgeCommunityChurchui").style.display = "flex";
        srcpos = "spS_BridgeCommunityChurch";
        srctype = "st1_BridgeCommunityChurch";
        rcvpos = "rpR1_BridgeCommunityChurch";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "ChristChurchCathedral") {
        document.getElementById("ChristChurchCathedralui").style.display = "flex";
        srcpos = "spS_ChristChurchCathedral";
        srctype = "st1_ChristChurchCathedral";
        rcvpos = "rpR1_ChristChurchCathedral";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "DowntownPresbyterianChurch") {
        document.getElementById("DowntownPresbyterianChurchui").style.display = "flex";
        srcpos = "spS_DowntownPresbyterianChurch";
        srctype = "st1_DowntownPresbyterianChurch";
        rcvpos = "rpR1_DowntownPresbyterianChurch";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "FirstBaptistChurchCapitolHill") {
        document.getElementById("FirstBaptistChurchCapitolHillui").style.display = "flex";
        srcpos = "spS_FirstBaptistChurchCapitolHill";
        srctype = "st1_FirstBaptistChurchCapitolHill";
        rcvpos = "rpR1_FirstBaptistChurchCapitolHill";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "HolyTrinityEpiscopalChurch") {
        document.getElementById("HolyTrinityEpiscopalChurchui").style.display = "flex";
        srcpos = "spS_HolyTrinityEpiscopalChurch";
        srctype = "st1_HolyTrinityEpiscopalChurch";
        rcvpos = "rpR1_HolyTrinityEpiscopalChurch";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "UnitedMethodistChurch") {
        document.getElementById("UnitedMethodistChurchui").style.display = "flex";
        srcpos = "spS_UnitedMethodistChurch";
        srctype = "st1_UnitedMethodistChurch";
        rcvpos = "rpR1_UnitedMethodistChurch";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "CaneRidgeMeetingHouse") {
        document.getElementById("CaneRidgeMeetingHouseui").style.display = "flex";
        srcpos = "spS_CaneRidgeMeetingHouse";
        srctype = "st1_CaneRidgeMeetingHouse";
        rcvpos = "rpR1_CaneRidgeMeetingHouse";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "FirstPresbyterianChurchKY") {
        document.getElementById("FirstPresbyterianChurchKYui").style.display = "flex";
        srcpos = "spS_FirstPresbyterianChurchKY";
        srctype = "st1_FirstPresbyterianChurchKY";
        rcvpos = "rpR1_FirstPresbyterianChurchKY";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "BasilicaStFrancis") {
        document.getElementById("BasilicaStFrancisui").style.display = "flex";
        srcpos = "spS_BasilicaStFrancis";
        srctype = "st1_BasilicaStFrancis";
        rcvpos = "rpR1_BasilicaStFrancis";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "MonasteryImmaculateConception") {
        document.getElementById("MonasteryImmaculateConceptionui").style.display = "flex";
        srcpos = "spS_MonasteryImmaculateConception";
        srctype = "st1_MonasteryImmaculateConception";
        rcvpos = "rpR1_MonasteryImmaculateConception";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "OurLadyOfGuadalupe") {
        document.getElementById("OurLadyOfGuadalupeui").style.display = "flex";
        srcpos = "spS_OurLadyOfGuadalupe";
        srctype = "st1_OurLadyOfGuadalupe";
        rcvpos = "rpR1_OurLadyOfGuadalupe";
        setImage(DEFAULT_PANORAMA);
    } else if (room === "StAugustineIsleta") {
        document.getElementById("StAugustineIsletaui").style.display = "flex";
        srcpos = "spS_StAugustineIsleta";
        srctype = "st1_StAugustineIsleta";
        rcvpos = "rpR1_StAugustineIsleta";
        setImage(DEFAULT_PANORAMA);
    }

    compile();
    verifyRoomDiagram(room + "ui");

    const infoBtn = document.getElementById('church-info-btn');
    if (infoBtn) infoBtn.style.display = (selectedRoom !== 'Select a Church') ? 'flex' : 'none';
}

const BUNDLED_SOURCE_FILES = [
    { filename: 'Acoustic guitar.wav',          label: 'Acoustic Guitar' },
    { filename: 'Chorus_New.wav',               label: 'Chorus' },
    { filename: 'Clarinet.wav',                 label: 'Clarinet' },
    { filename: 'Sermon_Dr. William Barber.wav',label: 'Sermon – Dr. William Barber' },
    { filename: 'Trumpet.wav',                  label: 'Trumpet' },
];

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
        const files = await res.json();
        showSourceModal(files);
    } catch {
        showSourceModal(BUNDLED_SOURCE_FILES);
    }
}

const BUNDLED_LABEL_MAP = Object.fromEntries(
    BUNDLED_SOURCE_FILES.map(f => [f.filename, f.label])
);

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

async function loadSourceFromServer(filename, label) {
    closeSourceModal();
    if (isPlaying) await playpause();

    const url = '/Source Files/' + encodeURIComponent(filename);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new MissingResourceError(url, res.status);
        const arrayBuffer = await res.arrayBuffer();
        ctx.decodeAudioData(arrayBuffer, data => sourceBuffer = data);
        // Only claim the new source once it has actually been retrieved
        document.getElementById('srcselectlabel').textContent = label || formatSourceName(filename);
    } catch (err) {
        reportResourceFailure(err, "source file", url);
    }
}

function closeSourceModal() {
    document.getElementById('source-modal').classList.remove('open');
}

function openNativeFilePicker() {
    closeSourceModal();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wav,.mp3,audio/wav,audio/mpeg';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        if (isPlaying) playpause();
        document.getElementById('srcselectlabel').textContent = formatSourceName(file.name);
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = ev => initSource(ev.target.result);
    };
    input.click();
}
