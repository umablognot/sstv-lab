# Changelog

## 2.0.0 — 2025-09-15

### Added
- **Multilingual interface** (gettext): Turkish, English, German, Spanish, French, Arabic (RTL)
  and Simplified Chinese. Standard `.po` sources with compiled `.mo` catalogs under
  `dist/locales/`, a zero-dependency runtime (`i18n.js`), header language switcher, `?lang=`
  parameter and per-visitor persistence.
- **Offline-first PWA**: `manifest.webmanifest` + `sw.js` precaching the entire app including all
  language catalogs; install prompt button; online/offline badge.
- **QR code transfer channel**: built-in pure-JS QR encoder (`features/qr.js`), chunked frame
  protocol (`SQ` framing), camera receiver with vendored jsQR, adjustable frame rate, save-as-PNG.
- **Bluetooth transfer channel**: photo transfer over Bluetooth LE Nordic UART (GATT) between Web
  Bluetooth devices; audio output picking (`selectAudioOutput`/`setSinkId`) for routing the
  acoustic transfer to a Bluetooth speaker.
- **NFC pairing channel**: NDEF invite write/read (Web NFC) that opens the app with the right
  role on the tapped phone.
- **Sound check tool**: 1500 → 1900 → 2300 Hz calibration tones.
- Desktop & tablet experience: responsive breakpoints (≥720 px, ≥1080 px), keyboard shortcuts
  (`1`/`2`/`3`, `L`, `Space`), drag & drop and clipboard paste for photos, camera capture input.
- Toolchain: `tools/msgfmt.mjs` (pure-Node `.po`→`.mo` compiler, no gettext dependency),
  `tools/pocheck.mjs` parity gate; new tests `test-qr.mjs`, `test-msgfmt.mjs`, `test-i18n.mjs`.
- `?role=rx|tx` deep links, `#cihazlar` hash, PWA shortcuts (legacy `#gonder` preserved).

### Changed
- Modernized dark UI (gradient headline, segmented tabs, channel cards, animated scanline,
  focus rings, `prefers-reduced-motion` support) while preserving the `#101412`/`#c7fb67` brand.
- `app.js` fully internationalized; all user-facing strings moved into catalogs.
- `serve.mjs` now serves `.webmanifest`, `.png`, `.mo`, `.po` and `.md` MIME types.
- Browser test extended: language switching, QR sender smoke test, i18n-ready gating.
- MCP tool `get_sstv_status` now also reports channel states and active language.

### Notes
- Zero runtime dependencies remain; jsQR is vendored (MIT) and credited in `dist/THIRD_PARTY.txt`.
- Deployment artifact (`dist/`) is self-contained: pages, code, icons, fonts (system stack) and
  all seven catalogs.
