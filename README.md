# SSTV Lab — Send a Photo as Sound

[![Deploy to GitHub Pages](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml)
[![Tests](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

**Demo address (after Pages deployment): [Open SSTV Lab](https://altunsumerve.github.io/sstv-lab/)**

*[Türkçe README](README.tr.md)*

This project was created so that anyone can experience SSTV as simply as possible, even without
prior radio or electronics knowledge. A phone, a computer and their built-in speaker and microphone
are enough to try sending a picture through sound. No special hardware or paid software is needed.

A browser-based **Robot36 SSTV** encoder and acoustic decoder. One device plays a photo as audio
tones through its speaker; another device listens with its microphone and rebuilds the image line
by line. The only link between the two devices is air.

No app installation or account is required. Open the page on two devices and start with the
built-in test card, keeping the receiving microphone close to the speaker.

> **Privacy:** photos and microphone PCM never leave the device — encoding and decoding both run in
> the browser. On the official demo, additional requests update visit and reception-attempt counters;
> see **Live counters** below.

---

## What it actually does

| | |
|---|---|
| **Mode** | Robot36 (fixed — other modes are not auto-detected) |
| **Resolution** | 320 × 240, color |
| **Transmission time** | ~37 s per image |
| **Audio band** | VIS 1100–1300 Hz; image 1500–2300 Hz; sync 1200 Hz |
| **Decoder sample rate** | Device rates above 16 kHz are resampled to 16 kHz |
| **Dependencies** | None. No build step, no CDN, no npm packages at runtime |

---

## Use it

You need **two devices** — one to play, one to listen. This interface runs one role at a time;
use a second device for the acoustic demonstration.

1. **On the phone:** open the live demo → *01 Fotoğraf al* → **Mikrofonla dinlemeyi başlat**, allow
   microphone access.
2. **On the computer:** open the same page → *02 Fotoğraf gönder* → **Fotoğraf seç** (or press the
   colour-bar test card button if you do not want to pick a photo).
3. Press **Sesi çal**. Hold the phone near the computer speaker.
4. Watch the image build over ~37 s. Save it with **PNG kaydet**.

**Tips that actually matter:**

- Keep both tabs in the foreground — browsers suspend audio in background tabs.
- Medium volume. Clipping distorts the FM deviation and wrecks the colour.
- Disconnect Bluetooth headsets; their codecs mangle the tones and add latency.
- Quiet room. Speech and music in the 1–2.5 kHz band land right on top of the signal.

---

## Why HTTPS matters

`getUserMedia()` (microphone access) only works in a **secure context**:

- `https://…` — works (this is exactly why GitHub Pages is the right host)
- `http://127.0.0.1:5188` — works (localhost counts as secure)
- `http://192.168.x.x:5188` — **microphone blocked**

So on your LAN you can preview the page and *send* audio over plain HTTP, but a phone can only
*receive* over real HTTPS. Use the deployed Pages URL for phone testing.

---

## Live counters

The header shows two numbers, kept by [countapi.mileshilliard.com](https://countapi.mileshilliard.com)
— a free counter service with no signup and no API key:

| Counter | What increments it |
|---|---|
| **ZİYARETÇİ** | The first visit from a browser. A `localStorage` flag stops reloads from counting again, so this tracks browsers, not page loads. |
| **ALIM DENEMESİ** | Each time microphone listening successfully starts. Partial, interrupted and zero-row attempts count too. Finishing the image does not add another count. |

Stopping and starting listening again counts as a new attempt. Clearing the image while already
listening does not. Permission denial or microphone startup failure does not count. This measures
attempts, not unique people or successfully decoded pictures. It uses a separate counter key from
the former completed-image counter; older partial attempts cannot be recovered retrospectively.

The application sends a counter key, with no photo, audio or user identifier. Requests omit
cookies and the page referrer. Like any web service, the counter provider can still see the
request IP address and normal connection metadata.

Honest caveats:

- The endpoint is public, so anyone can inflate the numbers with `curl`. Read them as indicative,
  not audited.
- These are approximate browser counts, not a count of unique people. Clearing site data, using
  another browser, blocking storage or simultaneous first visits can count the same person again.
- Counters run only at `https://altunsumerve.github.io/sstv-lab/`. Local previews, temporary
  HTTPS tunnels and forks do not increment them. For your own deployment, update the origin,
  path and counter keys in `dist/counter.js`.
- Requests time out after six seconds. An unavailable count remains blank; if both fail, the
  panel stays hidden.
  The SSTV app itself never waits on it and never breaks because of it.
- This is a third-party service, with no uptime guarantee. The core SSTV experiment does not
  depend on it.

---

## Running locally

```bash
git clone https://github.com/altunsumerve/sstv-lab.git
cd sstv-lab
npm run dev
```

Serves `dist/` at `http://127.0.0.1:5188` and also binds `0.0.0.0`, printing every LAN address so
you can open it from another machine. Windows Firewall must allow inbound TCP 5188 on the private
network.

Node.js 20+ is required (22 or newer recommended). There are no runtime dependencies — `npm install` is only
needed for the Playwright browser test.

---

## Tests

```bash
npm test              # DSP and counter tests, no browser needed
npm run test:acoustic # acoustic-impairment sweep
npm run test:browser  # full browser pipeline (needs Playwright + dev server on :5188)
```

`npm test` encodes a colour-bar image and decodes it back at **16 / 44.1 / 48 kHz**, then asserts:

- all 240 rows decoded,
- mean colour error below threshold (typically < 1 / 255 on the colour-bar test),
- a quiet signal with synthetic echo and noise still decodes (error ≈ 4.5 / 255),
- silence produces **no** image,
- a truncated transmission is **not** reported as complete.

If `test-output/reference.wav` exists — a recording generated by
[pySSTV](https://github.com/dnet/pySSTV) — it is decoded too. That is an independent check that the
decoder matches a third-party encoder, not just our own.

`npm run test:browser` drives the real page through Playwright with a fake microphone device,
covering desktop and mobile viewports, WAV download, start/stop, permission denial, and the full
Web Audio → AudioWorklet → Worker → canvas path. Install Playwright first:

```bash
npm install
npx playwright install chromium
npm test
# Keep npm run dev running in a second terminal, then:
npm run test:browser
```

Test artifacts land in `test-output/`, which is git-ignored.

---

## How it works

**Encoder** (`dist/encoder.js`) — the photo is drawn to a 320 × 240 canvas, converted to YUV, and
turned into a Robot36 tone sequence: a VIS header, then per line a 1200 Hz sync pulse, a luminance
sweep, and alternating R−Y / B−Y chroma. Robot36 sends colour at half the vertical rate, which is
how 320 × 240 fits into 37 seconds.

**Decoder** (`dist/receiver.js` + `dist/vendor/`) — runs in a dedicated Worker to keep decoding work off the UI thread:

1. `capture-worklet.js` pulls uninterrupted sample blocks from the mic on the audio thread.
   `ScriptProcessor` is only a fallback for old browsers. `AnalyserNode` is deliberately **not**
   used — it drops and repeats frames, which silently corrupts line timing.
2. `resampler.js` reduces rates above 16 kHz with a continuous anti-aliasing filter.
3. Tones are shifted to complex baseband, FIR-filtered, and **FM-demodulated** — the instantaneous
   frequency is the pixel value.
4. The receiver validates the Robot36 VIS code and parity, then follows the 150 ms line clock.
   Sync pulses gently correct clock drift. A missed sync or damaged colour separator does not
   remove a row or swap the colour channels. After a long interruption, a new valid header
   starts a fresh image.

The last row is emitted without waiting for a following sync pulse — otherwise every image would
end one line short.

---

## Project layout

```
dist/                    static site — exactly what GitHub Pages serves
  index.html             two-tab UI (receive / send)
  about.html             plain-language explanation of SSTV
  app.js                 UI, mic lifecycle, wake lock, WebMCP tool registration
  encoder.js             Robot36 encoder + WAV writer
  receiver.js            decoder state machine and image assembly
  resampler.js           arbitrary rate to 16 kHz
  capture-worklet.js     AudioWorklet mic capture
  decode-worker.js       Worker wrapper around the receiver
  counter.js             visit / reception-attempt counters (fails silently when offline)
  style.css
  vendor/                DSP adapted from smolgroot/sstv-decoder (0BSD)
  THIRD_PARTY.txt
serve.mjs                dependency-free static dev server
tools/                   test scripts (not shipped to the site)
.github/workflows/       CI and Pages deployment
```

---

## Deployment

Pushing to `main` runs the DSP, counter and acoustic tests, then publishes `dist/` to GitHub Pages
if they pass. Upload the entire source project, including `.github/workflows/`, not only `dist/`.

One-time setup on a fresh repo: **Settings → Pages → Source → GitHub Actions**.

Every path in the site is relative, so it works under the `/sstv-lab/` subpath with no changes.
`dist/.nojekyll` stops Jekyll from touching the files.

---

## Limits — read before filing an issue

- **Robot36 only.** Scottie, Martin and PD modes are not implemented or auto-detected.
- **Real-world audio conditions still matter.** Room acoustics, speaker quality, clock drift and
  OS-level AGC / noise suppression all affect the result. A noisy room or a clipping speaker costs
  you rows or colour accuracy.
- **No resume.** After a long interruption, play the sound from the beginning. A new valid header
  starts a fresh image instead of appending to the partial one.
- **A partial transmission is never reported as success.** That is intentional.
- Backgrounding or closing the page stops the mic and playback. Screen Wake Lock is used where the
  browser supports it.

---

## Credits

- DSP helpers adapted from [smolgroot/sstv-decoder](https://github.com/smolgroot/sstv-decoder)
  (commit `ad3f3e0c`), 0BSD, itself descended from
  [xdsopl/robot36](https://github.com/xdsopl/robot36). Full notice in
  [`dist/THIRD_PARTY.txt`](dist/THIRD_PARTY.txt). `tools/vendor.mjs` is the conversion script and is
  never run at runtime.
- Robot36 encoder timings independently verified against [pySSTV](https://github.com/dnet/pySSTV)
  (commit `d998fad1`).
- Photo encoder and frame assembler written for this project.

## License

MIT — see [LICENSE](LICENSE). Vendored DSP remains under 0BSD.
