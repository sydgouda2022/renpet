# Renpet — public and personal occasions

Renpet is a practical Egyptian calendar, not a reconstructed religious calendar.
It displays contemporary Egyptian national anniversaries and the social holiday
Sham El Nessim. Ancient temple-specific festivals are not bundled or displayed.

The single read-only public source is `web/festival-packs/national-egypt.json`.
Its annual Gregorian dates represent the commemorations themselves, not
government-transferred days off. Sham El Nessim is calculated as the Monday
after the Coptic Easter date; this does not make it a Christian festival.

The **Egyptian occasions** setting shows or hides these public dates,
independently of whether Gregorian dates are visible.

## Personal occasions

The user can create birthdays, wedding anniversaries, and other private
occasions through **Add → Personal occasion**. They are all-day events held
in local calendar storage, and are never part of the read-only public source.
The user chooses the annual date basis:

- Gregorian annual: repeats on the same Gregorian day/month.
- Egyptian annual: repeats on the same Alexandrian Egyptian day/month.
- Once: does not repeat.

An occasion on 29 February or the sixth epagomenal day occurs only in years
that actually contain that date; Renpet does not invent a replacement day.

Personal occasions remain visible when public observances are hidden.
They are included in the existing local JSON/ICS backup/export workflow.
The app does not upload personal occasions to any external provider.
