# Renpet data integrity and interoperability

Renpet keeps appointments and settings on the device. Coptic and hieroglyphic
lexicons install independently, are integrity checked, and do not block calendar
startup. Dictionary hashes verify received bytes, not upstream authorship or
licensing rights.

## Export and import

- A Renpet JSON backup is the lossless preferred migration format. Save one
  before experimenting with ICS imports or replacing a device.
- ICS exchange supports dates, floating/UTC and ordinary IANA-zone times,
  daily/weekly/10-day rules, occurrence exclusions, and the five supported
  display-reminder offsets. Unknown zones, ambiguous DST wall times, advanced
  recurrence rules and cancellations are skipped and counted rather than guessed.
- Egyptian monthly/yearly recurring events export as separate appointments
  within the entire supported calendar range, not an incorrect Gregorian RRULE.
  Very large exports can exceed receiving applications' import limits.
- Native alarm delivery is foreground-only. A closed PWA cannot guarantee
  notifications without a separately deployed push service.

## Recovery and offline operation

- If the primary local appointment state is damaged, Renpet displays a warning
  and shows any verified snapshot read-only. Saving is blocked until the user
  explicitly restores a snapshot through the Backup panel.
- Original damaged bytes are retained separately when restoration is attempted.
  Export them from the same panel for forensic or manual recovery.
- The offline boot cache contains the executable application, language fonts,
  season backgrounds and frequently used Egyptian numerals. Other numeral
  images populate the cache on demand; the browser's text alternative remains.
- Service-worker script, module and style fallbacks never cross into an older
  app release. Runtime assets may still require an initial online visit.

The source repository is the authority for supported constraints and defaults;
do not mistake an ICS exchange file for a lossless Renpet backup.
