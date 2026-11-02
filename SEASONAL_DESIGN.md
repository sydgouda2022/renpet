# Renpet seasonal art direction

Renpet is a local-first Egyptian calendar, not a historical book or a stack of
picture cards. Its three Egyptian seasons are the atmosphere of the calendar
surface. No human figures, temple subjects, or external image requests are used.

## Source art and meaning
- **Akhet** — blue Nile water, papyrus and water lilies.
- **Peret** — vivid green plants, young crops and small flowers.
- **Shemu** — golden ripe wheat, date palms and harvest colors.

The locally packaged WebP source landscapes are preserved in
`web/assets/seasons/`. Renpet's icon is the gold Shen rope on green;
the Y3 symbol belongs to Mdwnfr and is unrelated to Renpet.

## Rendering and responsive composition

The main calendar scroll is a single vertical line. Each month/day panel owns
its season landscape; there is no global ghost background behind the rail.

On iPhone and iPad, paint the source at **100% available width** rather than
`cover`, which would crop the botanical edges of a landscape source on phones.
Fade the decorative frieze and the scene edges using a CSS mask; floral
details remain at the bottom while the center stays a legible writing field.
Adjacent panels share neutral parchment at their edges, reducing seams as the
user scrolls across month and season boundaries.

The Month view uses a translucent parchment field over the same artwork.
The Day timeline uses a slightly denser writing field to preserve readability
through the 24-hour ruler. Year stays in one viewport, with the twelve
month squares arranged under three seasonal botanical backgrounds; the
seasonal groups have no thick framing borders or drop shadows.

## Lighting

One local real-time clock drives the light in Year, Month and Day, including
when the day timeline is scrolled. Lighting is an interpolated continuum, not
a set of day/night cards, and never applies filters to appointment text.
If the dynamic-lighting preference is off, every seasonal artwork retains
its normal daylight colors.

## Layout, accessibility and tests

Navigation remains three buttons at top-left, a timeframe button at top-right,
and Today/Appointments at the bottom. The Month is the default view. Arabic
uses seven-day weeks by default; Coptic and Egyptian hieroglyphs use ten-day
weeks, without changing the overall Month writing-surface dimensions.

Automated acceptance checks inspect botanical source availability, CSS
background geometry, gradient masks, per-season assets, legible calendar
surfaces, continuous scroll, date interaction, device widths, year fit,
clock lighting, offline availability and phone/tablet WebKit rendering.
Screenshots are retained as CI evidence for visual inspection. Final visual
judgment on real devices remains separate from automated geometry tests.
