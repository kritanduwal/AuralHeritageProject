# HRIR sets

Head-related impulse responses, used by `tools/bformat-to-brir.js` to decode the
B-format room impulse responses to binaural. Nothing in the web app reads this
directory — it is an input to an offline step, and the BRIR files that step
produces are what playback loads.

The audio here is **not committed**. It is third-party data, it is large, and it
is freely downloadable; `.gitignore` keeps everything in this directory except
this file. Fetch it yourself with the steps below.

## What is here

```
HRIR/
└── D1/                          # SADIE II subject D1 — Neumann KU100 dummy head
    ├── D1_HRIR_WAV/
    │   ├── 44K_16bit/
    │   ├── 48K_24bit/           # ← the one the tools use
    │   └── 96K_24bit/
    ├── D1_HRIR_SOFA/            # same data in AES69 SOFA; the tools do not read it
    ├── D1_BRIR_WAV/             # York's own room BRIRs, unrelated to this project
    ├── D1_DT990/                # headphone compensation for Beyerdynamic DT990
    └── D1_Scans/                # anthropometric scans
```

Use **48K_24bit**. The tools refuse to render when the HRIR set and the B-format
disagree on sample rate rather than silently stretching one, and everything in
`IR/` is 48 kHz.

## Fetching it

The SADIE II Database comes from the AudioLab at the University of York and is
released under Apache 2.0. Subject archives live on Zenodo:

| Subject | What it is | Archive |
| --- | --- | --- |
| D1 | Neumann KU100 dummy head | <https://zenodo.org/records/10886409/files/D1.zip> |
| D2 | KEMAR dummy head | <https://zenodo.org/records/12092466/files/D2.zip> |

```sh
curl -L -o HRIR/D1.zip "https://zenodo.org/records/10886409/files/D1.zip?download=1"
# then unzip into HRIR/
```

D1 is the better default for a public-facing render: a dummy head is nobody in
particular, which is the point — an individual subject's HRTFs fit that person
and are worse than a mannequin's for everyone else. D2 is the other mannequin,
worth trying if D1 externalizes badly for you.

Roughly 112 MB compressed, 333 MB extracted per subject.

## Citation

Required for academic use, per the database's terms:

> Armstrong, C., Thresh, L., Murphy, D., & Kearney, G. (2018). A Perceptual
> Evaluation of Individual and Non-Individual HRTFs: A Case Study of the SADIE
> II Database. *Applied Sciences*, 8(11), 2029.
> <https://doi.org/10.3390/app8112029>

## Before rendering with a set

Run `--list` first. The angles are parsed out of the filenames, and a set whose
convention differs from the default pattern will mirror or scramble the render
without erroring:

```sh
node tools/bformat-to-brir.js --hrir HRIR/D1/D1_HRIR_WAV/48K_24bit --list
```

D1 names its files `azi_0,0_ele_-15,0.wav` — comma decimal separator, azimuth
running 0–360° counterclockwise — which the default pattern reads correctly, and
its 9201 measured directions answer every virtual loudspeaker to within 0.04°.
A sparser set will say so in the per-position report.
