# Keyboard API dependencies in Renpet

Renpet is a calendar and appointment application. **Neither keyboard's
dictionary, prediction algorithm or sign catalog is authored by Renpet.**

The repositories are independent, headless programming APIs:

- [Coptic Keyboard](https://github.com/sydgouda2022/coptic-keyboard) — `src/core.mjs`, `src/editor.mjs`, `src/lexicon.mjs` and `src/index.mjs`, API v2. Source-backed Sahidic and Bohairic input with optional local learning.
- [Hieroglyphic Keyboard](https://github.com/sydgouda2022/hieroglyphic-keyboard) — `src/keyboard_api.mjs`, `keyboard_search.mjs` and `keyboard_catalog.js`, API v2. Native signs, verified lexicon records and source-aware suggestions.

## Runtime boundary

`web/keyboard-api.mjs` is the Renpet adapter: it calls the pinned library
interfaces and prepares prediction engines once per loaded lexicon. Renpet's
`web/keyboard.js` owns the input dock and editor integration only.
`web/keyboard-core.js` owns caret/word selection and number-key presentation;
Unicode grapheme deletion delegates to the Coptic API's pure editor.

The pinned upstream modules live under `web/keyboards/cop/` and
`web/keyboards/egy/`. This local vendoring is required for offline use; there
is no hosted API, telemetry or remote prediction service. References in
`keyboard-lock.json` pin each upstream commit, the Git blob SHA-1 of every
vendored executable module, and SHA-256 checksums of the released lexicon bytes.
`python tools/sync_keyboards.py --verify` checks all pins without fetching or
writing. An upstream update requires an explicit `python tools/sync_keyboards.py`
invocation and a reviewed pull request; CI never silently rewrites `main`.

Renpet owns local keyboard learning, personal text, events, reminders,
preferences and exports. The Coptic browser installer remains an app-managed
storage adapter; the published Coptic API is entirely headless. The Egyptian
API's verified lexicon payload is independently sourced.

## Historical data and limitations

Coptic currently contains 20,652 distinct written forms, with dialect evidence
only where supported. Late Egyptian includes 41,330 spelling records covering
40,265 Unicode sequences; unlinked Ramses model forms are **not** verified
lemmata. Neither inventory is a complete historical vocabulary. Suggestions
are not automatic corrections or manuscript-specific attestations.

Both dictionaries use an integrity-checked local install and may be unavailable
when offline before first use. In that situation the keyboard still supports
native signs/letters, while suggestions remain limited. Large dictionary
payloads are no longer part of the app shell's atomic service-worker install.

See the original libraries' SOURCE/NOTICE files for dataset attribution and
redistribution constraints. Neither a Git SHA nor a checksum by itself grants
rights to redistribute external materials.
