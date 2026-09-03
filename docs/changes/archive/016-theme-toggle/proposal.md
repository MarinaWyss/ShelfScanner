# 016 — A dark/light toggle, and readable olive in the dark

Status: asked for and built 2026-09-03 (Marina: "We need a dark to light
toggle. Also in dark mode the dark green (like 'how it works') is too dark
to read")
Date: 2026-09-03
Spend cap: $0
Track: app

## What changes

- **The toggle**, in the header before Contact, as v1 had it
  (`ThemeToggle.tsx`): a moon and "Dark" in the light, a sun and "Light" in
  the dark; the label hides on narrow screens like Contact's. The choice is
  kept in the device's `localStorage` under `theme`.
- **How the theme is decided**: a script in the head, before first paint,
  sets `data-theme` on the root to the stored choice, else to the system
  setting. The dark tokens are keyed on `[data-theme="dark"]` only, so the
  toggle wins in both directions and nothing flashes. Without JavaScript
  the page is light.
- **Olive as text in the dark**: every place olive-dark was a text colour
  (headings like "How It Works", small-caps labels, links, the "Why This
  Matches You" label, the date rule, the placeholder cover mark) now reads
  through a new `--olive-text` token: olive-dark in the light, a pale sage
  (`#b9c49a`) in the dark. Olive-dark stays a background colour (the
  primary button's hover, "Saved to List").

## How we know it worked

| Question | Pass | Result |
|---|---|---|
| Toggle | flips `data-theme`, swaps the label, survives a reload and a navigation | `test_the_theme_toggle_flips_and_is_remembered` |
| Readable | dark screenshots of the home, preferences and results pages | done |
| Nothing else moved | the suite | 396 passed |
