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

## Tests

```bash
npm test
```

Tests are run by Node's built-in test runner. No dependencies and no browser: the
application files are loaded into a `vm` context whose globals are test doubles for
the DOM, Web Audio, pannellum, `fetch` and timers, so the real `compile()`,
`buildConvolutionGraph()` and `switchRoom()` are exercised rather than copies of
them.

| File | Covers |
| --- | --- |
| `test/rooms.test.js` | The `ROOMS` table, its path builders, and the receiver distances |
| `test/audio.test.js` | Mix law, graph wiring, output stage selection, soundfield rotation, IR caching, playback lifecycle, WAV encoding |
| `test/app.test.js` | `compile()`, the stale-selection guard, viewer lifetime, error banner |
| `test/settings.test.js` | Church switching and the source file picker |
| `test/assets.test.js` | Every path in `ROOMS`, the markup and the CSS resolve to real files; the playback controls do not overlap |
| `test/helpers/harness.js` | The sandbox the other files use |

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
| `Javascript/Features.js` | Which optional renders this visit can reach, read from the address |
| `Javascript/Rooms.js` | **Data.** Per-church IR/panorama paths, camera angles, gain trims |
| `Javascript/ChurchData.js` | **Data.** History, dimensions and distances for the Church Info modal. Reference only — nothing here reaches playback |
| `Javascript/App.js` | Page state, panorama viewer, `compile()`, error banner, modals |
| `Javascript/AudioEngine.js` | Web Audio graph, IR loading and caching, playback, the headphone output stage and its soundfield rotation |
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

`IR/<Church>/<Set>/<Prefix>_<Receiver>-<Channel>.wav`

```
IR/Cane Ridge Meeting House, KY/Normalized/Cane Ridge KY_R7-1.wav
                                └─ set ──┘ └── prefix ──┘ │   └── channel
                                                          └── receiver position
```

`<Set>` names how that copy of the measurement was levelled:

```
IR/<Church>/Normalized/
IR/<Church>/Not Normalized/
```

Both hold the same positions under the same file names, which is why they are
separate folders rather than one. A church that has only ever been published has
the single `Normalized` folder; nothing outside it is optional.

Each receiver position was captured on a multichannel array, so several channels
exist per position:

| Churches | Channels per position | Layout |
| --- | --- | --- |
| Tennessee | 8 | Front L/R, Rear L/R, 4-channel ambisonic centre |
| Kentucky, Indiana, New Mexico | 6 | Front L/R, 4-channel ambisonic centre |

**The web app uses channels 1 and 2 only** — the front left/right pair — as the
left and right ear of a stereo auralization, in both output stages. Channels 3–8
are archived for research use and are not loaded by the browser. The `-1` / `-2`
suffix is appended by `AudioEngine.js`; `ROOMS` stores only the base path up to
the trailing `-`.

