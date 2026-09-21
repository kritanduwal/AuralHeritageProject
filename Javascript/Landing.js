/**
 * The landing map: where the collection is, and the way into one church.
 *
 * The page opens on a map of the United States carrying a pin for every church
 * in the repository. Choosing one — from the map or from the list beside it —
 * closes the landing, selects that church, and leaves the visitor in the View
 * tab with everything else as it was. Nothing here reaches playback: it ends at
 * switchRoom(), the same door the dropdown has always used.
 *
 * The list beside the map is not a fallback for it. Five of the twelve churches
 * are in Nashville within a mile of each other, so at the zoom that shows the
 * whole country they are one pin however the map is drawn. The map answers
 * "where is this collection"; the list answers "which one of these". The pins
 * close that gap from their side too — see CITY_SPLIT_ZOOM.
 *
 * Which churches are offered comes from ROOMS, not from churchData: ROOMS is
 * what the rest of the app can actually play, and a pin that led somewhere
 * unplayable would be worse than no pin. Their names, addresses and coordinates
 * come from churchData.
 *
 * @author Kritan Duwal
 */

// ── The map ───────────────────────────────────────────────────────────────

/**
 * The opening view: the contiguous United States, which is where every church
 * is. Given as bounds rather than a centre and a zoom, and fitted to whatever
 * pane the window turns out to give the map — one zoom that framed the country
 * on a laptop showed a few states of the middle of it on a phone.
 */
const LANDING_BOUNDS = [[24.5, -125.0], [49.4, -66.9]];

/**
 * Where the map is put before it is fitted, and where it stays if the pane is
 * too small to frame the country at all. Never seen on a window that can fit
 * LANDING_BOUNDS, which is every window the page is usable on.
 */
const LANDING_VIEW = { lat: 38.5, lon: -96, zoom: 4 };

/**
 * Far enough out to fit the country into a phone-width pane, and no further.
 * A floor above that would stop the fit short and crop the coasts.
 */
const LANDING_MIN_ZOOM = 2;

/**
 * Zoom at which a city's single pin gives way to its churches' own.
 *
 * Below it, a city holding more than one church shows one counted pin, because
 * its churches are the same handful of pixels; above it they are far enough
 * apart to be aimed at individually. 11 is roughly where the five Nashville
 * churches stop touching.
 */
const CITY_SPLIT_ZOOM = 11;

/**
 * Breathing room, in pixels, between a city's outermost churches and the edge
 * of the map when a counted pin is opened onto them. A pin sitting exactly on
 * the boundary is half off the map.
 */
const CITY_FIT_PADDING = 60;

/**
 * OpenStreetMap's own tiles, which need no account and no key. Their usage
 * policy asks for the attribution below, which Leaflet prints into the corner
 * of the map, and for traffic at roughly this scale — one map, loaded once a
 * visit, at the zoom of a country.
 *
 * The prettier grey basemaps all now want an API key: CARTO's stamps
 * "API KEY REQUIRED" across every tile, and Stamen's have moved to Stadia. A
 * key would have to be kept somewhere, and this page has nowhere to keep one.
 */
const LANDING_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const LANDING_TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/**
 * Full names for the states the collection reaches, for the headings in the
 * list. A church in a state that is not here falls back to its two-letter code,
 * which is legible but out of place among the others — landing.test.js fails
 * instead, so adding a church in a new state is a line here rather than a
 * heading nobody notices is wrong.
 */
const STATE_NAMES = {
    IN: "Indiana",
    KY: "Kentucky",
    NM: "New Mexico",
    TN: "Tennessee",
};

/** The live Leaflet map, or null before initLanding() and where Leaflet is absent */
let landingMap = null;

/**
 * The three sets of pins, as CITY_SPLIT_ZOOM divides them:
 *   solo    churches alone in their city — always on the map
 *   group   one counted pin per city holding several — shown zoomed out
 *   member  the churches inside those cities — shown zoomed in
 */
let landingLayers = null;

/**
 * Church key to its own pin, so the church being entered can be lit up whether
 * it was picked from the map or from the list. City pins are not in here: they
 * stand for several churches and none of them is the one chosen.
 */
let landingPins = null;

// ── Reading the collection ────────────────────────────────────────────────

