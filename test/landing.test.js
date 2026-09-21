'use strict';
/**
 * Landing.js — the opening map, the church list beside it, and the one door
 * they both lead through.
 *
 * The landing is the first thing a visit meets, and it is the only screen whose
 * failure mode is silence: a church with no coordinates, or a pin wired to
 * nothing, looks exactly like a church that was never in the collection. Most
 * of what is below is there to make that noisy.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp, ROOT } = require('./helpers/harness.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** A landing that has been filled in, as initApp() leaves it */
function landed(options) {
    const app = createApp(options);
    app.g.initLanding();
    return app;
}

/** Great-circle distance in kilometres, for the coordinate sanity checks */
function kmBetween(a, b) {
    const R = 6371;
    const rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// ── the coordinates ───────────────────────────────────────────────────────

test('every church the app can play has somewhere to be drawn', () => {
    // A church with no coordinates still reaches the list, so nothing looks
    // broken — it is simply nowhere on the map, which reads as absent
    const app = createApp();
    const missing = Object.keys(app.data.ROOMS)
        .filter(key => !app.data.churchData[key].coords);
    assert.deepEqual(missing, [], 'these churches would have no pin');
});

test('the coordinates are numbers, and they are in the United States', () => {
    const app = createApp();
    const bad = [];
    for (const [key, data] of Object.entries(app.data.churchData)) {
        const { lat, lon } = data.coords || {};
        // The contiguous states, generously bounded. Catches a dropped minus
        // sign, which puts a Nashville church in China rather than nowhere.
        if (!Number.isFinite(lat) || lat < 24 || lat > 50 ||
            !Number.isFinite(lon) || lon < -125 || lon > -66) {
            bad.push(`${key}: ${JSON.stringify(data.coords)}`);
        }
    }
    assert.deepEqual(bad, []);
});

test('no two churches were given the same coordinates', () => {
    // Twelve entries typed by hand, several sharing a city: a copy-paste that
    // was never edited would stack two pins and hide one of them
    const app = createApp();
    const seen = new Map();
    const shared = [];
    for (const [key, data] of Object.entries(app.data.churchData)) {
        const at = `${data.coords.lat},${data.coords.lon}`;
        if (seen.has(at)) shared.push(`${seen.get(at)} and ${key}`);
        seen.set(at, key);
    }
    assert.deepEqual(shared, []);
});

test('a church is near the city its address names', () => {
    // The coordinates were read off the addresses rather than surveyed, so the
    // check that matters is that they agree with the address: a transposed
    // digit lands a church in the next state while still looking plausible.
    const app = createApp();
    const { landingChurches, landingCities } = app.data;

    const strays = [];
    for (const city of landingCities(landingChurches())) {
        for (const church of city.churches) {
            const km = kmBetween(city, church.coords);
            if (km > 25) strays.push(`${church.name}: ${km.toFixed(0)} km from ${city.label}`);
        }
    }
    assert.deepEqual(strays, []);
});

// ── reading the addresses ─────────────────────────────────────────────────

test('every church address gives up a city and a state', () => {
    // City and state are parsed rather than stored, so an address written in a
    // different shape would quietly file that church under nothing
    const app = createApp();
    const unparsed = app.data.landingChurches().filter(c => !c.place);
    assert.deepEqual(unparsed.map(c => c.key), []);
});

test('placeOf reads the last city and state, not the first thing that looks like one', () => {
    const { placeOf } = createApp().data;

    // Objects built inside the sandbox carry its prototypes, so they are
    // compared field by field rather than whole
    const reads = (address, city, state, why) => {
        const place = placeOf(address);
        assert.ok(place, `${address}: read as no place at all`);
        assert.equal(place.city, city, why);
        assert.equal(place.state, state, why);
    };

    reads('1655 Cane Ridge Rd, Paris, KY 40361', 'Paris', 'KY');
    reads('154 Rep. John Lewis Way N., Nashville, TN 37219', 'Nashville', 'TN',
        'the abbreviations earlier in the street name are not the state');
    reads('900 Broadway, Nashville, TN 37203-1234', 'Nashville', 'TN',
        'a nine-digit ZIP is still an address');

    assert.equal(placeOf('nowhere in particular'), null);
    assert.equal(placeOf(''), null);
    assert.equal(placeOf(undefined), null);
});

test('every state the collection reaches has a name to be listed under', () => {
    // The fallback is the two-letter code, which is legible but sits oddly
    // among "Tennessee" and "Kentucky" — better to fail here than to ship it
    const app = createApp();
    const { STATE_NAMES } = app.data;
    const unnamed = app.data.landingStates(app.data.landingChurches())
        .filter(s => !STATE_NAMES[s.code]);
    assert.deepEqual(unnamed.map(s => s.code), []);
});

// ── what the landing offers ───────────────────────────────────────────────

test('the landing offers exactly the churches the app can play', () => {
    const app = createApp();
    assert.deepEqual(
        app.data.landingChurches().map(c => c.key),
        Object.keys(app.data.ROOMS),
        'the pins come from ROOMS, so a pin can never lead somewhere unplayable');
});

test('the list carries one entry per church, under its state', () => {
    const app = landed();
    const children = app.el('landing-list').children;

    const names = children.filter(c => c.tag === 'button').map(c => c.innerHTML);
    assert.equal(names.length, Object.keys(app.data.ROOMS).length);

    const headings = children.filter(c => c.tag === 'h3').map(c => c.textContent);
    assert.deepEqual(headings, ['Tennessee', 'Kentucky', 'Indiana', 'New Mexico'],
        'states appear in the order the churches do, not alphabetically');
});

test('a list entry names the church and where it is', () => {
    const app = landed();
    const entry = app.el('landing-list').children
        .find(c => c.tag === 'button' && c.innerHTML.includes('Cane Ridge Meeting House'));

    assert.ok(entry, 'Cane Ridge is not in the list');
    assert.match(entry.innerHTML, /Paris, KY/);
});

test('the list is headed by what is actually in the collection', () => {
    // Counted rather than written out, so it cannot go stale when a church is
    // added and the heading is forgotten
    const app = landed();
    assert.equal(app.el('landing-count').textContent, '12 churches in 4 states');
});

// ── the map ───────────────────────────────────────────────────────────────

test('the map opens fitted to the country, not to a zoom chosen in advance', () => {
    const app = landed();
    const { LANDING_BOUNDS, LANDING_MIN_ZOOM } = app.data;

    assert.ok(app.map.fitted, 'the opening view was never fitted to anything');
    assert.equal(app.map.fitted.south, LANDING_BOUNDS[0][0]);
    assert.equal(app.map.fitted.west, LANDING_BOUNDS[0][1]);
    assert.equal(app.map.fitted.north, LANDING_BOUNDS[1][0]);
    assert.equal(app.map.fitted.east, LANDING_BOUNDS[1][1]);
    assert.equal(app.map.options.minZoom, LANDING_MIN_ZOOM);
});

test('the country still fits on a phone-width pane', () => {
    // A zoom floor set above the fit crops the coasts, and the crop is silent:
    // the map looks like a map, just not of the country it claims to be of
    const app = createApp({ mapSize: { x: 398, y: 300 } });
    app.g.initLanding();

    assert.ok(app.map.zoom > app.data.LANDING_MIN_ZOOM,
        `the fit hit the floor at zoom ${app.map.zoom}; the country is being cropped`);
});

test('the opening view always shows counted pins rather than churches', () => {
    // The whole country is a long way below the split. A window wide enough to
    // invert that would open on twelve pins, five of which are one dot.
    const app = landed();
    assert.ok(app.map.zoom < app.data.CITY_SPLIT_ZOOM);

    const onAWall = createApp({ mapSize: { x: 3840, y: 2000 } });
    onAWall.g.initLanding();
    assert.ok(onAWall.map.zoom < onAWall.data.CITY_SPLIT_ZOOM);
});

test('the basemap is credited, as its terms require', () => {
    const app = landed();
    assert.equal(app.tileLayers.length, 1);
    assert.equal(app.tileLayers[0].url, app.data.LANDING_TILES);
    assert.match(app.tileLayers[0].options.attribution, /OpenStreetMap/);
});

test('the basemap needs no key, because there is nowhere to keep one', () => {
    // The grey basemaps that look better all want an account now, and a tile
    // server that wants a key it is not given stamps that across every tile
    // rather than failing — a map that looks broken instead of absent
    const app = createApp();
    assert.doesNotMatch(app.data.LANDING_TILES, /\bkey=|\bapikey=|\baccess[-_]?token=/i);
});

test('every church gets a pin, and every shared city gets a counted one', () => {
    const app = landed();
    const churches = app.data.landingChurches();
    const cities = app.data.landingCities(churches);
    const shared = cities.filter(c => c.churches.length > 1);

    assert.ok(shared.length, 'no city holds more than one church; this test would prove nothing');
    assert.equal(app.markers.length, churches.length + shared.length);
});

test('a city pin says how many churches stand behind it', () => {
    const app = landed();
    // Nashville holds five of the twelve, which is the case the split exists for
    const nashville = app.markers.find(m => /Nashville, TN: \d+ churches/.test(m.options.title));

    assert.ok(nashville, 'Nashville has no counted pin');
    assert.match(nashville.options.title, /5 churches/);
    assert.match(nashville.options.icon.html, />5</, 'the count has to be on the pin itself');
});

test('a church alone in its city is on the map from the start', () => {
    const app = landed();
    const { solo, group, member } = app.state.landingLayers;

    assert.ok(app.map.hasLayer(solo), 'these pins have nothing to be hidden behind');
    assert.ok(app.map.hasLayer(group), 'counted pins belong to the opening view');
    assert.ok(!app.map.hasLayer(member), 'their churches are indistinguishable at this zoom');
});

test('zooming in trades the counted pins for the churches behind them', () => {
    const app = landed();
    const { solo, group, member } = app.state.landingLayers;

    app.map.setZoom(app.data.CITY_SPLIT_ZOOM);

    assert.ok(!app.map.hasLayer(group), 'the count is meaningless once they are apart');
    assert.ok(app.map.hasLayer(member), 'each church has to be selectable here');
    assert.ok(app.map.hasLayer(solo), 'a church alone in its city never changes');
});

test('zooming back out puts the counted pins back', () => {
    const app = landed();
    const { group, member } = app.state.landingLayers;

    app.map.setZoom(app.data.CITY_SPLIT_ZOOM);
    app.map.setZoom(app.data.LANDING_VIEW.zoom);

    assert.ok(app.map.hasLayer(group));
    assert.ok(!app.map.hasLayer(member));
});

/** The counted pin for a city, by name */
const countedPin = (app, city) =>
    app.markers.find(m => new RegExp(`^${city}: \\d+ churches$`).test(m.options.title || ''));

test('a counted pin flies past the zoom that splits it', () => {
    // Otherwise it opens onto the same pin it was just clicked on
    const app = landed();

    countedPin(app, 'Nashville, TN').click();

    assert.equal(app.map.flights.length, 1);
    assert.ok(app.map.flights[0].zoom >= app.data.CITY_SPLIT_ZOOM,
        'the flight has to land where the churches are separately clickable');
    assert.equal(app.state.room, '', 'a city is not a church; nothing should be selected');
});

test('opening a city frames every church in it, not a fixed zoom', () => {
    // The five in Nashville are ten kilometres apart end to end. A zoom picked
    // in advance cut the outermost off the top of the map.
    const app = landed();

    countedPin(app, 'Nashville, TN').click();
    const landedAt = app.map.flights[0];

    const nashville = app.data.landingCities(app.data.landingChurches())
        .find(c => c.label === 'Nashville, TN');
    const fits = app.map.getBoundsZoom(
        app.g.L.latLngBounds(nashville.churches.map(c => [c.coords.lat, c.coords.lon])),
        false,
        app.g.L.point(app.data.CITY_FIT_PADDING, app.data.CITY_FIT_PADDING));

    assert.equal(landedAt.zoom, Math.max(fits, app.data.CITY_SPLIT_ZOOM));
    assert.ok(landedAt.zoom <= 16, `zoom ${landedAt.zoom} is closer than the spread of the city`);
});

test('a city whose churches are too far apart to fit still comes apart', () => {
    // Fitting them would leave the counted pin in place, so the click would
    // read as having done nothing but move the map
    const app = landed();

    // A pane so small that nothing fits above the split zoom
    const tiny = createApp({ mapSize: { x: 120, y: 90 } });
    tiny.g.initLanding();
    countedPin(tiny, 'Nashville, TN').click();

    assert.equal(tiny.map.flights[0].zoom, app.data.CITY_SPLIT_ZOOM,
        'the fit has to be floored at the zoom that splits the pin');
});

test('a city flight centres on its churches', () => {
    const app = landed();
    countedPin(app, 'Nashville, TN').click();

    const nashville = app.data.landingCities(app.data.landingChurches())
        .find(c => c.label === 'Nashville, TN');
    const [lat, lon] = app.map.flights[0].center;

    for (const church of nashville.churches) {
        assert.ok(kmBetween({ lat, lon }, church.coords) < 25,
            `${church.name} is outside the view the city pin opens`);
    }
});

// ── entering a church ─────────────────────────────────────────────────────

test('clicking a pin opens that church in the view tab', async () => {
    const app = landed();
    const pin = app.markers.find(m => m.options.title === 'Cane Ridge Meeting House');
    assert.ok(pin, 'Cane Ridge has no pin');

    pin.click();
    await app.settle();

    assert.equal(app.state.room, 'CaneRidgeMeetingHouse');
    assert.equal(app.state.rcvpos, 'rpR1_CaneRidgeMeetingHouse', 'the same first receiver the dropdown selects');
    assert.equal(app.el('CaneRidgeMeetingHouseui').style.display, 'flex');
    assert.ok(app.el('main-panel').classList.contains('active'));
    assert.ok(app.el('tab-main').classList.contains('active'));
    assert.ok(!app.el('landing').classList.contains('open'), 'the landing has to get out of the way');
});

test('entering a church leaves the dropdown reading that church', async () => {
    // Otherwise the control bar says "Select a Church" over a church that is
    // loaded, and the next selection from it looks like it changed nothing
    const app = landed();
    app.g.enterChurch('OurLadyOfGuadalupe');
    await app.settle();

    assert.equal(app.el('roomDropdown').value, 'OurLadyOfGuadalupe');
});

test('a list entry is the same door as a pin', async () => {
    const app = landed();
    const entry = app.el('landing-list').children
        .find(c => c.tag === 'button' && c.innerHTML.includes('Santuario'));

    assert.ok(entry, 'Guadalupe is not in the list');
    entry.onclick();
    await app.settle();

    assert.equal(app.state.room, 'OurLadyOfGuadalupe');
    assert.ok(!app.el('landing').classList.contains('open'));
});

test('every church can be entered from the map without error', async () => {
    const app = landed();
    for (const church of app.data.landingChurches()) {
        app.g.enterChurch(church.key);
        await app.settle();
        assert.equal(app.state.room, church.key);
    }
});

// ── opening and closing ───────────────────────────────────────────────────

test('the map button brings the landing back, and remeasures it', () => {
    const app = landed();
    app.g.closeLanding();

    app.g.openLanding();

    assert.ok(app.el('landing').classList.contains('open'));
    assert.ok(app.state.landingMap.invalidated > 0,
        'Leaflet caches its container size, and a hidden container has none');
});

test('reopening the landing leaves the selection alone', async () => {
    // It is a way back to the map, not a way to start over: closing it again
    // has to return the visitor to the church they were in
    const app = landed();
    app.g.enterChurch('BasilicaStFrancis');
    await app.settle();

    app.g.openLanding();
    app.g.dismissLanding();

    assert.equal(app.state.room, 'BasilicaStFrancis');
    assert.equal(app.state.rcvpos, 'rpR1_BasilicaStFrancis');
});

test('leaving without choosing is allowed, and chooses nothing', () => {
    const app = landed();
    app.g.dismissLanding();

    assert.ok(!app.el('landing').classList.contains('open'));
    assert.equal(app.state.room, '', 'the same empty selection the page has always started in');
});

test('escape closes the landing', () => {
    const app = landed();
    app.el('landing').classList.add('open');

    app.listeners.keydown.forEach(fn => fn({ key: 'Escape' }));

    assert.ok(!app.el('landing').classList.contains('open'));
});

test('escape does nothing once the landing is closed', () => {
    // The handler is registered for the life of the page, so it has to keep its
    // hands off a page that is being used
    const app = landed();
    app.g.dismissLanding();
    app.el('main-panel').classList.add('active');

    app.listeners.keydown.forEach(fn => fn({ key: 'Escape' }));
    app.listeners.keydown.forEach(fn => fn({ key: 'a' }));

    assert.ok(app.el('main-panel').classList.contains('active'));
});

// ── when the map does not arrive ──────────────────────────────────────────

test('without Leaflet the list is the whole landing, and says so in the map’s place', () => {
    // An empty grey rectangle reads as a map still loading, and a visitor waits
    // for it instead of using the list that is already there
    const app = landed({ noLeaflet: true });

    assert.equal(app.state.landingMap, null);
    assert.match(app.el('landing-map').innerHTML, /could not be loaded/);
    assert.equal(
        app.el('landing-list').children.filter(c => c.tag === 'button').length,
        Object.keys(app.data.ROOMS).length,
        'every church still has to be reachable');
});

test('without Leaflet, entering a church still works', async () => {
    const app = landed({ noLeaflet: true });
    const entry = app.el('landing-list').children
        .find(c => c.tag === 'button' && c.innerHTML.includes('Christ Church Cathedral'));

    entry.onclick();
    await app.settle();

    assert.equal(app.state.room, 'ChristChurchCathedral');
});

test('opening the landing without a map does not reach for one', () => {
    const app = landed({ noLeaflet: true });
    app.g.closeLanding();
    app.g.openLanding();   // invalidateSize() on a null map would throw here

    assert.ok(app.el('landing').classList.contains('open'));
});

// ── the markup ────────────────────────────────────────────────────────────

test('the landing ships open', () => {
    // Shown by the stylesheet rather than by a script, or the app behind it is
    // on screen for as long as the scripts take to run
    assert.match(html, /<div id="landing"[^>]*class="[^"]*\bopen\b/,
        'the landing must cover the page before any script does anything');
});

