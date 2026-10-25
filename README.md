# Renpet — Egyptian Calendar

Independent Egyptian calendar, appointments, and festivals PWA. Arabic, Coptic
and hieroglyphic user interfaces, Alexandrian year system, season artwork,
offline first-run setup, calendar backup/restore and ICS exchange.

## Keyboard architecture

Renpet consumes two **independent headless programming APIs** rather than
maintaining copies of keyboard logic:

- [Coptic Keyboard](https://github.com/sydgouda2022/coptic-keyboard)
- [Hieroglyphic Keyboard](https://github.com/sydgouda2022/hieroglyphic-keyboard)

See [KEYBOARD_DATA_SOURCES.md](KEYBOARD_DATA_SOURCES.md) for the exact integration
boundary, pinned dependencies, source limitations and storage ownership.

## Build and verify

```sh
python tools/sync_keyboards.py --verify
bash tools/build_release.sh
node --test tests/*.test.mjs
```

Serve `web/` over HTTPS or localhost. Offline Home Screen installation needs
one online service-worker activation. Each keyboard dictionary is verified
separately and does not block the calendar if unavailable.

The primary GitHub Actions workflow runs unit and browser acceptance before
Cloudflare deployment, which remains disabled unless the repository variable
`CUTOVER_ENABLED=true` is explicitly configured.

The source originally split from `sydgouda2022/aaa/renpet`.
