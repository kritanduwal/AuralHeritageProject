# Binaural balance: why the headphone render leaned right, and the fix

The headphone render of the seven churches with recovered originals sounded
about 40° to the right of where the source was, and slightly below it. This
document records what we found and what the app now does instead. The README
covers the rest of the headphone pipeline.

## Summary

The recordings were made with a RØDE NT-SF1, which has four capsules pointing
in different directions. Comparing the four is how software works out where a
sound came from. **Two of the four capsules recorded nothing of their own.**
Their channels hold only a faint, slightly filtered copy of the other two. This
is the same in every church, so it is a fault in the equipment, not the rooms.

Two capsules facing front-right and back-left can only tell "more front-right"
from "more back-left". A sound from straight ahead gets read as front-right,
which is the 40° lean. RØDE's own conversion software gives the same lean, so
the problem is in the recordings, not in our software.

The fix rebuilds the surround sound from the two working capsules:

- the direct sound is placed straight ahead, where the source was;
- the directions that were never recorded are filled with even reverb that
  points nowhere, rather than with wrong directions;
- two one-off faults are corrected along the way.

The image is now centred at all 47 seats, and head tracking behaves as
expected. What it cannot give back is the left/right direction of the early
echoes, which was never recorded.

## The symptom

Decoding all four capsules (`tools/aformat-to-bformat.js --four-capsule`) and
reading the direction of the direct sound from the intensity vector `W·[X, Y, Z]`:

- **Azimuth −38° to −43°** at 46 of 47 seats, in all seven churches. The
  exception, Guadalupe R6, reads 135°.
- **Elevation about −39°**: the source appears below the listener.
- **Through Omnitone's decode, the right ear runs 2–6.5 dB louder** on the
  direct sound, and 0.5–1.8 dB louder in the late tail.

At every receiver the panorama camera faces the source (yaw 0–4°), and the
array's front agrees with the panorama's. The source was straight ahead, so a
uniform −40° is a measurement error, not geometry.

## What we found

### Two of the four capsules carry nothing of their own

The capsules are named for their axes: FLU (front-left-up), FRD
(front-right-down), BLD (back-left-down), BRU (back-right-up). They are the last
four channels of each position: 3–6 at the six-channel churches, 5–8 at Church
Street.

| Test | Expected from four working capsules | Measured |
| --- | --- | --- |
| Level of each capsule in the diffuse tail | Within a dB or two of each other | FLU and BRU sit **12–14 dB below** FRD and BLD, at every church |
| Correlation-matrix eigenvalues over the tail, 300 Hz–3 kHz | about `[3.0, 0.33, 0.33, 0.33]` (four dimensions) | about **`[3.65, 0.35, 0, 0]`** (two dimensions) at 38 of 47 seats† |
| What is left of FLU or BRU after regressing it on FRD and BLD | about −3 dB (an independent capsule) | **−20 to −25 dB** |
| Correlation of FLU with BRU in the tail | about 0.67 | **0.98** |

† The other nine are St Francis's eight, where BLD is shifted in time (below),
and First Presbyterian R9, whose BRU is unrelated to everything else in the
tail. Once BLD is realigned, St Francis shows the same two-capsule pattern.

The mix is the same in every church:

```
FLU ≈ 0.12·FRD + 0.09·BLD
BRU ≈ 0.05·FRD + 0.12·BLD
```

Correlations do not depend on gain or on capsule order, so neither of the two
earlier suspects, unequal capsule gains or a wrong `CAPSULE_ORDER`, can produce
this.

### What remains is a filtered leak, not the missing capsules

FLU and BRU are not entirely explained by a flat mix of FRD and BLD. The
remainder decays with the room and starts with a direct-sound spike 50–65 dB
above the noise floor, so it is not noise. Two tests show it is still the
working capsules, filtered, rather than faint real capsules:

- **A filtered regression.** Letting FRD and BLD pass through short FIR filters,
  fitted on 80–300 ms of the tail and tested on 300–600 ms, removes another
  5–20 dB. With 8 taps, Church Street R3's BRU goes from −4.5 dB to −26.8 dB.
  What remains after up to 96 taps is −21 to −37 dB, some 35–50 dB below the
  working capsules.
- **A direction test.** For a frontal source, the FL–BR figure-8 would make
  FLU's remainder positive and BRU's negative. In the direct sound, both have
  the same sign at 18 of 21 seats. The remainder is a common signal, not the
  missing axis.

So a true four-capsule soundfield cannot be recovered from these files.
Building the missing axis from the remainder would mean boosting a −40 dB
signal by 40 dB.

### Why that produces a 40° lean

FRD and BLD face `(1, −1, −1)` and `(−1, 1, −1)`, almost exactly opposite. A
cardioid is half omni plus half figure-8 along its axis, so for a plane wave
from direction `u`:

```
FRD + BLD           = 1 − u_z/√3        an omni, slightly favouring sound from below
√(3/2)·(FRD − BLD)  = u·(1, −1, 0)/√2   a horizontal figure-8 along the FR–BL diagonal
```

That is two of the four B-format components. The FL–BR figure-8 and the
vertical component were never captured. The four-capsule matrix keeps the one
measured axis where it lies, at −45°, and projects every frontal sound onto it.
The source reads near −40°, and both capsules' down-tilt reads as −39°
elevation. This is a missing axis, not a rotation: turning the soundfield back
by 40° would not balance it.

The direct sound agrees the source was in front. FRD sits 3–12 dB over BLD. A
frontal source gives 11.4 dB; a source on the −45° diagonal would give about
20 dB.

### Two more faults, one each

- **Basilica St. Francis: BLD is shifted in time** against FRD: by 7–20 samples
  at most seats, and by 565, 737 and 907 samples (12–19 ms) at R5–R7. The leak
  in FLU and BRU carries BLD's original timing. Once BLD is shifted back by the
  lag found from FRD alone, FLU and BRU fit FRD + BLD to −20 to −26 dB, as
  everywhere else. That independently confirms the shift is in the file, not
  the room. Church Street's BLD is offset by 4–6 samples. Capsule spacing alone
  can't explain more than about 3 samples.
- **Guadalupe R6: the array faced away from the source.** BLD sits 4.2 dB over
  FRD in the direct sound, which is the "135°" reading.

The St Francis offsets are typical of Room EQ Wizard capturing channels in
separately timed sweeps, without a loopback timing reference.

### Where the fault probably is

- **Not REW.** It deconvolves each channel on its own and cannot mix one
  channel into another.
- **Not the rooms.** An acoustic cause would change with every room and seat,
  but the mix is identical in all seven churches.
- **Probably the microphone or its breakout cable, rather than the interface.**
  Church Street was patched into different interface inputs: two more
  microphones came first, so the NT-SF1 sat on inputs 5–8 rather than 3–6. The
  dead channels still moved with it, staying on capsule legs 1 and 4, which
  points at the mic or its cable rather than particular inputs.
  - A fault fixed to particular inputs, such as phantom power left off or a
    bad preamp, would not have followed the patching. It could only fit if the
    setting followed the mic in a saved session, which is less likely.
  - The leak is strong (about 13 dB down) and roughly flat with frequency.
    That suggests coupling inside the mic or breakout rather than in the cable
    run, but this is an inference.

The microphone is no longer available to test.

### RØDE's own conversion gives the same result

Church Street R1 was converted with **SoundField by RØDE 1.0.2** (VST, in
REAPER) to see whether RØDE's NT-SF1 calibration avoids the lean. Settings:
NT-SF1 input, Upright, 0 dB trim, AmbiX output, 48 kHz 32-bit float, no
normalization. The input was the four capsule files packed into one 4-channel
file, sample-identical to the originals.

| Church Street R1 | Direct sound | Tail eigenvalues | Ear R−L: direct / early / late |
| --- | --- | --- | --- |
| SoundField by RØDE | −42°, −54° | `[2.09, 1.91, 0, 0]` | +4.2 / +1.6 / +0.5 dB |
| Our four-capsule decode | −41°, −55° | `[2.09, 1.90, 0.01, 0]` | +2.8 / +1.2 / +0.6 dB |
| The rebuild (now shipped) | 0°, 0° | `[1.10, 1.02, 0.99, 0.89]`* | 0.0 / −0.2 / 0.0 dB |

\* Two of the rebuild's four components are synthesized (see below), so the
higher count does not add measured information.

Our converter and RØDE's agree to within 1–2°, so our converter's guesses about
capsule order and spacing correction were not the cause. The plugin labels its
inputs LF, RF, LB, RB, which matches our capsule order. In its live meters,
only RF and LB moved, even with the trim raised 10 dB.

## The fix

`tools/aformat-to-bformat.js` rebuilds each position's B-format from FRD
and BLD alone, in `rebuildFromPair()`:

1. **Realign.** BLD's offset from FRD is found by cross-correlating their tails,
   searched ±25 ms. Any lag over 3 samples is taken out.
2. **Build W and the figure-8.** `W = FRD + BLD`; figure-8 = `√(3/2)·(FRD − BLD)`.
   The same capsule-spacing correction filter as the four-capsule path is
   applied to both (12 mm radius, an estimate).
3. **Orient.** If the figure-8's direct sound has the opposite sign to W's, the
   array faced away (Guadalupe R6), and the figure-8 is flipped.