test('the landing has the two halves Landing.js fills in', () => {
    for (const id of ['landing-map', 'landing-list', 'landing-count']) {
        assert.ok(html.includes(`id="${id}"`), `no #${id} in the markup`);
    }
});

test('the page loads Leaflet, and the stylesheet that makes it a map', () => {
    // Leaflet without its CSS draws the tiles stacked in the corner, which
    // looks like broken data rather than a missing stylesheet
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet@[\d.]+\/dist\/leaflet\.js"/);
    assert.match(html, /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet@[\d.]+\/dist\/leaflet\.css"/);

    const script = html.match(/leaflet@([\d.]+)\/dist\/leaflet\.js/)[1];
    const style = html.match(/leaflet@([\d.]+)\/dist\/leaflet\.css/)[1];
    assert.equal(script, style, 'the stylesheet has to match the library it styles');
});

test('Leaflet is pinned to a version, like the other CDN libraries', () => {
    assert.doesNotMatch(html, /leaflet@latest/);
    assert.match(html, /leaflet@\d+\.\d+\.\d+\//, 'an unpinned library can change under the page');
});

test('there is a way back to the map', () => {
    assert.match(html, /id="map-btn"[^>]*onclick="openLanding\(\)"/,
        'without it the map is reachable only by reloading');
    assert.match(html, /id="landing-skip"[^>]*onclick="dismissLanding\(\)"/,
        'and a way past it for somebody who knows which church they want');
});

test('the tab buttons can be found by id', () => {
    // switchTab() highlights the button it was given, and the landing has none
    // to give it
    for (const tab of ['main', 'about', 'instructions']) {
        assert.ok(html.includes(`id="tab-${tab}"`), `no id on the ${tab} tab button`);
    }
});

test('switchTab still works from a click, and now from nowhere', () => {
    const app = createApp();

    app.g.switchTab('about', app.el('tab-about'));
    assert.ok(app.el('about-panel').classList.contains('active'));
    assert.ok(app.el('tab-about').classList.contains('active'));

    app.g.switchTab('main');
    assert.ok(app.el('main-panel').classList.contains('active'));
    assert.ok(app.el('tab-main').classList.contains('active'), 'found by id instead');
});

test('initApp fills the landing in', () => {
    // The landing is already on screen by then; an initApp that skipped it
    // would leave an empty map and an empty list covering the page
    const app = createApp();
    app.g.initApp();

    assert.ok(app.el('landing-count').textContent, 'the landing was never built');
    assert.ok(app.state.landingMap, 'no map');
});
