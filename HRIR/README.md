# HRIR sets

Head-related impulse responses. **Nothing in the web app reads this directory** —
the browser's headphone render decodes through Omnitone, which fetches its own
filters from the CDN. What lives here is what the offline measuring tool needs.

The audio is **not committed**. It is third-party data, it is large, and it is
freely obtainable; `.gitignore` keeps everything in this directory except this
file.

## What `tools/measure-loudness.js` needs

```
HRIR/
├── omnitone-foa-1.wav      # Omnitone's own first-order decode filters
└── omnitone-foa-2.wav
```

These are the two filter pairs Omnitone convolves a first-order soundfield
against, extracted from the library the page loads. Reading them here is what
makes the measurement exact rather than a model of the decode: the tool renders
the headphone stage through the very filters the browser runs.

Extract them from the Omnitone build the page uses — the WAVs are embedded in it
as base64 — or capture them from a browser session. Without them the tool warns
and skips the ambisonic column rather than guessing.

## The SADIE II database

No longer required. It was an input to `tools/bformat-to-brir.js`, which baked
offline BRIRs for the measured-binaural render; both that render and that tool
have been removed, and the live decode carries its own HRTFs.

If you want it anyway — for research alongside this library rather than for
anything the code runs — subject archives live on Zenodo under Apache 2.0:

| Subject | What it is | Archive |
| --- | --- | --- |
| D1 | Neumann KU100 dummy head | <https://zenodo.org/records/10886409/files/D1.zip> |
| D2 | KEMAR dummy head | <https://zenodo.org/records/12092466/files/D2.zip> |

Citation is required for academic use, per the database's terms:

> Armstrong, C., Thresh, L., Murphy, D., & Kearney, G. (2018). A Perceptual
> Evaluation of Individual and Non-Individual HRTFs: A Case Study of the SADIE
> II Database. *Applied Sciences*, 8(11), 2029.
> <https://doi.org/10.3390/app8112029>
