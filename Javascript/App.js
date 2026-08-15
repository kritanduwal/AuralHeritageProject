/**
 * Application state, panorama view, and UI logic
 *
 * Church reference text lives in ChurchData.js and per-room playback
 * configuration in Rooms.js; this file is the wiring between them and the page.
 *
 * @author Kritan Duwal
 */

// ── Page state ────────────────────────────────────────────────────────────
const DEFAULT_PANORAMA = "Images/default.jpg";

/** Horizontal field of view, in degrees, used for every receiver view */
const PANORAMA_HFOV = 120;

/** Fourth argument handed to pannellum's lookAt() when aiming the camera */
const LOOK_AT_ANIMATION = { duration: 1000 };

let room = "";      // key into ROOMS / churchData, "" until a church is chosen
let rcvpos = "";    // id of the selected receiver button, e.g. "rpR3_CaneRidgeMeetingHouse"
let srcpos = "";    // id of the source button, e.g. "spS_CaneRidgeMeetingHouse"
let viewer;         // the live pannellum viewer, replaced on every setImage()

destroyView();

/**
 * Replaces the panorama with a new pannellum viewer
 * @returns the new viewer, so callers can aim the one they created rather than
 *          whichever happens to be current by the time they get around to it
 */
function setImage(image) {
    // Tear down the previous viewer before building the next one. Stacked
    // viewers leak WebGL contexts until the browser drops the oldest, which
    // leaves the view black, and a panorama that fails to load would otherwise
    // just uncover the previous one instead of showing that anything is wrong.
    if (viewer) {
        try {
            viewer.destroy();
        } catch (err) {
            console.error(err);
        }
        viewer = undefined;
    }

    viewer = pannellum.viewer('panorama', {
        "type": "equirectangular",
        "panorama": image,
        "autoLoad": true,
        "showZoomCtrl": false,
        "showFullscreenCtrl": false,
        "mouseZoom": false,
        "compass": false
    });

    // pannellum reports load failures (and WebGL problems) through this event;
    // its own message box is hidden in CSS so the file name can be shown with it
    viewer.on('error', msg => {
        showResourceError(msg ? "error: " + msg : "error: panorama image could not be retrieved", image);

        // Drop back to the neutral backdrop so the view leaves the failed scene.
        // Deferred so the viewer is not destroyed while it dispatches, and
        // skipped for the backdrop itself so a missing default cannot loop.
        if (image !== DEFAULT_PANORAMA) {
            setTimeout(() => setImage(DEFAULT_PANORAMA), 0);
        }
    });

    return viewer;
}

function destroyView() {
    setImage(DEFAULT_PANORAMA);
}

/**
 * Points a viewer at a receiver's angles once it is ready to be aimed.
 * Bound to the specific viewer instance so a selection that is superseded
 * mid-load cannot swing the camera that replaced it.
 */
function aimViewer(view, pitch, yaw) {
    let aimed = false;
    const aim = () => {
        if (aimed || viewer !== view) return;
        aimed = true;
        view.lookAt(pitch, yaw, PANORAMA_HFOV, LOOK_AT_ANIMATION);
    };

    view.on('load', aim);
    setTimeout(aim, 100); // fallback in case the load event is missed
}

// ── Missing resource reporting ────────────────────────────────────────────
const DEFAULT_ERROR_MESSAGE = "error: source-receiver combination not found";

/**
 * Raised when a file could not be fetched, carrying the URL so the failing
 * resource can be named in the view instead of only in the console
 */
class MissingResourceError extends Error {
    constructor(url, status) {
        super(`${status} while retrieving ${url}`);
        this.name = 'MissingResourceError';
        this.url = url;
        this.status = status;
    }
}

/**
 * Decodes a URL for display, falling back to the raw value if it is malformed
 */
function readableUrl(url) {
    try {
        return decodeURI(url);
    } catch {
        return url;
    }
}

/**
 * Writes the error banner's contents without changing its visibility, so
 * callers stay in charge of when the banner is shown
 * @param message Short description of what went wrong
 * @param url     The resource that could not be retrieved, or "" for none
 */
function setResourceError(message, url) {
    document.getElementById("error-message").textContent = message;
    document.getElementById("error-resource").textContent = url ? readableUrl(url) : "";
}

/**
 * Fills in the error banner and shows it immediately
 */
function showResourceError(message, url) {
    setResourceError(message, url);
    document.getElementById("error").style.display = "flex";
}

/**
 * Restores the default error text and hides the banner
 */
function clearResourceError() {
    setResourceError(DEFAULT_ERROR_MESSAGE, "");
    document.getElementById("error").style.display = "none";
}

/**
 * Surfaces a failed file retrieval in the view, naming the resource
 * @param err  The caught error; a MissingResourceError carries the URL and status
 * @param what Human-readable name of the resource kind, e.g. "impulse response"
 * @param url  Fallback URL for errors that do not carry one
 */
function reportResourceFailure(err, what, url) {
    const failed = (err && err.url) || url;
    const reason = (err && err.status) ? `could not be retrieved (${err.status})` : "could not be loaded";
    showResourceError(`error: ${what} ${reason}`, failed);
    console.error(err);
}

/**
 * Confirms a church diagram can be retrieved. The diagrams are applied as CSS
 * background images, so a 404 leaves an empty panel with no event to catch.
 * The URL is read back from the computed style rather than duplicated here.
 * @param uiId Id of the room's button overlay element
 */
