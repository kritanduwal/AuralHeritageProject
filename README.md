# Aural Heritage Preservation of Historic American Churches

An interactive auralization of historic American churches. Users can pick a
church, click on a measured listening position inside a 360° photo of it, and hear
any audio file played as if it were sounding in that room.

The acoustics are not simulated. Each room was measured on site, and the recordings
of those measurements, i.e. impulse responses, are convolved with the source audio in
the browser, so what you hear is the real reverberation of the real building.

Supported by [The Creative Arts Collective for Christian Life and Faith](https://creativeartscollective.com/),
Belmont University. Supervised by Dr. Doyuen Ko.

---

## Running it locally

Any static file server works — the site is plain HTML, CSS and JavaScript with no
build step.

```bash
npm install && npm start       # http://localhost:8000, adds /api/source-files
python3 -m http.server 8000    # no dependencies
```

The only difference is the source file picker. Under Node, `server.js` exposes
`/api/source-files` and the picker lists whatever is actually in `Source Files/`.
Under Python — and on the deployed site — that endpoint does not exist, so the
picker falls back to the hardcoded `BUNDLED_SOURCE_FILES` list in
`SettingsMenu.js`. Either way, **Browse other files…** can play any WAV or MP3
from your own machine.

Deployment is Netlify, configured by `netlify.toml` to publish the repository root
as-is with no build command.

## Tests

```bash
npm test
```

Tests are run by Node's built-in test runner. No dependencies and no browser: the
application files are loaded into a `vm` context whose globals are test doubles for
the DOM, Web Audio, pannellum, Leaflet, `fetch` and timers, so the real `compile()`,
`buildConvolutionGraph()`, `switchRoom()` and `buildLandingMap()` are exercised
rather than copies of them.

| File | Covers |
| --- | --- |
| `test/rooms.test.js` | The `ROOMS` table, its path builders, and the receiver distances |
| `test/audio.test.js` | Mix law, graph wiring, output stage selection, soundfield rotation, IR caching, playback lifecycle, WAV encoding |
| `test/app.test.js` | `compile()`, the stale-selection guard, viewer lifetime, error banner |
| `test/settings.test.js` | Church switching and the source file picker |
| `test/assets.test.js` | Every path in `ROOMS`, the markup and the CSS resolve to real files; the playback controls do not overlap; the rules that keep the page inside a narrow window are still there |
| `test/speakers.test.js` | The loudspeaker stage behind `/5`: the decode, routing each speaker to a device output, soloing one speaker, and that a plain visit gets none of it |
| `test/landing.test.js` | The landing map: church coordinates, the pins and how they split by zoom, the list, entering a church from either, and the animation that takes the landing away |
| `test/helpers/harness.js` | The sandbox the other files use |

---

## How the project works

### The flow of one selection

```
  landing map pin ──┐                   Landing.js
  landing list row ─┤                    closes the landing, switches to the
                    │                    View tab, sets the dropdown
                    ▼
  church dropdown ──► switchRoom()      SettingsMenu.js
                          │              shows that room's floorplan overlay,
                          │              selects receiver R1
                          ▼
  R-button click ───► updateRcvpos() ──► compile()             App.js
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            look up ROOMS entry    HEAD the IR file        aim the panorama
              (Rooms.js)          (does this position     at that position's
                                   have a recording?)      pitch / yaw
                    │                       │
                    └──────────┬────────────┘
                               ▼
                    setImpulseResponse(base, gainDb)          AudioEngine.js
                               │
        play ────────────────► startPlayback()
                               │  fetch + decode the IR pair,
                               │  build the convolution graph,
                               ▼  loop the source through it
                          your speakers
```

`compile()` is the hinge. It reads the current `room` and `rcvpos`, finds the
matching entry in `ROOMS`, and:

1. tells the audio engine which impulse response to use,
2. checks that the recording exists (a `HEAD` request — no audio is downloaded),
3. enables or disables the play button and colours the S/R markers green or red,
4. swaps the panorama and points the camera at that position's angles,
5. restarts playback if audio was already running, so the new room takes effect
   immediately.

Because selections can be clicked faster than the network responds, each `compile()`
takes a ticket from `compileSequence` and abandons its results if a newer selection
has started. A slow response can never overwrite a later choice.

### Files

| File | Responsibility |
| --- | --- |
| `index.html` | Markup: the landing, controls, the three tabs, floorplan overlays, modals |
| `Javascript/Features.js` | Which optional renders this visit can reach, read from the address |
| `Javascript/Rooms.js` | **Data.** Per-church IR/panorama paths, camera angles, gain trims |
| `Javascript/ChurchData.js` | **Data.** History, dimensions, distances and coordinates. Reference only — nothing here reaches playback |
| `Javascript/App.js` | Page state, panorama viewer, `compile()`, error banner, tabs, modals |
| `Javascript/AudioEngine.js` | Web Audio graph, IR loading and caching, playback, the headphone output stage and its soundfield rotation |
| `Javascript/SpeakerOutput.js` | Behind `/5`: the loudspeaker output stage, its decode, and the routing of each speaker to an output of the audio interface |
| `Javascript/SettingsMenu.js` | Church dropdown, source file picker |
| `Javascript/Landing.js` | The opening map of the collection and the church list beside it |
| `Style/Root.css` | Colour variables, marker button styles |
| `Style/Layout.css` | Page layout, overlay sizes, diagram background images |
| `Style/ChurchButtons.css` | Where each S/R marker sits on its floorplan |
| `Style/SettingsMenu.css` | Modal styling |
| `Style/Landing.css` | The landing overlay, its map pane, list and pins |
| `server.js` | Static server plus the `/api/source-files` listing |

`Rooms.js` is the single source of truth for playback behaviour: churches differ
only in data, never in code.

### The landing map

The page opens on a map of the United States with a pin on every church.
Choosing a church — from a pin or from the list beside the map — closes the 
landing, switches to the **View** tab, sets the dropdown and calls `switchRoom()`.
The landing has no private route into playback, so a church reached from the map 
ends up in exactly the state the dropdown would have left it in. `Map` at the end
of the tab row reopens it; `Skip the map` and `Escape` close it without choosing.
Reopening never disturbs the current selection.

**Choosing a church is animated:** the pin lights, the map zooms at it, and the
sheet fades and swells past the viewer — it grows rather than shrinks so the two
movements go the same direction instead of fighting. Two details are deliberate
and read backwards: the church is selected *before* the landing starts leaving, so
the panorama fetch and the IR probe run behind the overlay and the animation is
spent on a wait that happens anyway; and the map is put back where the dive
started **as the landing leaves**, not when it returns, so the snap is off screen
and the tiles for that view are fetched while nobody is looking. It returns to the
view the visitor left, not to the country.

`LANDING_EXIT_MS` in `Landing.js` and the transition on
`#landing.landing--leaving` are the same duration and `landing.test.js` checks
they stay that way: a stylesheet that outlasts the timer is cut off mid-fade, one
that finishes early leaves an invisible sheet over the page. The sheet drops
`pointer-events` for the whole exit, so the page underneath is live immediately
rather than swallowing the first click. A visitor who has asked for reduced motion
gets none of this and ends in the same place.

**The list is the other half of the map, not a fallback for it.** Five of the
twelve churches are in Nashville, within a mile of each other; at the zoom that
shows the country they are one pin no matter how the map is drawn. The pins close
that gap from their side too: a city holding more than one church shows a single
counted pin below `CITY_SPLIT_ZOOM`, and opening it flies to a zoom fitted to that
city's churches — floored at the split, so the click that frames them is also the
one that makes them separately clickable.

**Coordinates** live in `ChurchData.js` as `coords: { lat, lon }`. They were read
off the addresses rather than surveyed, so they are good to the block and not to
the door. `landing.test.js` checks that every church in `ROOMS` has one, that they
are inside the United States, that no two are identical, and that each sits within
25 km of the city its own address names — which is what catches a transposed
digit. The city and state a church is listed under are parsed back out of
`address`, which already carries them in one consistent `…, City, ST ZIP` shape;
storing them twice would let the copies drift.

**Leaflet and its tiles are CDN dependencies**, pinned by version like pannellum
and omnitone. Tiles come from OpenStreetMap, which needs no key — the grey
basemaps that would suit the palette better all want an account now, and a tile
server that wants a key it is not given stamps that across every tile rather than
failing. If Leaflet itself does not load, `buildLandingMap()` says so in the map's
place and the list beside it carries the whole landing; an empty grey rectangle
would read as a map still loading.

**Narrow windows.** The landing stacks its list under its map below 860px. The
page behind it has its own block at the end of `Layout.css` for 640px and under:
the app bar puts its title over its two logos, which shrink and may wrap; the tab
row and the panels give up their side padding. Before that block the two logos
were about 370px that would not shrink beside a title that would not go under
them, which set a floor of some 550px for the whole page — landing included,
since it sits in the same viewport. Nothing overflows horizontally now from 320px
up, on the landing or any of the three tabs.

A floorplan overlay is a fixed-size drawing with its markers placed in px, so it
does not shrink. It is bounded by the view instead and scrolls inside it where a
marker would otherwise fall outside, so every receiver stays reachable; on the
narrowest phones the edge of a wide drawing is cut off rather than scaled.

### The impulse response library

`IR/<Church>/<Set>/<Prefix>_<Receiver>-<Channel>.wav`

```
IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R7-1.wav
                                └─ set ──┘ └── prefix ──┘ │ └── channel
                                                          └── receiver position
```

`<Set>` names how that copy of the measurement was levelled:

```
IR/<Church>/Normalized/
IR/<Church>/Not Normalized/
```

Both hold the same positions under the same file names, which is why they are
separate folders rather than one.

Each receiver position was captured on a multichannel array, so several channels
exist per position:

| Churches | Channels per position | Layout |
| --- | --- | --- |
| Tennessee | 8 | Front L/R, Rear L/R, 4-channel ambisonic centre |
| Kentucky, Indiana, New Mexico | 6 | Front L/R, 4-channel ambisonic centre |

**Channels 1 and 2** — the front left/right pair — are used as the left and right
of a stereo auralization. Channels 3 and 4 are back left/right pair for the Tennessee 
churches. The last 4 channels for every church are the A-format output of the NT-SF1.

---

## Reverb ratios

This is the part that determines what you actually hear, and it has two independent
layers: the **mix**, which the visitor controls, and the **per-position trim**,
which the project sets.

### The signal path

The source is split into a *dry* copy (untouched) and a *wet* copy (convolved with
the room). Both land on the same stereo output:

```
                ┌──────────── dryGain ─────────────────────────────┐
                │            (taper)                               │
   source ──────┤                                          ┌───────▼───────┐
                │                                          │  output stage │──► out
                │   ┌─ convolver L ─── wetGainLeft ────────►   L       R   │
                └───┤   (IR ch. 1)      (= mix)            └───────▲───────┘
                irTrim                                              │
                (per-position)                                      │
                    └─ splitter ─ convolver R ─── wetGainRight ─────┘
                                   (IR ch. 2)      (= mix)
```

`dryGain` feeds **both** sides, so the unprocessed source stays centred while the
reverb arrives in stereo — which is what creates the sense of a room around a
source in front of you.

Those three signals are what the *output stage* renders, and there are two to
choose from — see [Headphones](#headphones).

### Layer 1 — the Room Reverberation slider (`mix`)

The slider runs 0–100% in steps of 10 and maps to `mix` ∈ [0, 1]. The two paths are
scaled by different laws:

- **Wet** tracks the slider directly: `wetGain = mix`.
- **Dry** follows a log taper: `dryGain = min(1, 0.35 ^ ((10·mix − 1) / 9))`.

The dry path has to give way as reverb comes up, or the two summed together get
progressively louder toward the wet end. The taper holds dry at unity through the
first 10% of the slider, then drops it linearly in dB to −9.1 dB at 100%:

| Slider | Wet gain | Wet | Dry gain | Dry | Wet : dry |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0% | 0.00 | −∞ | 1.000 | 0.0 dB | dry only |
| 10% | 0.10 | −20.0 dB | 1.000 | 0.0 dB | −20.0 dB |
| 20% | 0.20 | −14.0 dB | 0.890 | −1.0 dB | −13.0 dB |
| 30% | 0.30 | −10.5 dB | 0.792 | −2.0 dB | −8.4 dB |
| 40% | 0.40 | −8.0 dB | 0.705 | −3.0 dB | −4.9 dB |
| 50% | 0.50 | −6.0 dB | 0.627 | −4.1 dB | −2.0 dB |
| 60% | 0.60 | −4.4 dB | 0.558 | −5.1 dB | +0.6 dB |
| 70% | 0.70 | −3.1 dB | 0.497 | −6.1 dB | +3.0 dB |
| 80% | 0.80 | −1.9 dB | 0.442 | −7.1 dB | +5.2 dB |
| 90% | 0.90 | −0.9 dB | 0.393 | −8.1 dB | +7.2 dB |
| 100% | 1.00 | 0.0 dB | 0.350 | −9.1 dB | +9.1 dB |

At **0%** the wet path is silent and you hear the bare source file — the reference
point for A/B-ing a room against dry audio. The crossover, where reverb first
exceeds direct sound, sits just under **60%**: below it you hear a source in a
room, above it the room dominates.

Moving the slider during playback does not rebuild anything. `setConvolutionMix()`
ramps the three live gain nodes over 50 ms, which is fast enough to feel immediate
and slow enough to avoid zipper noise.

### Layer 2 — per-position gain trims (`gainDb`)

Rooms were measured with the same rig, but a receiver 90 ft from the speaker in a
long adobe mission does not produce a reverb of comparable loudness to one 12 ft
away. Left alone, distant positions come back disproportionately loud relative to
the dry source. `ROOMS` therefore carries an optional per-receiver level in dB:

```js
StAugustineIsleta: {
    receivers: {
        R1: {},                  // as recorded
        R2: { gainDb: -1.5 },
        R3: { gainDb:   -3 },
        R4: { gainDb: -4.5 },
        R5: { gainDb:   -6 }     // the furthest position, at 90 ft
    }
}
```

Trims currently exist for the Kentucky, Indiana and New Mexico churches, generally
falling with distance from the source. Rooms and receivers with no `gainDb` play
back exactly as recorded.

`gainDb` is a **signed level, not a reduction**: negative is quieter, so `gain =
10 ^ (gainDb / 20)`. It reads the same way as `trim.ambisonic` under
[Headphones](#headphones). Every entry today is negative, since the job is always
to hold a distant position back.

**Where the trim is applied matters.** A `ConvolverNode` equal-power normalizes
its impulse response at the moment `buffer` is assigned, so scaling the IR samples
before handing them over accomplishes nothing — normalization scales the gain
straight back out. The level is applied instead as a `GainNode` (`irTrim`) on the
signal *entering* the convolvers. Convolution is linear, so scaling the input
scales the reverb by exactly the same amount, and because the dry path taps the
source before that node the direct sound is left at full level: lowering a trim
lowers that position's reverb relative to the source, which is the intent.

### Putting both layers together

```
wet output = mix × 10^(gainDb/20) × convolve(source, IR)
dry output = min(1, 0.35^((10·mix − 1)/9)) × source
```

The slider is a listener control and applies everywhere. The trim is a per-position
calibration constant and never changes while you listen.

---
## Headphones

The headphone button beside play switches the **output stage**: what becomes of
the dry and wet signals once the mix law has finished with them. Nothing upstream
changes, so the two modes are the same auralization heard two ways.

```
   dryGain ──────► merger L + R ─┐
   wetGainLeft ──► merger L      ├─► stereoOut ────────────┐
   wetGainRight ─► merger R      ┘                         │
                                                           ├──► output ──► out
   dryGain ─────────────────────► ambiDryMerger L + R ─┐   │
   splitter ─► ambiWet ─► 4 convolvers ─► ambiMerger    ├─► ambiOut ─┘
                                    └─► ambiBus ─► FOA ─┘
```

**Stereo** sends each side to its own headphone channel. Everything in the left
signal reaches the left ear and none of it reaches the right, which no real room
can do, so the image collapses to a line drawn between your ears.

**Headphones** convolves the same mono wet signal against the four channels of
that position's B-format impulse response, reassembles them into a first-order
soundfield, and hands it to Omnitone to decode to binaural in the browser. Every
direction in the recorded soundfield reaches *both* ears with the delay, level
difference and spectral shaping a head introduces — the cue stereo cannot supply,
and what puts the church around you rather than inside your head. The dry signal
bypasses the decoder entirely and goes straight to the stage output; see
[Level](#level).

Decoding live rather than baking the result offline costs four convolvers and a
renderer. What it buys is that the soundfield stays *rotatable* right up to the
ears — see [Head tracking](#head-tracking) — which nothing precomputed can offer.

**It is only available where a church's un-normalized originals are available,**
which today is seven of the twelve. See
[Why not an ambisonic decode](#why-not-an-ambisonic-decode): a decode of the
published library would be confidently wrong, and offering it would be worse than
offering nothing, because nothing about it sounds broken.

Both stages are built on every play and one is faded to silence, because
rebuilding would restart the source and lose its place in the loop. Toggling
crossfades over 20 ms. The mode is engine state, so it survives the stop/start a
receiver change performs.

That 20 ms is a floor, not a taste: a gain that steps in a single sample is a
click, and it must not fall below the few milliseconds of convolution latency the
decode adds over the stereo stage, or the fade would duck both stages at once and
punch a hole in the sound. The button's CSS `transition` is held to the same
standard — the fill is the only report the toggle makes, so a slow colour settle
is heard as a slow switch.

The crossfade is anchored before it is drawn: `rampGain()` cancels the parameter's
timeline and pins its current value at the current time before scheduling the
ramp. `linearRampToValueAtTime()` on its own interpolates from the *previous
automation event*, so the second toggle would draw its line from wherever the
first one ended, jumping nearly the whole way in one sample and then creeping out
the remainder — heard as a click on every toggle after the first. The mix slider
uses the same helper for the same reason.

Use headphones. Over loudspeakers the effect is lost, because the room you are
sitting in filters the sound a second time.

### Level

The four B-format convolvers deliberately do **not** normalize: the offline decode
set their absolute level, and their level *relative to each other* is the
soundfield itself, so equal-power normalization would flatten the directions out.
The stereo stage's convolvers do normalize. The two therefore arrive at quite
different levels, by an amount that depends on how the recovered set was scaled
rather than on anything about the room.

`trim.ambisonic` on the recovered set is what closes the gap. It is the level the
stage runs at rather than an adjustment to one, bounded at −40 and +12 dB so that
a typo cannot deafen anybody. A position with no entry falls back to 0 dB and so
plays untrimmed, which `assets.test.js` exists to prevent.

**It scales the decoded room and nothing else.** The dry path is the identical
signal in both stages — it skips the decoder entirely and goes straight to the
stage output, centred, exactly as the stereo stage sends it. So the mix slider
means one thing on either side of the button, and at 0% the two stages are
bit-for-bit the same signal.

Two things had to change for that. The trim used to scale the whole stage, dry
included, so calibrating a church pulled its centre image down by however much the
trim took off — as much as 17.6 dB at Basilica St. Francis's front row, whose
render read as hollow in the middle as a result. And the dry used to be encoded as
a plane wave from the front, which is the textbook thing to do and bought nothing:
`W` and `X` reach both ears alike, so the decode handed back a signal that was
still exactly mono, 5.7 dB down and smeared over 253 samples of HRTF colouring —
which was the whole audible difference between the two stages with the room
dialled out.

Measured as interaural cross-correlation over the first 80 ms, the standard proxy
for how solid a centre image is:

| Church | Stereo | Trim on the whole stage | Now |
| --- | --- | --- | --- |
| Basilica St. Francis | 0.653 | 0.572 | **0.787** |
| Monastery Immaculate Conception | 0.510 | 0.746 | **0.779** |
| St Augustine Isleta | 0.757 | 0.663 | **0.851** |
| Cane Ridge Meeting House | 0.650 | — | **0.826** |
| First Presbyterian KY | 0.541 | — | **0.777** |
| Our Lady of Guadalupe | 0.697 | — | **0.832** |
| Church Street UMC | 0.638 | — | **0.852** |

Each figure is an impulse played through the stage as the app plays it — slider
at 100%, dry included, that position's trims applied — correlated between the
ears over the 80 ms from the impulse, at lags up to ±1 ms, and averaged over the
church's receivers. The four churches recovered since were never rendered with
the trim on the whole stage, so that column has nothing to say about them.

All seven now hold the centre more firmly than their own stereo does. One
consequence is worth knowing: the dry no longer rotates with head tracking,
because it is no longer part of the soundfield. That is the right reading of what
it is — a dry/wet bypass rather than the room's direct sound, which the impulse
response carries already — but it does mean the room turns around it.

**It is stated per receiver, not per church**, and the spread inside one room is
large:

| Church | Front row | Back row | Spread |
| --- | --- | --- | --- |
| Basilica St. Francis | −18.7 dB (R1) | −4.0 dB (R4) | 14.7 dB |
| St Augustine Isleta | −16.6 dB (R1) | −5.2 dB (R4) | 11.5 dB |
| Monastery Immaculate Conception | −5.1 dB (R1) | +4.4 dB (R4) | 9.5 dB |
| Cane Ridge Meeting House | −12.2 dB (R1) | +6.1 dB (R5) | 18.3 dB |
| Our Lady of Guadalupe | −13.7 dB (R1) | −8.4 dB (R6) | 5.3 dB |
| Church Street UMC | −7.1 dB (R1) | +1.9 dB (R4) | 9.0 dB |
| First Presbyterian KY | −6.1 dB (R1) | −0.1 dB (R6) | 6.0 dB |

Cane Ridge's spread is not distance. R5 and R6 want about +6 dB where every seat
around them wants −2 to −12, so their originals arrive some 15 dB below the rest
of the set — most likely a separate take at a different sweep level. The trim
still matches their loudness to stereo, but the level relationship between those
two seats and the others is not a measured one.

That is not noise in the measurement; it is the two sets disagreeing about what
distance does. Every published capsule was peak-normalized on its own, so a
position's stereo IR sits at full scale however far back it was recorded —
**stereo does not get quieter as you move away from the source.** The unnormalized
set was scaled by a single factor for the whole church, so it keeps the real level
relationships between seats and does get quieter. The gap therefore grows with
distance, and one figure per church cannot close a gap that changes by 14 dB
across the room: averaging leaves the front rows loud enough to clip and the back
rows nearly inaudible, which is exactly what it did before these were measured per
position.

Correcting it here rather than in the files is deliberate. Rescaling each
position's B-format would destroy the between-seat relationships that make the
recovered set worth having in the first place. The files stay a faithful
measurement; this is a listening calibration against a reference that was itself
normalized per position.

Measured, not guessed: `tools/measure-loudness.js` renders both stages through the
same chain the engine builds — Omnitone's own filters for the decode — and matches
their ITU-R BS.1770 integrated loudness, position by position. Each position is
rendered twice per source: once with the dry muted, to measure the two rooms
against each other and derive the trim, and once as the app plays it. Run it with
`--write` to refresh the table; a full run takes about ten minutes. It also
reports each position's peak and flags anything above 0 dBFS, because matching
loudness bounds neither peak nor crest factor. `--pink` measures one seeded
pink-noise probe instead — a minute for the whole library — and prints each
position's drift against the trim already stored, tracking the five-source average
to about a decibel. It refuses `--write`: it is a check, not a calibration. (A
steady tone would be the obvious probe and is the wrong one. It reads `|H(f)|` at
a single frequency, which in a reverberant space is one sample of a dense modal
pattern, and the two stages have different patterns: moving a 1 kHz probe by 3%
swings the trim it derives at St Francis R4 from −7.1 dB to +3.8 to −11.8.)

**The trim is not a property of the room alone.** The decode colours what passes
through it, so the ratio between the two stages is frequency-dependent, and the
correction a seat wants moves with the material played into it — across the five
sources the app offers, the spread reaches 5 dB at one position. Calibrated on
twelve seconds of clarinet, this table left the headphone render 2.8 dB quiet at
Basilica St. Francis R1 on everything else, audible as the render dropping the
moment the button is pressed; the measurement that vouched for it had been taken
on the same twelve seconds it was derived from, so it could only ever agree with
itself. So every source the app offers is measured and the stored trim is their
mean, leaving the two stages within 1.3 dB of each other on average and 2.7 dB at
worst — the worst being the least-suited source at the least-suited seat, not a
typical listen. What remains is spectral rather than a level: a scalar cannot
reach it, and only matching the two stages across frequency would.

Stereo has no trim. It is the reference the render is matched against, which is
what makes the comparison mean anything.

### Head tracking

The checkbox above the button turns the soundfield with the panorama. It is off
by default, and deliberately: a render that moved with the view would be
answering two questions at once for a listener trying to judge a room.

What the decoder is handed is the *inverse* of the camera's orientation. Turning
your head left does not move the room left; it leaves the room where it is, which
is the same as moving every source right relative to you. Sending the orientation
itself drags the soundfield along with the view, so a source stays glued to
whichever ear it started in — the symptom that a turn to the left keeps the sound
on the left instead of handing it to the right. `rotationMatrix4()` returns
`Rᵀ` rather than `R`, and transposes rather than negating both angles, which
is only the same thing when one of them is zero.

The bearing it turns by is the camera's *relative to the recording's own front*,
which is what `soundfieldYaw` records. See
[Why the originals need their own `soundfieldYaw`](#why-the-originals-need-their-own-soundfieldyaw).

### Why not an ambisonic decode

Every receiver also carries a 4-channel ambisonic array, which would be the more
direct route to binaural. Two properties of the published files rule it out:

- **They are A-format, not B-format.** Every pair stays above 0.7 correlated
  between 200 Hz and 1 kHz, and most above 0.6 even at 4–12 kHz, decorrelating
  progressively as frequency rises — spaced capsules, not the near-orthogonal
  `W/X/Y/Z` a decoder expects. The front L/R pair, analysed the same way as a
  control, falls to ≈0 above 200 Hz as a decorrelated pair should.
- **Each channel was peak-normalized on its own.** All 497 files in the library
  peak at exactly 1.000000, each on a single sample. A→B conversion is a weighted
  sum of the four capsules, so with the per-capsule gains gone the derived
  `W/X/Y/Z` are wrong and the decoded directions are not the measured ones.

A decode from these files would sound spatial while pointing sound in directions
nobody recorded — and nothing about it would sound wrong, which is what makes it
worth refusing rather than shipping with a caveat. The [Headphones](#headphones)
render is therefore offered only at churches whose un-normalized originals have
been recovered, and is simply unavailable at the rest.

### The originals, where they have been recovered

For seven churches they have been — **Monastery Immaculate Conception**,
**Basilica St. Francis**, **St Augustine Isleta**, **Cane Ridge Meeting House**,
**First Presbyterian Church, KY**, **Our Lady of Guadalupe** and **Church Street
United Methodist Church**. Each keeps its raw captures
in `IR/<Church>/Not Normalized/`, and the second objection above does not hold
against them: no channel peaks at full scale, and `aformat-to-bformat.js` says so
rather than printing its `STOP`.

The arithmetic agrees. Decoded, the directional channels sit at −5 to −8 dB
against `W`, near the −4.8 dB a diffuse tail should give, where the same positions
decoded from the published library scatter to −11, −15, −20 dB — the signature of
four capsules each rescaled by its own unknown factor.

These seven are the churches whose headphone button works. The other five play
stereo only.

### Which files each stage reads

| Stage | Files it convolves | Where they live |
| --- | --- | --- |
| Stereo | IR channels 1 and 2 | `Normalized/`, at every church |
| Headphones | `-Bformat.wav` | `Not Normalized/`, where recovered |

Stereo stays on the published library everywhere, including at the churches with
originals. Its `ConvolverNode`s equal-power normalize, which would scale the
recovered level relationships straight back out; all that would survive the swap
is the incidental difference between two takes of one measurement — a different
length, a different L/R balance — and that difference would land on the very
reference the other stage is trimmed against.

`AudioEngine.js` therefore carries two path prefixes, `currentIr.base` and
`currentIr.decodedBase`. The second is the empty string at a church with no
recovered set, which is what leaves its button dead rather than arming it for a
file that is not there. The published library keeps only its capsules now: the
`-Bformat.wav` and `-BRIR-*.wav` files once derived from it are gone, since
nothing reads them and what they encoded was never the soundfield that was
measured.

Two more things are worth knowing before reading much into what you hear:

- **The set is scaled, as a set.** The originals arrive some 35–45 dB below the
  published library — a deconvolved IR lands wherever the sweep level put it — far
  enough down that the decode, whose convolvers deliberately do not normalize,
  comes back quieter than the dry path and is inaudible under it. So
  `aformat-to-bformat.js --gain auto` applies **one scalar to all four channels of
  every position**, bringing the loudest sample in the church to 0 dBFS. This is
  the opposite of the per-channel normalization above: every ratio inside the set,
  between capsules and between positions alike, comes out exactly as it went in.
- **Which leaves one judgment call.** That absolute level sets how loud the
  measured reverb is against the direct sound, and 0 dBFS is a convention rather
  than a measurement — recovering the true ratio would need the source level at
  the microphone, which was not recorded. It is why the three trims land as far
  apart as +2.5, −5.6 and −6.4 dB. Playback loudness is matched either way: every
  set is measured against the same unchanged stereo.

The receivers, panoramas and `gainDb` trims are shared, because those describe the
room rather than the files. The `unnormalized` block carries only what describes
the files:

```js
unnormalized: {
    ir:            { dir: "…/Not Normalized", prefix: "MIC_IN" },
    trim:          { ambisonic: { R1: -4, R2: 3.8, … } },   // per receiver
    soundfieldYaw: 0,                    // see below
},
```

**`soundfieldYaw` is the one non-obvious part** of the entry.

### Why the originals need their own `soundfieldYaw`

A church's published `soundfieldYaw` looks like a measurement and is not one. It
was [found by ear](#the-impulse-response-library) against a decode whose
directions are invalid, so it records whatever offset made a broken soundfield sit
least wrong — not where the array was facing. A set that decodes correctly cannot
inherit it.

Taking the active intensity vector `W·[X, Y, Z]` over the direct sound:

| Set | Direct-sound azimuth, by position |
| --- | --- |
| Monastery IC — **published** | −88°, −86°, −98°, −88°, −32°, −129° (elevation ≈ +55°) |
| Monastery IC — originals | −40°, −39°, −39°, −39°, −39°, −39° (elevation ≈ −39°) |
| Basilica St. Francis — originals | −43°, −42°, −40°, −41°, −40°, −41°, −41°, −39° |
| St Augustine Isleta — originals | −40°, −41°, −41°, −41°, −41° |
| Cane Ridge — originals | −40°, −40°, −40°, −40°, −41°, −40°, −39°, −40°, −35° |
| First Presbyterian KY — originals | −42°, −42°, −40°, −41°, −41°, −41°, −41°, −42°, −44° |
| Our Lady of Guadalupe — originals | −37°, −40°, −41°, −41°, −40°, **136°** |
| Church Street UMC — originals | −41°, −42°, −34°, −34° |

The published figures scatter over 97° and put the source *above* the array. The
recovered sets agree to within a few degrees across every position, which is what
one would hope from the same microphone on the same wiring, and is the decode
working. The one exception is Our Lady of Guadalupe R6, which reads half a turn
from its own church even at the first arrival; it is unexplained, and a single
`soundfieldYaw` per set cannot correct one position.

Read the azimuth at the *first arrival*, not at the loudest sample. At the Cane
Ridge balcony and First Presbyterian R6 the loudest peak is a floor reflection a
few milliseconds later, arriving from below and behind (≈ 130°, −80°), which a
peak-based reading mistakes for the source.

It also means the array's front and the panorama's already agree, so Monastery
IC's church-level `soundfieldYaw: 180` is half a turn too far for its recovered
set. That is not a cosmetic error: it renders the source **behind** the listener,
and behind you the lateral motion runs backwards — drag the view left and the
source moves further left instead of handing over to the right ear. Every
recovered set therefore carries `soundfieldYaw: 0`, stated rather than omitted.
The first three were confirmed by ear; the four added since rest on the
measurement alone until they are.

`soundfieldYawOf()` in `Rooms.js` resolves it, falling back to the church where a
recovered set agrees. The measurement narrows the answer to one of two; only
listening settles it, so check by ear for each set you add — turn the view and
confirm a source crosses to the *opposite* ear rather than following you.

### One thing the originals do not settle

The four capsules are not level-matched. Over the reverberant tail — which is
diffuse, and so should read nearly equal on all four — they spread **16.7 dB**,
with channels 3 and 6 some 15 dB below 4 and 5. A coincident tetrahedral array
cannot do that; on-axis to one capsule is worth about 9.5 dB even for the direct
sound, and the tail should be flatter still.

That imbalance, not the room, is likely what puts the measured direction at −39°
azimuth and −39° elevation — within a few degrees of the `FRD` capsule axis
itself, `(1, −1, −1)`. Two candidates, and the files cannot distinguish them: the
capsules were recorded at unequal gain, or `CAPSULE_ORDER` in
`aformat-to-bformat.js` does not match how this session was wired. Resolving it
needs the session notes, which is exactly what that script's header warns about.
Nothing here compensates for it, because compensating on a guess would bake a
second unknown into the output.

---

## Feature flags

**One feature is gated today: `/5`**, loudspeaker playback of the B-format — see
[Speakers](#speakers-behind-5). Everything else ships to every visitor. The
mechanism reads optional features out of the address, so a build can be shared
without a separate deployment. To put another behind a flag, three declarations:

```js
const FEATURE_NAMES    = ['demo'];                    // 1. Features.js — declare it
const FEATURE_CONTROLS = { demo: ['some-button'] };   // 2. App.js — what it reveals
const FEATURE_PATHS    = ['/demo'];                   // 3. server.js — the path form
```

Step 2 also covers prose: any element marked `data-feature="demo"` is hidden from
a visit that did not ask, so instructions never describe a control that is not
there. Step 3 needs a matching `[[redirects]]` block in `netlify.toml`, and is
only for the path form — a query string works with no routing at all (`?demo`),
which makes it the reliable spelling on a static host. Both hand back `index.html`
without changing the address the browser shows.

Three properties are worth knowing before relying on it, all held by
`test/features.test.js`, which declares flags of its own so the mechanism stays
covered whatever the roster holds. **Whole segments only:** a church folder or
query value that merely contains a flag's name never switches it on. **Implication
is transitive:** `FEATURE_IMPLIES` lets a wider flag name only the one below it
and still reach the whole chain, where resolving one step deep would drop the far
end and the symptom is a missing button. **A mutual implication resolves rather
than hanging:** nothing declares one, but the guard makes adding one a design
decision rather than a frozen tab.

Gating in `Features.js` is presentation only. Nothing there disables engine
code: a hidden mode is one nobody can reach, not one that has been removed. `/5`
is the exception and makes it for itself — its stage needs the audio device
opened wider than stereo, so `SpeakerOutput.js` checks `featureEnabled()` before
it builds anything, and without the flag the audio graph is node for node the one
it was before the feature existed.

### Speakers (behind `/5`)

At `/5` (or `?5` on a host that cannot route paths) a third toggle appears left
of Headphones. It is a third **output stage**: the same four B-format convolvers
the headphone render decodes, decoded instead to five loudspeakers.

```
   convolver W ─┐
   convolver Y ─┼─ one gain each, per speaker ─► feed ×5 ─► speakerMerger ─► speakerOut ─► output
   convolver X ─┘                                 ▲           (one input per
   dryGain ───────────────────────────────────────┘ L, R       device output)
```

**The layout** is ITU 5.0 — left and right at ±30°, centre at 0°, surrounds at
±110° — held in the `SPEAKERS` table. The decode is derived from those angles,
so a different rig is a different table and nothing else.

**The decode** aims a virtual microphone at each speaker:
`g·(W + √2·(X·cos θ + Y·sin θ))`. √2 is the max-rE weighting for a horizontal
ring; the textbook 2 sharpens the image at one seat and puts loud out-of-phase
feeds opposite every source. `Z` is dropped, since every speaker is at ear
height. Five speakers bunched toward the front are not a regular ring, so this
is a sampling decode and not an optimised one: the front is denser than the
back, as it is in any 5.0 mix.

**The routing** is the part that depends on the hardware. The panel that opens
with the mode lists each speaker beside a dropdown of the outputs the device
offers; `setSpeakerRoute()` moves a feed to another input of the merger while
playing. Choosing an output another speaker holds swaps the two rather than
summing them. The default assumes surround order (L R C LFE Ls Rs) on six
outputs or more and plain order on exactly five. It is kept in `localStorage`,
and a saved routing naming outputs the current device does not have is ignored.
**Solo** leaves one speaker playing its own feed and silences the other four, to
check a routing by ear with the signal it will actually carry; it starts playback
if nothing is running, and is released when the mode is switched off.

**The device.** A page can only reach the outputs the browser reports as
`destination.maxChannelCount`. That is the system's default output device as the
operating system has it configured — on Windows, an interface left in a stereo
speaker configuration reports two however many sockets it has. With fewer than
five the toggle is greyed out and its tooltip says how many were found.

Things to know before relying on it:

- **The level is not calibrated.** The stage shares the headphone render's
  `trim.ambisonic`, which carries the large seat-to-seat correction, but its
  own decode gain is a convention (the five feeds carry the power of `W` in a
  diffuse field). Nothing has measured it against stereo the way
  `tools/measure-loudness.js` measured the headphone render.
- **The dry goes to left and right**, at the level the stereo stage sends it,
  so the mix slider means the same thing and at 0% the two stages are the same
  signal on the same two speakers.
- **Head tracking does not apply.** The listener turns their own head.
- **It needs the headphone stage to exist**, because it taps that stage's
  convolvers: same seven churches, and Omnitone has to have loaded.
- **The offline render does not carry it.** `downloadConvolvedAudio()` writes
  stereo while Speakers is on.

---

## Adding a church

1. **Audio** — drop the IRs in `IR/<Church Name>/Normalized/`, named
   `<Prefix>_R<n>-<channel>.wav`.
2. **Images** — add the 360° panoramas as `Images/<Church Name>/<Prefix>_R<n>.jpg`
   and a floorplan diagram PNG in the same folder.
3. **`Javascript/Rooms.js`** — add a `ROOMS` entry with the IR and panorama
   dir/prefix/extension, then one line per receiver with its `pitch`, `yaw` and
   optional `gainDb`. State both angles even when they are 0, so a
   straight-ahead view reads as a decision rather than an oversight.
4. **`index.html`** — add an `<option value="RoomKey">` to `#roomDropdown`, and a
   `<div id="RoomKeyui" class="ui">` holding one `spS_RoomKey` source button and an
   `rpR<n>_RoomKey` button per receiver.
5. **`Style/Layout.css`** — give `#RoomKeyui` its width, height and diagram
   `background-image`.
6. **`Style/ChurchButtons.css`** — position each marker on the diagram with `top`
   and `left`. `position: absolute` is already inherited from `Root.css`.
7. **`Javascript/ChurchData.js`** — add the history, dimensions and receiver
   distances for the Church Info modal, plus a `cover` photo (see below). Spell
   each receiver distance as `"<number> ft"`, which is the form the modal shows
   and the one `rooms.test.js` checks.
8. **`Javascript/ChurchData.js`** — add `coords: { lat, lon }` for the landing map
   pin, and write the `address` in the same `…, City, ST ZIP` shape as the rest,
   which is where the map reads its city and state from. A church in a state no
   other church is in also needs its name in `STATE_NAMES` (`Landing.js`), or it
   is listed under a bare two-letter code. `landing.test.js` fails on all three.

No JavaScript logic changes: `switchRoom()`, `compile()`, the landing and the audio
engine all derive their behaviour from the ids and the `ROOMS` entry.

---

### Adding a church's original captures

Where the un-normalized originals of a church already in the table are recovered:

1. **Audio** — drop them in `IR/<Church Name>/Not Normalized/`, named
   exactly as the published set is. Confirm the tool does not print its
   per-channel-normalization `STOP`; if it does, these are not originals.

   ```bash
   node tools/aformat-to-bformat.js --dry-run "IR/<Church Name>/Not Normalized"
   ```
2. **Derive** the B-format beside them. `--gain auto` is not optional here: the
   originals sit far too low to be heard without it.

   ```bash
   node tools/aformat-to-bformat.js --gain auto "IR/<Church Name>/Not Normalized"
   ```
3. **`Javascript/Rooms.js`** — add an `unnormalized: { ir, trim }` block to that
   church. `trim` carries `ambisonic` and nothing else — it is the one stage that
   reads the set — and within it one entry per receiver. Start it as
   `{ ambisonic: {} }`; step 5 fills it in. Adding the block is what makes that
   church's Headphones button live.
4. **Check which way it faces.** Do not inherit the church's `soundfieldYaw` —
   [it is not a measurement](#why-the-originals-need-their-own-soundfieldyaw).
   Turn the view with the headphone render on and confirm a source crosses to the
   *opposite* ear rather than following you; if it follows, the set is half a turn
   out and wants its own `soundfieldYaw` in the block.
5. **Calibrate.** With no arguments this now measures both sets of every church and
   writes all of them, so the two calibrations cannot drift apart.

   ```bash
   node tools/measure-loudness.js --write
   ```

`assets.test.js` checks that every receiver's five files are present and that the
new trims are ones the engine will accept, so a half-copied set fails the suite
rather than falling back to stereo in the browser.

---

### Church Info cover photos

The Church Info modal opens with a cover photo of the church, named by the `cover`
field in `ChurchData.js`. It holds a full path rather than deriving one, because
the photos differ in extension (`.jpg` and `.jpeg`) and paths are case-sensitive
once deployed:

```js
cover: "Images/Cane Ridge Meeting House, KY/Info cover.jpeg",
```

The photo is shown whole, never cropped: `width` and `height` stay `auto` while
`max-width` and `max-height` cap the size, so the browser scales each cover on its
own proportions.

## Implementation notes

- **Impulse response cache.** Switching receivers restarts playback, which would
  otherwise re-download and re-decode the same pair each time. `AudioEngine.js`
  keeps the eight most recently used IRs, caching the in-flight promise rather than
  the buffer so two quick plays share one download. It is capped because a full set
  across twelve churches would run to hundreds of megabytes.
- **Availability probes are `HEAD` requests.** Checking whether a position has a
  recording costs headers, not a multi-megabyte WAV.
- **Viewer lifetime.** `setImage()` destroys the previous pannellum viewer before
  building the next; stacked viewers leak WebGL contexts until the browser drops
  the oldest, which leaves the view black. `aimViewer()` binds to the specific
  viewer instance it was given, so a selection superseded mid-load cannot swing the
  camera that replaced it.
- **Missing files are named in the view.** Panorama errors, diagram 404s (invisible
  otherwise, since diagrams are CSS backgrounds), and missing IRs all surface in
  the error banner with the offending path rather than only in the console.
- **Known data gap.** `First Presbyterian Church, KY` R9 has 5 of 6 channels. This
  does not affect the web app, which uses channels 1 and 2.
- **`downloadConvolvedAudio()`** in `AudioEngine.js` renders the current selection
  offline and downloads it as a WAV — useful for checking a room's output without
  recording the browser. Call it from the console, or uncomment the call in
  `startPlayback()`. It renders whichever stage the Headphones button has
  selected, naming the file `convolved-output-stereo.wav` or
  `convolved-output-headphones.wav` so the two renders of one position can be
  compared side by side. The headphone render is decoded through a second
  Omnitone renderer built against the offline context, since a renderer belongs
  to the context that made it; where one cannot be assembled — no B-format at
  that position, or Omnitone absent — it falls back to stereo and says so in the
  console. A soundfield being turned by head tracking is frozen at the
  orientation the view had when the render was asked for.

---

## Credits

**Supervisor** — [Dr. Doyuen Ko](https://www.belmont.edu/profiles/doyuen-ko/),
Audio Engineering Technology, Belmont University

**Graduate Research Assistants** — Kritan Duwal, Lee Smith, Sihyeon Park, Omar Urrutia

**Open-source software** — three libraries do work this project did not have to:

- [pannellum](https://pannellum.org/) shows the 360° photographs, so you can look
  around inside each church.
- [Omnitone](https://googlechrome.github.io/omnitone/) turns the surround
  recording of each room into sound for two ears, which is what makes the
  headphone mode feel like standing in the church.
- [Leaflet](https://leafletjs.com/) draws the opening map of the churches, on map
  imagery from [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors.

All photographs and audio
recordings were captured by the research team with the express consent of the
participating churches. Distribution, reproduction, or commercial sale of this data,
in whole or in part, is prohibited without prior written permission.