/**
 * Pulls the city and state out of a church address.
 *
 * Every address in ChurchData.js ends "…, City, ST ZIP", so the two are already
 * recorded and storing them again would only let the copies disagree. Returns
 * null for an address that does not carry them, which groups that church under
 * its own name rather than dropping it.
 */
function placeOf(address) {
    const match = /,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/.exec(address || "");
    return match ? { city: match[1].trim(), state: match[2] } : null;
}

/**
 * Every church the landing offers, in the order ROOMS lists them, carrying the
 * reference data the map and the list both read.
 */
function landingChurches() {
    return Object.keys(ROOMS).map(key => {
        const data = churchData[key] || {};
        return {
            key,
            name: data.name || key,
            address: data.address || "",
            measured: data.measured || "",
            coords: data.coords || null,
            place: placeOf(data.address),
        };
    });
}

/** The label a church is filed under on the map, e.g. "Nashville, TN" */
function cityLabelOf(church) {
    return church.place ? `${church.place.city}, ${church.place.state}` : church.name;
}

/**
 * The churches grouped by the city they stand in, in first-appearance order,
 * each with the centre point its pin sits on.
 *
 * Churches with no coordinates are left out: they have nowhere to be drawn.
 * They still reach the list, which is keyed on nothing but the room id.
 */
function landingCities(churches) {
    const cities = new Map();

    for (const church of churches) {
        if (!church.coords) continue;
        const label = cityLabelOf(church);
        if (!cities.has(label)) cities.set(label, { label, churches: [] });
        cities.get(label).churches.push(church);
    }

    for (const city of cities.values()) {
        // The mean of its churches rather than the city's own centre, so a
        // counted pin sits on the cluster it stands for
        city.lat = city.churches.reduce((sum, c) => sum + c.coords.lat, 0) / city.churches.length;
        city.lon = city.churches.reduce((sum, c) => sum + c.coords.lon, 0) / city.churches.length;
    }

    return Array.from(cities.values());
}

/**
 * The churches grouped by state, in first-appearance order, for the list
 */
function landingStates(churches) {
    const states = new Map();

    for (const church of churches) {
        const code = church.place ? church.place.state : "";
        if (!states.has(code)) states.set(code, { code, name: STATE_NAMES[code] || code, churches: [] });
        states.get(code).churches.push(church);
    }

    return Array.from(states.values());
}

// ── Entering a church ─────────────────────────────────────────────────────

/**
 * Closes the landing onto one church: the View tab, that church selected, and
 * every control behind it exactly as it would have been had the dropdown been
 * used. The dropdown is set as well as the room, or the control bar would go on
 * reading "Select a Church" over a church that is loaded.
 *
 * The church is put on before the landing comes off, which is the opposite of
 * how it reads. The panorama has to be fetched and the impulse response probed,
 * and both of those happen against elements that are already laid out at full
 * size behind the overlay — so the exit animation is spent on a wait that was
 * happening anyway rather than added in front of it.
 */
function enterChurch(key) {
    switchTab('main');

    const dropdown = document.getElementById('roomDropdown');
    if (dropdown) dropdown.value = key;

    switchRoom(key);
    diveIntoChurch(key);
}

// ── Opening and closing ───────────────────────────────────────────────────

function openLanding() {
    const landing = document.getElementById('landing');
    if (!landing) return;

    // An exit still in flight would otherwise hide the landing again a moment
    // after it was asked for. Its dive is still running and was never closed
    // down by closeLanding(), so the view wants putting back here too.
    cancelLandingExit();
    restoreLandingView();

    const reopening = !landing.classList.contains('open');
    landing.classList.add('open');
    clearChosenPins();

    // Leaflet measures its container once and caches it. A map built or resized
    // while the landing was hidden has no size to have measured, and comes back
    // as a single tile in the corner until it is told to look again.
    if (landingMap) landingMap.invalidateSize();

    // Only on the way back. The landing is on screen from the first paint, and
    // fading it in there would mean fading the app out from under it.
    if (reopening) playLandingEntrance(landing);
}

/**
 * Takes the landing off the screen at once, with no animation.
 *
 * The end of every other exit as well as an exit in its own right: the animated
 * ones run their course and then call this.
 */
