# Aural Heritage Preservation of Historic American Churches

An interactive auralization of twelve historic American churches. Visitors pick a
church, stand at a measured listening position inside a 360° photo of it, and hear
any audio file played as if it were sounding in that room.

The acoustics are not simulated. Each room was measured on site, and the recordings
of those measurements — impulse responses — are convolved with the source audio in
the browser, so what you hear is the real reverberation of the real building.

Supported by [The Creative Arts Collective for Christian Life and Faith](https://creativeartscollective.com/),
Belmont University. Supervised by Dr. Doyuen Ko.

---

## Running it locally

Any static file server works, because the site is plain HTML, CSS and JavaScript
with no build step.

**With Node** (adds a source-file listing endpoint):

```bash
npm install
npm start                      # http://localhost:8000
```

**With Python** (no dependencies):

```bash
python3 -m http.server 8000    # http://localhost:8000/index.html
```

The only difference is the source file picker. Under Node, `server.js` exposes
`/api/source-files` and the picker lists whatever is actually in `Source Files/`.
Under Python — and on the deployed site — that endpoint does not exist, so the
picker falls back to the hardcoded `BUNDLED_SOURCE_FILES` list in `SettingsMenu.js`.
Either way, **Browse other files…** can play any WAV or MP3 from your own machine.

Deployment is Netlify, configured by `netlify.toml` to publish the repository root
as-is with no build command.

> **Note:** file paths are case-sensitive once deployed but not on Windows. A
> panorama referenced as `.JPG` when the file is really `.jpg` will work locally
> and 404 in production, so match the case on disk exactly.

---

## How the project works

### The flow of one selection

```
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
3. enables or disables the play button and colours the S/R markers
   <span style="color:#00f47f">green</span> or <span style="color:crimson">red</span>,
4. swaps the panorama and points the camera at that position's angles,
5. restarts playback if audio was already running, so the new room takes effect
   immediately.

Because selections can be clicked faster than the network responds, each `compile()`
takes a ticket from `compileSequence` and abandons its results if a newer selection
has started. A slow response can never overwrite a later choice.

### Files

| File | Responsibility |
| --- | --- |
| `index.html` | Markup: controls, the three tabs, floorplan overlays, modals |
| `Javascript/Rooms.js` | **Data.** Per-church IR/panorama paths, camera angles, gain trims |
| `Javascript/ChurchData.js` | **Data.** History, dimensions and distances for the Church Info modal |
| `Javascript/App.js` | Page state, panorama viewer, `compile()`, error banner, modals |
| `Javascript/AudioEngine.js` | Web Audio graph, IR loading and caching, playback |
| `Javascript/SettingsMenu.js` | Church dropdown, source file picker |
| `Style/Root.css` | Colour variables, marker button styles |
| `Style/Layout.css` | Page layout, overlay sizes, diagram background images |
| `Style/ChurchButtons.css` | Where each S/R marker sits on its floorplan |
| `Style/SettingsMenu.css` | Modal styling |
| `server.js` | Static server plus the `/api/source-files` listing |

`Rooms.js` is the single source of truth for playback behaviour. It replaced twelve
near-identical `CompileSelection<Church>()` functions that differed only in their
string literals and camera angles.

### The impulse response library

`IR/<Church>/<Prefix>_<Receiver>-<Channel>.wav`

```
IR/Cane Ridge Meeting House, KY/Cane Ridge KY_R7-1.wav
                                └── prefix ──┘ │   └── channel
                                               └── receiver position
```

Each receiver position was captured on a multichannel array, so several channels
exist per position:

| Churches | Channels per position | Layout |
| --- | --- | --- |
| Tennessee | 8 | Front L/R, Rear L/R, 4-channel ambisonic centre |
| Kentucky, Indiana, New Mexico | 6 | Front L/R, 4-channel ambisonic centre |

**The web app uses channels 1 and 2 only** — the front left/right pair — as the
left and right ear of a stereo auralization. Channels 3–8 are archived for
research use and are not loaded by the browser. The `-1` / `-2` suffix is appended
by `AudioEngine.js`; `ROOMS` stores only the base path up to the trailing `-`.

Prefixes rarely match the folder name (`Cane Ridge Meeting House, KY` holds files
named `Cane Ridge KY_…`), which is why `ir.dir` and `ir.prefix` are separate fields.
Basilica St. Francis R8 breaks the pattern entirely and carries an explicit
`irName` override.

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
                │                                          │    merger     │──► out
                │   ┌─ convolver L ─── wetGainLeft ────────►  L         R  │
                └───┤   (IR ch. 1)      (= mix)             └───────▲───────┘
                irTrim                                              │
                (per-position)                                      │
                    └─ splitter ─ convolver R ─── wetGainRight ──────┘
                                   (IR ch. 2)      (= mix)
```

`dryGain` feeds **both** output channels, so the unprocessed source stays centred
while the reverb arrives in stereo — which is what creates the sense of a room
around a source in front of you.

The `splitter` is a one-output `ChannelSplitter`, which keeps channel 0 only. A
stereo source file is therefore convolved as mono, rather than folding both of its
channels into both ears.

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

Two things worth reading off that table:

- At **0%** the wet path is silent and you hear the bare source file. This is the
  reference point for A/B-ing a room against dry audio.
- The crossover — where reverb first exceeds direct sound — sits just under **60%**.
  Below it you hear a source in a room; above it the room dominates.

Moving the slider during playback does not rebuild anything. `setConvolutionMix()`
ramps the three live gain nodes over 50 ms, which is fast enough to feel immediate
and slow enough to avoid zipper noise.

### Layer 2 — per-position gain trims (`gainDb`)

Rooms were measured with the same rig, but a receiver 90 ft from the speaker in a
long adobe mission does not produce a reverb of comparable loudness to one 12 ft
away. Left alone, distant positions come back disproportionately loud relative to
the dry source. `ROOMS` therefore carries an optional per-receiver reduction in dB:

```js
StAugustineIsleta: {
    receivers: {
        R1: {},                 // as recorded
        R2: { gainDb: 1.5 },    // −1.5 dB
        R3: { gainDb: 3   },
        R4: { gainDb: 4.5 },
        R5: { gainDb: 6   }     // −6 dB, the furthest position at 90 ft
    }
}
```

Trims currently exist for the Kentucky, Indiana and New Mexico churches, generally
increasing with distance from the source. Rooms and receivers with no `gainDb` play
back exactly as recorded. `gainDb` is a *reduction*, so a positive number makes that
position quieter: `gain = 10 ^ (−gainDb / 20)`.

| `gainDb` | Linear gain |
| ---: | ---: |
| 1 | ×0.891 |
| 1.5 | ×0.841 |
| 2.5 | ×0.750 |
| 3 | ×0.708 |
| 4.5 | ×0.596 |
| 6 | ×0.501 |

**Where the trim is applied matters.** A `ConvolverNode` equal-power normalizes its
impulse response at the moment `buffer` is assigned. Scaling the IR samples before
handing them over therefore accomplishes nothing — normalization scales the gain
straight back out, and the trim is silently discarded.

So the reduction is applied as a `GainNode` (`irTrim`) on the signal *entering* the
convolvers instead. Convolution is linear, so scaling the input scales the reverb by
exactly the same amount, and because the dry path taps the source before that node,
the direct sound is left at full level. The result is that raising a trim lowers the
reverb of that position relative to the source, which is the intent.

### Putting both layers together

```
wet output = mix × 10^(−gainDb/20) × convolve(source, IR)
dry output = min(1, 0.35^((10·mix − 1)/9)) × source
```

The slider is a listener control and applies everywhere. The trim is a per-position
calibration constant and never changes while you listen.

---

## Adding a church

1. **Audio** — drop the IRs in `IR/<Church Name>/`, named
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
   distances for the Church Info modal.

No JavaScript logic changes: `switchRoom()`, `compile()` and the audio engine all
derive their behaviour from the ids and the `ROOMS` entry.

---

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
  offline and downloads it as a WAV. Useful for checking a room's output without
  recording the browser. Call it from the console, or uncomment the call in
  `startPlayback()`.

---

## Credits

**Supervisor** — [Dr. Doyuen Ko](https://www.belmont.edu/profiles/doyuen-ko/),
Audio Engineering Technology, Belmont University

**Graduate Research Assistants** — Kritan Duwal, Lee Smith, Sihyeon Park, Omar Urrutia

Panoramas by [pannellum](https://pannellum.org/). All photographs and audio
recordings were captured by the research team with the express consent of the
participating churches. Distribution, reproduction, or commercial sale of this data,
in whole or in part, is prohibited without prior written permission.