function verifyRoomDiagram(uiId) {
    const ui = document.getElementById(uiId);
    if (!ui) return;

    const match = /url\(["']?(.+?)["']?\)/.exec(getComputedStyle(ui).backgroundImage);
    if (!match) return;

    const url = match[1];
    const probe = new Image();
    probe.onerror = () => showResourceError(
        "error: church diagram could not be retrieved",
        url.replace(location.origin + "/", "")
    );
    probe.src = url;
}

// ── Source / receiver selection ───────────────────────────────────────────

/**
 * Recolors a source or receiver button, tolerating an id that is not on the
 * page yet (nothing is selected before a church is chosen)
 */
function setButtonColor(elementId, color) {
    const button = elementId && document.getElementById(elementId);
    if (button) button.style.backgroundColor = color;
}

function updateSrcpos(id) {
    setButtonColor(srcpos, "var(--buttoncolor2)");
    srcpos = id;
    compile();
}

function updateRcvpos(id) {
    setButtonColor(rcvpos, "var(--buttoncolor1)");
    rcvpos = id;
    compile();
}

/**
 * Marks the selected source and receiver green when their impulse response
 * exists and crimson when it does not
 */
function updateSelectedColor(available) {
    document.documentElement.style.setProperty('--maincolor2', available ? '#00f47f' : 'crimson');
    setButtonColor(srcpos, "var(--maincolor2)");
    setButtonColor(rcvpos, "var(--maincolor2)");
}

/**
 * Selections can be clicked faster than the availability probe resolves. Each
 * compile takes a ticket and abandons its results if a newer one has started,
 * so a slow response cannot overwrite a later selection's view.
 */
let compileSequence = 0;

/**
 * Applies the current room/receiver selection: points the audio engine at the
 * matching impulse response, aims the panorama, and reflects availability in
 * the play button, the button colours, and the error banner.
 *
 * This replaced twelve near-identical compileSelection<Church>() functions;
 * everything that differed between them now lives in ROOMS (Rooms.js).
 */
async function compile() {
    const config = ROOMS[room];
    const receiverId = receiverIdOf(rcvpos);
    const receiver = config && config.receivers[receiverId];
    if (!receiver) return;

    setImpulseResponse(impulseResponseBase(config, receiverId), receiver.gainDb || 0);

    const ticket = ++compileSequence;
    const available = await impulseResponseExists(currentIr.base);
    if (ticket !== compileSequence) return;

    document.getElementById("play").disabled = !available;
    updateSelectedColor(available);

    if (!available) {
        // impulseResponseExists() has already primed the banner with the
        // missing file; showing it is this function's call to make
        destroyView();
        document.getElementById("error").style.display = "flex";
        if (isPlaying) await playpause();
        return;
    }

    clearResourceError();
    aimViewer(setImage(panoramaPath(config, receiverId)), receiver.pitch || 0, receiver.yaw || 0);

    if (isPlaying) {
        await playpause(); // stop
        await playpause(); // restart through the newly selected impulse response
    }
}

// ── Reverberation slider ──────────────────────────────────────────────────

/**
 * Paints the filled portion of the slider track up to the current value
 */
function updateSliderBackground(percent) {
    document.getElementById('convmix').style.background =
        `linear-gradient(to right, #00205b 0%, #00205b ${percent}%, #d0d0d0 ${percent}%, #d0d0d0 100%)`;
}

/**
 * @param percent Slider position, 0 (source only) to 100 (full room)
 */
function setMix(percent) {
    document.getElementById("mixlabel").innerText = `${percent}%`;
    setConvolutionMix(percent / 100);
    updateSliderBackground(percent);
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId + '-panel').classList.add('active');
    btnEl.classList.add('active');
}

// ── Church Info Modal ─────────────────────────────────────────────────────

/**
 * Heads the modal with the church's cover photo, or leaves it out entirely.
 *
 */
function setChurchInfoCover(data) {
    const cover = document.getElementById('church-info-cover');
    if (!cover) return;

    if (!data.cover) {
        cover.style.display = 'none';
        cover.removeAttribute('src');
        return;
    }

    cover.src = data.cover;
    cover.alt = data.name;
    cover.style.display = 'block';
}

function showChurchInfo() {
    const data = churchData[room];
    if (!data) return;

    document.getElementById('church-info-name').textContent = data.name;
    document.getElementById('church-info-address').textContent = data.address;
    document.getElementById('church-info-date').textContent = 'Measured: ' + data.measured;

    setChurchInfoCover(data);

    document.getElementById('church-info-history').innerHTML =
        data.history.map(p => `<p>${p}</p>`).join('');

    document.getElementById('church-info-dimensions').innerHTML =
        Object.entries(data.dimensions)
            .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
            .join('');

    document.getElementById('church-info-receivers').innerHTML =
        Object.entries(data.receivers)
            .map(([k, v]) => `<tr><td>${k} to Speakers</td><td>${v}</td></tr>`)
            .join('');

    document.getElementById('church-info-modal').classList.add('open');
}

function closeChurchInfo() {
    document.getElementById('church-info-modal').classList.remove('open');
}

// ── Fullscreen ────────────────────────────────────────────────────────────

/**
 * Toggles fullscreen on #view rather than on the panorama alone, so the church
 * buttons, error banner, and play control come along
 */
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.getElementById('view').requestFullscreen();
    }
}

// Keep the church info modal inside whichever element owns fullscreen so it stays visible
document.addEventListener('fullscreenchange', () => {
    const modal = document.getElementById('church-info-modal');
    if (document.fullscreenElement) {
        document.fullscreenElement.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }

    // Same class pannellum toggles on its own control to swap the sprite
    document.getElementById('fullscreen-btn').classList
        .toggle('pnlm-fullscreen-toggle-button-active', !!document.fullscreenElement);
});

// ── Startup ───────────────────────────────────────────────────────────────

/**
 * Called from <body onload>. Loads the default source file and syncs the
 * reverberation controls to whatever value the slider starts on.
 */
function initApp() {
    loadSource();
    setMix(document.getElementById('convmix').value);
}