function closeLanding() {
    cancelLandingExit();

    // Put the map back the moment it stops being looked at, rather than when it
    // is next looked at. Nothing is on screen to see the snap, and the tiles for
    // the view being returned to are requested now instead of on the way back —
    // reopening onto a blank grey pane is what happens otherwise, because the
    // dive ends somewhere no tile has ever been fetched for.
    restoreLandingView();

    const landing = document.getElementById('landing');
    if (!landing) return;

    landing.classList.remove('open');
    landing.classList.remove('landing--leaving');
    landing.classList.remove('landing--entering');
}

/**
 * Leaving the landing without choosing is a real answer — it lands on the same
 * empty selection the page has always started in, with the dropdown free.
 *
 * Fades rather than dives: a dive is a movement towards the church that was
 * picked, and nothing was picked here.
 */
function dismissLanding() {
    if (!startLandingExit()) closeLanding();
}

// Escape closes the landing, the way it closes the dialogs it sits above.
// Registered once, at load, like the fullscreen handler in App.js.
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const landing = document.getElementById('landing');
    if (landing && landing.classList.contains('open')) dismissLanding();
});

// ── Getting out of the way ────────────────────────────────────────────────

/**
 * How long the landing takes to leave, in milliseconds. Spelled here and in the
 * transition on #landing.landing--leaving; landing.test.js checks the two agree,
 * because a stylesheet that outlasts this timer is cut off mid-fade and one that
 * finishes early leaves an invisible sheet over the page until it fires.
 */
const LANDING_EXIT_MS = 600;

/** How far the map dives towards a church, in zoom levels, and where it stops */
const LANDING_DIVE_STEP = 5;
const LANDING_DIVE_MAX_ZOOM = 16;

/** The pending end-of-exit callback, so an exit can be called off partway */
let landingExitTimer = null;

/**
 * Where the map was before it dived into a church.
 *
 * Reopening restores it rather than the country: a visitor who zoomed into a
 * city, picked a church there and came back for another expects the city they
 * left, and the dive is the app's movement rather than theirs.
 */
let landingViewBeforeDive = null;

/**
 * Whether this visitor has asked for less movement. The landing then cuts
 * instead of fading — every exit still ends in the same place.
 */
