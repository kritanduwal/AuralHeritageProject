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
    }

    // Update room and related settings    
    if (room === "BridgeCommunityChurch") {
        document.getElementById("BridgeCommunityChurchui").style.display = "flex";
        srcpos = "spS_BridgeCommunityChurch";
        srctype = "st1_BridgeCommunityChurch";
        rcvpos = "rpR1_BridgeCommunityChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "ChristChurchCathedral") {
        document.getElementById("ChristChurchCathedralui").style.display = "flex";
        srcpos = "spS_ChristChurchCathedral";
        srctype = "st1_ChristChurchCathedral";
        rcvpos = "rpR1_ChristChurchCathedral";
        setImage("Images/wp1909404.jpg");
    } else if (room === "DowntownPresbyterianChurch") {
        document.getElementById("DowntownPresbyterianChurchui").style.display = "flex";
        srcpos = "spS_DowntownPresbyterianChurch";
        srctype = "st1_DowntownPresbyterianChurch";
        rcvpos = "rpR1_DowntownPresbyterianChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "FirstBaptistChurchCapitolHill") {
        document.getElementById("FirstBaptistChurchCapitolHillui").style.display = "flex";
        srcpos = "spS_FirstBaptistChurchCapitolHill";
        srctype = "st1_FirstBaptistChurchCapitolHill";
        rcvpos = "rpR1_FirstBaptistChurchCapitolHill";
        setImage("Images/wp1909404.jpg");
    } else if (room === "HolyTrinityEpiscopalChurch") {
        document.getElementById("HolyTrinityEpiscopalChurchui").style.display = "flex";
        srcpos = "spS_HolyTrinityEpiscopalChurch";
        srctype = "st1_HolyTrinityEpiscopalChurch";
        rcvpos = "rpR1_HolyTrinityEpiscopalChurch";
        setImage("Images/wp1909404.jpg");
    } else if (room === "UnitedMethodistChurch") {
        document.getElementById("UnitedMethodistChurchui").style.display = "flex";
        srcpos = "spS_UnitedMethodistChurch";
        srctype = "st1_UnitedMethodistChurch";
        rcvpos = "rpR1_UnitedMethodistChurch";
        setImage("Images/wp1909404.jpg");
    }

    compile();

    const infoBtn = document.getElementById('church-info-btn');
    if (infoBtn) infoBtn.style.display = (selectedRoom !== 'Select a Church') ? 'flex' : 'none';
}

const BUNDLED_SOURCE_FILES = [
    'Acoustic guitar.wav',
    'Chorus_New.wav',
    'Clarinet.wav',
    'Sermon_Dr. William Barber.wav',
    'Trumpet.wav'
];

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

function showSourceModal(files) {
    const list = document.getElementById('source-file-list');
    list.innerHTML = '';
    files.forEach(file => {
        const btn = document.createElement('button');
        btn.className = 'source-file-item';
        btn.textContent = file;
        btn.onclick = () => loadSourceFromServer(file);
        list.appendChild(btn);
    });
    document.getElementById('source-modal').classList.add('open');
}

async function loadSourceFromServer(filename) {
    closeSourceModal();
    if (isPlaying) await playpause();
    document.getElementById('srcselectlabel').textContent = filename;
    const res = await fetch('/Source Files/' + encodeURIComponent(filename));
    const arrayBuffer = await res.arrayBuffer();
    ctx.decodeAudioData(arrayBuffer, data => sourceBuffer = data);
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
        document.getElementById('srcselectlabel').textContent = file.name;
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = ev => initSource(ev.target.result);
    };
    input.click();
}