4. **Put the figure-8 on X**, front/back, instead of on its true diagonal.
5. **Make the direct sound exactly frontal.** For 2.5 ms after the direct
   sound's onset, Y and Z are silent and X is multiplied by √2, fading back over
   1 ms. A frontal source reaches the diagonal axis at cos 45° = 0.707, so the
   √2 restores it. The result is `W = 1, X = 1, Y = 0, Z = 0`, the exact
   B-format of a sound from straight ahead.
6. **Fill Y and Z with diffuse reverb.** After the direct sound, each is the
   figure-8 passed through its own decorrelator: a 1024-tap (21 ms)
   random-phase all-pass filter, seeded 1 for Y and 2 for Z. The decorrelators
   keep the level at every frequency and scramble the phase, so the result has
   the figure-8's loudness, tone and decay but is unrelated to it, to W and to
   each other: a diffuse field with no net direction. Y and Z run **2 dB
   higher through the first 80 ms**, easing back over 20 ms.
7. **Scale the set.** `--gain auto` applies one gain to every channel of every
   position in the church, putting its loudest sample at 0 dBFS.

The files are written in AmbiX order (W, Y, Z, X) as
`IR/<Church>/Not Normalized/<stem>-Bformat.wav`, the names the app has always
read. The per-seat trims in `Rooms.js` (`unnormalized.trim.ambisonic`) were
re-measured with `tools/measure-loudness.js`, averaging all five sources the app
offers.

### Two adjustments after the first listen

A first rebuild without step 5's √2, and without the 2 dB in step 6, was
balanced but sounded narrower than the four-capsule decode, and head tracking
moved the source less. Both were measured before changing anything (four seats:
Monastery R3, St Francis R4, Cane Ridge R2, Isleta R3):

| | Four-capsule decode | First rebuild | Shipped rebuild |
| --- | --- | --- | --- |
| Direct sound's horizontal strength, against W | −5.6 to −7.5 dB | −8.7 to −12 dB | −5.7 to −9 dB |
| Early side energy (Y, 2.5–80 ms), against W | −7.0 to −8.5 dB | −8.9 to −9.7 dB | −6.9 to −7.7 dB |
| Early ear correlation (lower is wider) | 0.54–0.68 | 0.69–0.74 | 0.57–0.62 |

The weaker direct sound was the missing 45° correction, which the √2 restores.
The narrower early field came from filling Y at the measured axis's early
level, which is low against W; the 2 dB was chosen to match the original's
early width. The rebuild was then tested at a separate address behind a feature
flag (`/binauralFix1`) before replacing the original files.

### Result

- **Ear balance** through Omnitone, all 47 seats: within 0.42 dB on the direct
  sound, 0.48 dB over 5–80 ms and 0.44 dB in the late tail. Before the fix it
  was 2–6.5 dB to the right.
- **Direct sound** reads 0° azimuth at every seat.
- **Head tracking** turns the source about as much as with the four-capsule
  decode, within about 1.5 dB of directional strength.
- **Loudness** against stereo matches on average over the five sources. The
  worst single source at the worst seat is 1.5–3.4 dB off, depending on the
  church.

## What it does not do

- **Early reflections have no left/right direction.** The one measured axis
  cannot tell front from right, or back from left: a reflection off the right
  wall gives the same capsule signals as one from the front. The rebuild maps
  the axis to front/back and fills left/right with the decorrelated field, so a
  right-wall reflection is pushed toward the front and a left-wall one toward
  the back. That direction was never recorded, but the four-capsule decode
  presented a false one, and part of what it sounded like as width came from
  that.
- **The 2 dB early boost is set by ear**, not measured.
- **Elevation is not represented.** The direct sound is placed level at every
  seat, including the balconies, where the camera looks 15° down. W also
  slightly favours sound from below (`1 − u_z/√3`), because both working
  capsules tilt down.
- **Not yet confirmed by ear.** Turn the view with head tracking on and confirm
  a source crosses to the *opposite* ear. The orientation rests on the cameras
  facing the source and on the direct-sound levels.
- **Two seats can clip once trimmed**: Monastery R6 and Guadalupe R6 peak
  above 0 dBFS on loud material at 100% reverb.
- **The speaker stage (`/5`)** decodes the same files. Its level was never
  calibrated against stereo, before or after.

## Regenerating the files

```bash
# one church at a time; --gain auto is per church
node tools/aformat-to-bformat.js --gain auto "IR/<Church>/Not Normalized"

# then re-derive every recovered set's trims (about ten minutes)
node tools/measure-loudness.js --write
```

The rebuild is the converter's default. `--four-capsule` still decodes all four
capsules, but only to `--out` or with `--dry-run`, never over the files the app
plays. In either mode the report prints, for every position, how much of FLU
and BRU the pair explains, and warns when they carry nothing of their own. The four-capsule files the app used
to play are in the git history, up to commit `808981c`.