function landingReducedMotion() {
    return typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Starts the landing fading out of the way.
 * @returns false where there is nothing to animate, so the caller can cut
 */
function startLandingExit() {
    const landing = document.getElementById('landing');
    if (!landing || !landing.classList.contains('open')) return false;
    if (landingReducedMotion()) return false;

    cancelLandingExit();
    landing.classList.add('landing--leaving');

    // A timer rather than transitionend: the event does not arrive if the
    // transition is interrupted or never runs, and an overlay that is stuck at
    // opacity 0 over the page is invisible and still there.
    landingExitTimer = setTimeout(closeLanding, LANDING_EXIT_MS);
    return true;
}

function cancelLandingExit() {
    if (landingExitTimer === null) return;
    clearTimeout(landingExitTimer);
    landingExitTimer = null;

    const landing = document.getElementById('landing');
    if (landing) landing.classList.remove('landing--leaving');
}

/**
 * Leaves the landing by moving towards the church that was chosen: the map
 * zooms at its pin while the sheet fades and swells past the viewer, which
 * together read as going in rather than as the map being taken away.
 *
 * The map keeps flying inside a sheet that is already transparent for the last
 * of it, which is deliberate — it is what stops the zoom ending in a snap.
 */
function diveIntoChurch(key) {
    if (!startLandingExit()) {
        closeLanding();
        return;
    }

    markChosenPin(key);

    const coords = (churchData[key] || {}).coords;
    if (!landingMap || !coords) return;

    landingViewBeforeDive = { center: landingMap.getCenter(), zoom: landingMap.getZoom() };

    landingMap.flyTo(
        [coords.lat, coords.lon],
        Math.min(landingMap.getZoom() + LANDING_DIVE_STEP, LANDING_DIVE_MAX_ZOOM),
        { duration: LANDING_EXIT_MS / 1000 });
}

/**
 * Puts the map back where the dive took it from, and stops the dive if it is
 * still running in a container nobody can see.
 */
function restoreLandingView() {
    if (!landingMap || !landingViewBeforeDive) return;

    landingMap.stop();
    landingMap.setView(landingViewBeforeDive.center, landingViewBeforeDive.zoom, { animate: false });
    landingViewBeforeDive = null;
}

/**
 * Lights up the pin of the church being entered, so the dive is anchored to the
 * one that was picked rather than to a point on the map.
 *
 * Does nothing where that church has no pin on the map at this zoom — choosing
 * one of the five Nashville churches from the list while the country is in view
 * is a choice the map cannot show.
 */
function markChosenPin(key) {
    const marker = landingPins && landingPins.get(key);
    const element = marker && marker.getElement && marker.getElement();
    if (element) element.classList.add('landing-pin-chosen');
}

/**
 * Clears the highlight, so a reopened map is not still lit from last time.
 *
 * Tooltips go with it. A pin clicked with the pointer on it is hidden before
 * the pointer ever leaves, so Leaflet never gets the mouseout that would close
 * its label — and the map reopens with the last church still named on it.
 */
function clearChosenPins() {
    if (!landingPins) return;

    for (const marker of landingPins.values()) {
        const element = marker.getElement && marker.getElement();
        if (element) element.classList.remove('landing-pin-chosen');
        if (marker.closeTooltip) marker.closeTooltip();
    }
}

/**
 * Fades the landing back in over the church it was last closed onto.
 *
 * Restarting a CSS animation needs the class off, a reflow, and the class on
 * again; without the reflow the browser never sees it having been removed and
 * the second open does not animate at all.
 */
function playLandingEntrance(landing) {
    if (landingReducedMotion()) return;

    landing.classList.remove('landing--entering');
    void landing.offsetWidth;
    landing.classList.add('landing--entering');
}

// ── The list ──────────────────────────────────────────────────────────────

/**
 * Builds the church list beside the map, grouped under state headings.
 *
 * Text is interpolated from ChurchData.js, the same way the Church Info modal
 * builds its tables — this is our own reference data, not anything a visitor
 * can put there.
 */
function buildLandingList(churches) {
    const list = document.getElementById('landing-list');
    if (!list) return;

    list.innerHTML = '';

    for (const state of landingStates(churches)) {
        const heading = document.createElement('h3');
        heading.className = 'landing-group';
        heading.textContent = state.name;
        list.appendChild(heading);

        for (const church of state.churches) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'landing-item';
            item.innerHTML =
                `<span class="landing-item-name">${church.name}</span>` +
                `<span class="landing-item-place">${cityLabelOf(church)}</span>`;
            item.onclick = () => enterChurch(church.key);
            list.appendChild(item);
        }
    }
}

/** Heads the list with what is in the collection, counted rather than stated */
function setLandingCount(churches) {
    const count = document.getElementById('landing-count');
    if (!count) return;

    const states = landingStates(churches).length;
    count.textContent = `${churches.length} churches in ${states} states`;
}

// ── The pins ──────────────────────────────────────────────────────────────

/**
 * A pin, as a Leaflet divIcon. Circles rather than teardrops: the only thing a
 * pin has to do on a map this small is be visible against the basemap and be
 * clickable, and a counted circle can say how many churches it stands for.
 *
 * @param count Churches behind this pin; the number is drawn where it is > 1
 */
