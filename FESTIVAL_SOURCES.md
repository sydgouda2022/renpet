# Renpet festival sources

Festival sources are independent, selectable, read-only overlays; appointments, birthdays and reminders use separate personal calendars.

## Available catalogs

| ID | Collection | Recurrence |
| --- | --- | --- |
| `amun-theban` | Ancient Egyptian Theban Amun festivals | Egyptian fixed dates, documented sources |
| `esna-khnum` | Selected Esna festivals (Khnum and Neith) | Egyptian fixed dates, documented sources |
| `isis-philae` | Selected Isis/Philae observances | Egyptian fixed dates, documented sources |
| `national-egypt` | Egyptian national and civic observances | Gregorian anniversary dates and Sham El Nessim |

Islamic and Christian festival **catalogs and selection options are removed**. Older `renpet.settings.v1.festivalSources` arrays referring to `muslim-egypt` or `christian-coptic` are filtered to supported IDs. Personal user-created events are never removed or changed.

The catalog loader also rejects those retired source IDs and Christian/Islamic source categories when an installed app returns an older cached registry. Retired packs are not fetched, selected, enabled by default, or used to generate festival overlays. Cached catalogs cannot restore the removed options; retained ancient Egyptian and national sources remain extensible.

### Sham El Nessim

`sham-el-nessim` remains in `national-egypt` because it is an Egyptian national spring observance. Its date is the Monday after Coptic Orthodox Easter, calculated from the Julian ecclesiastical computus. The calculation in `festival-dates.mjs` **is not** a separate Christian festival source and must remain available. It describes the calendar date, not changes to officially designated days off.

### Dates and sources

The list is partial and no invented festival dates should be added. Ancient festival dates are mapped onto the current Alexandrian calendar as modern projections, not assumed fixed throughout all ancient eras. The original source references remain available from the event details, with modern editorial Coptic and hieroglyphic labels. The sources are not translations of attested full ancient texts. National anniversary dates are not silently shifted to the date of an official public holiday.

Newly discovered or curated catalogs may be added as a descriptor in `web/festival-sources.json` with matching event pack `web/festival-packs/<id>.json`. Use supported `calendarRule` and cite sources. By default only `amun-theban` is selected. Festival display is independent of Gregorian date-label visibility and of the 7-/10-day grid configuration.

Release tests cover all four source options, native-script descriptions, Sham El Nessim, source filtering, and personal appointment isolation.

