# SoundField by RØDE comparison

A one-off test of whether RØDE's own A→B conversion, which knows the NT-SF1's
calibration, avoids the 40° lean that `tools/aformat-to-bformat.js` produces from
the recovered sets. Nothing in the app reads these files. Kept pending a
decision on whether they belong in the repository.

**Result: it does not.** At Church Street R1 the plugin's B-format reads the
direct sound at −42° azimuth, −54° elevation, against −41°, −55° from our
converter, and carries the same two independent signals instead of four.
Through Omnitone it leans slightly further right (+4.2 dB R−L on the direct
sound, against +2.8). The two dead capsules are missing from the recordings, so
no conversion can restore them. See "Why the originals lean 40° right" in the
main README.

| File | What it is |
| --- | --- |
| `input/<stem>-Aformat.wav` | The four capsule files of one seat from `IR/<Church>/Not Normalized/`, packed into one 4-channel file in recorded order (LF, RF, LB, RB). Sample-identical to the originals; 24-bit PCM stored as 32-bit float, which is lossless. Four seats: Monastery R3, St Francis R5, Church Street R1, Guadalupe R6. |
| `output/Church Street United_R1-RODE-Bformat.wav` | SoundField by RØDE 1.0.2 (VST) in REAPER: input NT-SF1, Upright, trim 0 dB; output B-Format (AmbiX); rendered 48 kHz, 32-bit float, unnormalized. The render the result above comes from. |
| `protools/Church Street United_R1-ProTools-stereo-only.wav` | An earlier Pro Tools attempt. Not valid: the plugin received only capsules 1 and 4, and channels 3–4 are silent. Kept as a record only. |