function landingPinIcon(count) {
    const grouped = count > 1;
    const size = grouped ? 30 : 18;
    return L.divIcon({
        className: '',   // Leaflet's own default draws a white box behind ours
        html: `<span class="landing-pin${grouped ? ' landing-pin--group' : ''}">${grouped ? count : ''}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/** One church's pin: hover names it, click opens it */
function churchPin(church) {
    return L.marker([church.coords.lat, church.coords.lon], {
        icon: landingPinIcon(1),
        title: church.name,
        alt: church.name,
        riseOnHover: true,
    })
        .bindTooltip(`<strong>${church.name}</strong><br>${cityLabelOf(church)}`,
            { direction: 'top', offset: [0, -12] })
        .on('click', () => enterChurch(church.key));
}

/**
 * A city's counted pin. Clicking it flies past CITY_SPLIT_ZOOM, which is what
 * swaps it for the churches it stands for — so the click that looks like it
 * only zooms is also the one that makes them selectable.
 */
function cityPin(city) {
    return L.marker([city.lat, city.lon], {
        icon: landingPinIcon(city.churches.length),
        title: `${city.label}: ${city.churches.length} churches`,
        alt: `${city.label}, ${city.churches.length} churches`,
        riseOnHover: true,
    })
        .bindTooltip(`<strong>${city.label}</strong><br>${city.churches.length} churches — zoom in to choose`,
            { direction: 'top', offset: [0, -18] })
        .on('click', () => flyToCity(city));
}

/**
 * Opens a counted pin onto the churches behind it.
 *
 * Framed to the churches themselves rather than flown to a fixed zoom: the
 * five in Nashville are ten kilometres apart end to end, and a zoom chosen in
 * advance either cuts the outermost off the top of the map or, at a city whose
 * churches share a street, lands so far out that they are still one dot.
 *
 * Floored at CITY_SPLIT_ZOOM, because that is what trades the counted pin for
 * them. A city spread wide enough to fit below it would otherwise be opened
 * onto itself.
 */
function flyToCity(city) {
    const bounds = L.latLngBounds(city.churches.map(c => [c.coords.lat, c.coords.lon]));
    const padding = L.point(CITY_FIT_PADDING, CITY_FIT_PADDING);
    const zoom = Math.max(landingMap.getBoundsZoom(bounds, false, padding), CITY_SPLIT_ZOOM);

    landingMap.flyTo(bounds.getCenter(), zoom);
}

/**
 * Shows the set of pins the current zoom calls for: counted city pins while the
 * country is in view, the churches themselves once it is not. Churches alone in
 * their city are on the map throughout and are not touched here.
 */
function syncLandingPins() {
    if (!landingMap || !landingLayers) return;

    const apart = landingMap.getZoom() >= CITY_SPLIT_ZOOM;
    showLandingLayer(landingLayers.group, !apart);
    showLandingLayer(landingLayers.member, apart);
}

function showLandingLayer(layer, on) {
    if (on === landingMap.hasLayer(layer)) return;
    if (on) layer.addTo(landingMap); else landingMap.removeLayer(layer);
}

/**
 * Builds the map and everything on it.
 *
 * Leaflet is a CDN script like pannellum and omnitone. If it did not arrive
 * there is no map to build, and the list beside it becomes the whole landing
 * rather than half of it — said plainly in the map's place, because an empty
 * grey rectangle reads as a map still loading.
 */
function buildLandingMap(churches) {
    const holder = document.getElementById('landing-map');
    if (!holder) return;

    if (typeof L === 'undefined') {
        holder.innerHTML =
            '<p class="landing-map-note">The map could not be loaded. ' +
            'Every church is listed beside it.</p>';
        return;
    }

    landingMap = L.map(holder, {
        center: [LANDING_VIEW.lat, LANDING_VIEW.lon],
        zoom: LANDING_VIEW.zoom,
        minZoom: LANDING_MIN_ZOOM,
        scrollWheelZoom: true,
        // The landing is a picture of the collection before it is a map; the
        // attribution and the zoom buttons are enough chrome for that
        zoomControl: true,
    });

    L.tileLayer(LANDING_TILES, { attribution: LANDING_TILE_ATTRIBUTION, maxZoom: 19 })
        .addTo(landingMap);

    landingLayers = { solo: L.layerGroup(), group: L.layerGroup(), member: L.layerGroup() };
    landingPins = new Map();

    for (const city of landingCities(churches)) {
        const several = city.churches.length > 1;
        if (several) landingLayers.group.addLayer(cityPin(city));

        for (const church of city.churches) {
            const pin = churchPin(church);
            landingPins.set(church.key, pin);
            (several ? landingLayers.member : landingLayers.solo).addLayer(pin);
        }
    }

    landingLayers.solo.addTo(landingMap);

    // Before the first sync, so it reads the zoom the country was fitted at
    // rather than the placeholder the map was created on
    landingMap.fitBounds(LANDING_BOUNDS);

    landingMap.on('zoomend', syncLandingPins);
    syncLandingPins();
}

// ── Startup ───────────────────────────────────────────────────────────────

/**
 * Called from initApp(). The landing is already on screen — it ships open in
 * the markup, so there is no moment where the app shows through before the
 * script that covers it has run — and this fills it in.
 */
function initLanding() {
    const churches = landingChurches();
    setLandingCount(churches);
    buildLandingList(churches);
    buildLandingMap(churches);
}
