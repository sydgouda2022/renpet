# Renpet Native-script Keyboards — Verified Sources and Behavior

## Current source-backed lexicons (2026-10-24)

- **Coptic:** 20,652 distinct written surfaces, with Sahidic/Bohairic classification only where source evidence supports it. From KELLIA Comprehensive Coptic Lexicon v1.2 TEI, Coptic SCRIPTORIUM and the pinned KELLIA popular-form supplement. CC BY-SA 4.0 and respective attribution requirements apply.
- **Late Egyptian:** 41,330 SQLite spelling records representing **40,265 distinct Unicode hieroglyphic written forms**. Compiled from source-pinned TLA Late Egyptian v19 and AED crosswalk, eight explicitly screened AES literary documents (seven supply complete Unicode spells), and the CC BY 4.0 MaReTE Ramses word model, which contributes **34,144 new sign-sequence forms** beyond the original 7,186 records.
- **Verified lemmata:** 3,129 TLA/AES lemma identities; the additional Ramses corpus forms have **unverified lexical identity**, never an invented TLA lemma or meaning. Keyboard provenance badges **LE** (lemmatized sources) and **RTC** (Ramses model, unlinked) clearly distinguish those source tiers.
- **Incomplete encodings:** 10,930 model encodings did not fully map to Unicode sign names and were excluded. No partial word, damaged glyph, invented completion or transliteration-only record enters the suggestions.
- **PWA runtime:** Both dictionaries download automatically, are verified by SHA-256 and cached offline with rollback on corruption. The canonical SQLite master is built and checked in CI; the browser receives the matching verified JSON projection, not the larger unneeded SQLite binary. Neither lexicon installer touches appointments, documents, settings or personal keyboard learning.

## Input and prediction rules

- Coptic uses a native Unicode alphabet and optional Sahidic/Bohairic selection.
- Hieroglyphic input uses uniliteral/biliteral/triliteral sign pages with native numerals; no transliteration is required.
- The raw user-typed spelling is always the first suggestion; other suggestions come from source records or explicitly tagged local personal learning. No silent correction.
- Indexed prefix lookup, device-local learning and context-frequency ranking are supported; these do **not** establish comprehensive morphological coverage.
- MdwNfr retains its separate quadrat-based text composition and its own Python ranking while sharing the source-backed Late Egyptian release.

## Evidence and required attribution

- [TLA Late Egyptian premium v19](https://huggingface.co/datasets/thesaurus-linguae-aegyptiae/tla-late_egyptian-v19-premium), CC BY-SA 4.0.
- [AED-TEI](https://github.com/simondschweitzer/aed-tei) and [AES](https://github.com/simondschweitzer/aes), CC BY-SA 4.0; only document-reviewed Late Egyptian AES records are accepted.
- [University of Helsinki MaReTE Transliteration Models](https://github.com/MaReTEgyptologists/TranslitModels), CC BY 4.0; Heidi and Tommi Jauhiainen, derived from Serge Rosmorduc's Ramses Transliteration Corpus, which itself credits the original Ramsès research contributors.
- [KELLIA Comprehensive Coptic Lexicon](https://github.com/KELLIA/dictionary) and [Coptic SCRIPTORIUM](https://github.com/CopticScriptorium), respecting separate upstream data-use conditions.

Counts represent available written forms, **not** the total historical vocabulary. Neither lexicon is certified exhaustive.

## Renpet 7 runtime, backup and release contract

- The canonical browser prediction engine is `shared-language/src/keyboard_search.mjs`. `renpet/tools/build_release.sh` compiles the pinned source inventories and copies the same engine into the deployed PWA; mobile QA and production use the same script.
- The browser installs individually verified Coptic and hieroglyphic JSON releases into independent IndexedDB databases, with checksum verification and rollback. The large SQLite Egyptian master is validated during the build but **not served as a Cloudflare static asset**.
- Local keyboard learning, Coptic dialect preferences, and personal appointment data are kept separate from the lexicons. The Renpet JSON backup includes keyboard learning and two recent personal scheduler recovery snapshots when available.
- GUI localization lives in `ui-words.js`; responsive week, agenda and hieroglyphic numeral styles live in `calendar-layout.css`. No language mode requires transliteration.
- Release URLs are stamped from the authoritative `data.json.version` and content hashes of all linked JS/CSS, eliminating manual cache-buster edits.
- Each named open dataset has attribution or share-alike requirements; the pinned sources and their terms must continue to be respected. Hash pinning alone does not confer redistribution rights.