Two things about the archived channels are worth recording, because they are not
apparent from the file names and they are what rules out an ambisonic render
(see [Why not an ambisonic decode](#why-not-an-ambisonic-decode)): the 4-channel ambisonic block is
the **raw A-format** output of the NT-SF1 rather than B-format, and **every file
in `Normalized/` is peak-normalized on its own**, so relationships between
channels are gone. The stereo pair tolerates that because the two front omnis are
near symmetric; a decode built from linear combinations of four capsules would
not.

That is what the second folder is for. Where the un-normalized originals have
been recovered they sit in `IR/<Church>/Not Normalized/` alongside the published
set, and are the only files the [Headphones](#headphones) render will decode.
See [The originals](#the-originals-where-they-have-been-recovered).

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
                │                                          │  output stage │──► out
                │   ┌─ convolver L ─── wetGainLeft ────────►   L       R   │
                └───┤   (IR ch. 1)      (= mix)             └───────▲───────┘
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
## Headphones

The headphone button beside play switches the **output stage**: what becomes of
the dry and wet signals once the mix law has finished with them. Nothing upstream
changes, so the two modes are the same auralization heard two ways.

```
   dryGain ──────► merger L + R ─┐
   wetGainLeft ──► merger L      ├─► stereoOut ──────────────────┐
   wetGainRight ─► merger R      ┘                               │
                                                                 ├──► output ──► out
   dryGain ──────► ambiMerger W + X ─┐                           │
   splitter ─► 4 convolvers ─────────┴─ ambiWet ─► FOA ─► ambiOut┘
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
is encoded as a plane wave from straight ahead, landing on `W` and `X`, which is
where a source in front belongs.

Decoding live rather than baking the result offline costs four convolvers and a
renderer. What it buys is that the soundfield stays *rotatable* right up to the
ears — see [Head tracking](#head-tracking) — which nothing precomputed can offer.

**It is only available where a church's un-normalized originals were recovered,**
which today is three of the twelve. See
[Why not an ambisonic decode](#why-not-an-ambisonic-decode): a decode of the
published library would be confidently wrong, and offering it would be worse than
offering nothing, because nothing about it sounds broken.

Both stages are built on every play and one is faded to silence, because
rebuilding would restart the source and lose its place in the loop. Toggling
crossfades over 20 ms. The mode is engine state, so it survives the stop/start a
receiver change performs.

That 20 ms is a floor, not a taste: it cannot be zero, because a gain that steps
in a single sample is a click, and it should not fall below the few milliseconds
of convolution latency the decode adds over the stereo stage, or the fade would
duck both stages at once and punch a hole in the sound. The button's CSS
`transition` is held to the same standard — the fill is the only report the
toggle makes, so a slow colour settle is heard as a slow switch.

The crossfade is anchored before it is drawn — `rampGain()` cancels the
parameter's timeline and pins its current value at the current time before
scheduling the ramp. `linearRampToValueAtTime()` on its own interpolates from
the *previous automation event*, so the second toggle would draw its line from
where the first one ended, however long ago that was. Scheduling it makes the
gain jump nearly the whole way in one sample and then creep out the remainder,
which is heard as a click on every toggle after the first. The mix slider is
automated through the same helper for the same reason.

Use headphones. Over loudspeakers the effect is lost, because the room you are
sitting in filters the sound a second time.

### Level

The four B-format convolvers deliberately do **not** normalize: the offline
decode set their absolute level, and their level *relative to each other* is the
soundfield itself, so equal-power normalization would flatten the directions out.
The stereo stage's convolvers do normalize. The two therefore arrive at quite
different levels, and by an amount that depends on how the recovered set was
scaled rather than on anything about the room.

`trim.ambisonic` on the recovered set is what closes the gap. It replaces
`AMBISONIC_TRIM_DB` outright — it is the level the stage runs at, not an
adjustment to one — and it is bounded at −40 and +12 dB so that a typo cannot
deafen anybody.

**It scales the decoded room and nothing else.** The dry path is the identical
signal in both stages — it skips the decoder entirely and goes straight to the
stage output, centred, exactly as the stereo stage sends it. So the mix slider
means one thing on either side of the button: the same proportion of dry to
wet, by the same law, and at 0% the two stages are bit-for-bit the same signal.

Two things had to change for that. The trim used to scale the whole stage, dry
included, so calibrating a church pulled its centre image down by however much
the trim took off — as much as 17.6 dB at Basilica St. Francis's front row,
whose render read as hollow in the middle as a result. And the dry used to be
encoded as a plane wave from the front, which is the textbook thing to do and
bought nothing: `W` and `X` reach both ears alike, so the decode handed back a
signal that was still exactly mono, 5.7 dB down and smeared over 253 samples of
HRTF colouring. That colouring was the whole audible difference between the two
stages with the room dialled out.

Measured as interaural cross-correlation over the first 80 ms, the standard
proxy for how solid a centre image is:

| Church | Stereo | Trim on the whole stage | Trim on the wet | …and the dry undecoded |
| --- | --- | --- | --- | --- |
| Basilica St. Francis | 0.653 | 0.572 | 0.756 | **0.810** |
| Monastery Immaculate Conception | 0.510 | 0.746 | 0.791 | **0.778** |
| St Augustine Isleta | 0.757 | 0.663 | 0.868 | **0.846** |

All three now hold the centre more firmly than their own stereo does.

One consequence worth knowing: the dry no longer rotates with head tracking,
because it is no longer part of the soundfield. That is the right reading of
what it is — a dry/wet bypass rather than the room's direct sound, which the
impulse response carries already — but it does mean the room turns around it.

**It is stated per receiver, not per church**, and the spread inside one room is
large:

| Church | Front row | Back row | Spread |
| --- | --- | --- | --- |
| Basilica St. Francis | −18.7 dB (R1) | −4.0 dB (R4) | 14.7 dB |
| St Augustine Isleta | −16.6 dB (R1) | −5.2 dB (R4) | 11.5 dB |
| Monastery Immaculate Conception | −5.1 dB (R1) | +4.4 dB (R4) | 9.5 dB |

That is not noise in the measurement. It is the two sets disagreeing about what
distance does. Every published capsule was peak-normalized on its own, so a
position's stereo IR sits at full scale however far back it was recorded —
**stereo does not get quieter as you move away from the source.** The recovered
set was scaled by a single factor for the whole church, so it keeps the real
level relationships between seats and does get quieter. The gap between the two
therefore grows with distance.

One figure per church cannot close a gap that changes by 14 dB across the room.
Averaging leaves the front rows loud enough to clip and the back rows nearly
inaudible — which is exactly what it did before these were measured per position.

Correcting it here rather than in the files is deliberate. Rescaling each
position's B-format would destroy the between-seat relationships that make the
recovered set worth having in the first place. The files stay a faithful
measurement; this is a listening calibration against a reference that was itself
normalized per position.

Measured, not guessed: `tools/measure-loudness.js` renders both stages through
the same chain the engine builds — Omnitone's own filters for the decode — and
matches their ITU-R BS.1770 integrated loudness, position by position. It
renders each position twice: once with the dry muted, to measure the two rooms
against each other and derive the trim, and once as the app plays it. Run it
with `--write` to refresh the table. It also reports each position's peak and
flags anything above 0 dBFS, because matching loudness bounds neither peak nor
crest factor.

Matching the rooms rather than the totals leaves the two stages within 0.6 dB
of each other on average and 1.2 dB at worst, since they sum dry against wet
with slightly different coherence. That residual is the price of the slider
meaning the same thing in both, which is the trade worth making.

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

For three churches they have been — **Monastery Immaculate Conception**,
**Basilica St. Francis** and **St Augustine Isleta**. Each keeps its raw captures
in `IR/<Church>/Not Normalized/`, and the second objection above does not hold
against them: no channel peaks at full scale, and `aformat-to-bformat.js` says so
rather than printing its `STOP`.

The arithmetic agrees. Decoded, the directional channels sit at −5 to −8 dB
against `W`, near the −4.8 dB a diffuse tail should give, where the same
positions decoded from the published library scatter to −11, −15, −20 dB — the
signature of four capsules each rescaled by its own unknown factor.

These three are the churches whose headphone button works. The other nine play
stereo only.

### Which files each stage reads

| Stage | Files it convolves | Where they live |
| --- | --- | --- |
| Stereo | IR channels 1 and 2 | `Normalized/`, at every church |
| Headphones | `-Bformat.wav` | `Not Normalized/`, where recovered |

Stereo convolves channels 1 and 2 through `ConvolverNode`s that equal-power
normalize, which would scale the recovered level relationships straight back out.
All that would survive swapping its files is the incidental difference between
two takes of one measurement — a different length, a different L/R balance — and
that difference would land on the very reference the other stage is trimmed
against. So stereo stays on the published library everywhere, and the comparison
between the two stages means something.

`AudioEngine.js` therefore carries two path prefixes, `currentIr.base` and
`currentIr.decodedBase`. The second is the empty string at a church with no
recovered set, which is what leaves its button dead rather than arming it for a
file that is not there.

The published library keeps only its capsules now. The `-Bformat.wav` and
`-BRIR-*.wav` files once derived from it are gone: nothing reads them, and what
they encoded was never the soundfield that was measured.

Two more things are worth knowing before reading much into what you hear:

- **The set is scaled, as a set.** The originals arrive some 35–45 dB below the
  published library — a deconvolved IR lands wherever the sweep level put it — far
  enough down that the decode, whose convolvers deliberately do not normalize,
  comes back quieter than the dry path and is inaudible under it. So
  `aformat-to-bformat.js --gain auto` applies **one scalar to all four channels of
  every position**, bringing the loudest sample in the church to 0 dBFS. This is
  the opposite of the per-channel normalization above: every ratio inside the set,
  between capsules and between positions alike, comes out exactly as it went in.
  The only thing it changes is where the set as a whole sits.
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
was [found by ear](#the-impulse-response-library) against a decode whose directions
are invalid, so it records whatever offset made a broken soundfield sit least
wrong — not where the array was facing. A set that decodes correctly cannot
inherit it.

Monastery Immaculate Conception is the case in point. Taking the active intensity
vector `W·[X, Y, Z]` over the direct sound, the two sets disagree completely about
where the source is:

| Set | Direct-sound azimuth, by position | Elevation |
| --- | --- | --- |
| Published | −88°, −86°, −98°, −88°, −32°, −129° | ≈ +55° |
| Originals | −40°, −39°, −39°, −39°, −39°, −39° | ≈ −39° |

The published figures scatter over 97° and put the source *above* the array; the
originals agree to within a degree across all six positions. That consistency is
the decode working.

It also means the array's front and the panorama's already agree, so the church's
`soundfieldYaw: 180` is half a turn too far for this set. That is not a cosmetic
error: it renders the source **behind** the listener, and behind you the lateral
motion runs backwards — drag the view left and the source moves further left
instead of handing over to the right ear. Hence `soundfieldYaw: 0` on the
originals, stated rather than omitted.

The other two recovered sets measure the same way, which is what one would hope
from the same microphone on the same wiring:

| Set | Direct-sound azimuth, by position |
| --- | --- |
| Monastery Immaculate Conception | −40°, −39°, −39°, −39°, −39°, −39° |
| Basilica St. Francis | −43°, −42°, −40°, −41°, −40°, −41°, −41°, −39° |
| St Augustine Isleta | −40°, −41°, −41°, −41°, −41° |

All three therefore carry `soundfieldYaw: 0`, confirmed by ear.

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
azimuth and −39° elevation — a direction which is within a few degrees of the
`FRD` capsule axis itself, `(1, −1, −1)`. Two candidates, and the files cannot
distinguish them: the capsules were recorded at unequal gain, or `CAPSULE_ORDER`
in `aformat-to-bformat.js` does not match how this session was wired. Resolving it
needs the session notes, which is exactly what that script's header warns about.
Nothing here compensates for it, because compensating on a guess would bake a
second unknown into the output.

---

## Feature flags

**Nothing is gated today.** Every render the app can produce ships to every
visitor, so `/` is the whole experience and `FEATURE_NAMES` is empty.

The mechanism is kept, because the next research build will want it and because
the shape is easy to get subtly wrong. It reads optional features out of the
address, so a build can be shared without a separate deployment. To put one
behind a flag again, three declarations:

```js
// Javascript/Features.js
const FEATURE_NAMES = ['demo'];          // 1. declare the flag

// Javascript/App.js
const FEATURE_CONTROLS = {
    demo: ['some-button'],               // 2. name what it reveals
};

// server.js
const FEATURE_PATHS = ['/demo'];         // 3. route the path form
```

Step 2 also covers prose: any element marked `data-feature="demo"` is hidden from
a visit that did not ask, so instructions never describe a control that is not
there. Step 3 needs a matching `[[redirects]]` block in `netlify.toml`, and is
only for the path form — a query string works with no routing at all (`?demo`),
which makes it the reliable spelling on a static host. Both hand back
`index.html` without changing the address the browser shows.

Three properties are worth knowing before relying on it, all of them held by
`test/features.test.js`, which declares flags of its own so the mechanism stays
covered while the roster is empty:

- **Whole segments only.** A church folder or query value that happens to contain
  a flag's name never switches it on.
- **Implication is transitive.** `FEATURE_IMPLIES` lets a wider flag name only the
  one below it and still reach the whole chain. Resolved one step deep, the far
  end of a chain simply would not appear, and the symptom is a missing button.
- **A mutual implication resolves rather than hanging.** Nothing declares one; the
  guard is so that adding one is a design decision rather than a frozen tab.

Gating is presentation only. Nothing in `Features.js` disables engine code: a
hidden mode is one nobody can reach, not one that has been removed, so the audio
graph and its tests are identical either way.

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

No JavaScript logic changes: `switchRoom()`, `compile()` and the audio engine all
derive their behaviour from the ids and the `ROOMS` entry.

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

The Church Info modal opens with a cover photo of the church, named by the
`cover` field in `ChurchData.js`:

```js
CaneRidgeMeetingHouse: {
    name: "Cane Ridge Meeting House",
    cover: "Images/Cane Ridge Meeting House, KY/Info cover.jpeg",
    …
}
```

The field holds a full path rather than deriving one, because the photos differ
in extension (`.jpg` and `.jpeg`) and paths are case-sensitive once deployed.
The photo is shown whole, never cropped. `width` and `height` stay `auto` while
`max-width` and `max-height` cap the size, so the browser scales each cover on
its own proportions.

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
