# 015 — The warm look on the v1 structure

Status: asked for and built 2026-09-03 (Marina: "I like the structure. I'd
like to change the colors, font, and vibe while keeping the structure the
same", with a design file, and "keep the current simple book icon instead
of using the one in the design file")
Date: 2026-09-03
Spend cap: $0
Track: app

## Why

014 gave the app v1's pages, words and flow in v1's white-and-violet look.
Marina drew the look she wants for it: the "ShelfScanner Warm Redesign"
artifact, five phone artboards (home, scanning, results, saved,
preferences) in paper and olive with a serif for headings.

## What changes

The stylesheet in `base.html` only; every template, class name, route and
test stays as 014 left it.

- **Tokens** from the design file, verbatim: paper `#f6f0e2`, paper-deep
  `#ece0c4`, ink `#2b2620`, muted `#6f6a58`, line `#d8c9a0`, olive
  `#47532f`, olive-dark `#363f24`, moss `#6b7a49`, sage `#a9b48a`,
  terracotta `#a8502f`, brass `#b4863a`, cream `#faf6ec`. A dark set is
  derived for the system dark mode (the design has none): the same hues on
  an ink-dark paper.
- **Type**: Domine (500 to 700) for headings, the brand, pick titles and
  the stepper numbers; Karla for everything else; both from Google Fonts
  with system fallbacks.
- **Surfaces**: the page is paper; the outer cards are cream with a hairline;
  the inner cards (How It Works, the Goodreads card, the upload box, the
  pick and reading-list cards, the empty state) are paper-deep with the
  design's diagonal hatch; buttons are olive with cream text, 10 px
  corners, Karla 700; outline buttons are a 1.5 px line; Save for Later is
  moss, Saved to List olive-dark, Remove terracotta on a line.
- **Details from the artboards**: the brass-ruled small-caps label
  ("SELECT YOUR FAVORITE GENRES", "DATE ADDED"), chips with a 1.5 px line
  that fill olive when chosen, italic placeholders on paper-deep inputs,
  the olive stepper, the moss pulse on the active stage.

### Not taken from the design

- The stacked-books brand mark: the outlined book from 014 stays (Marina).
- The design's own page structure (a top nav of text links, one column, a
  plant illustration): the structure is 014's.
- The favicon is unchanged.

## How we know it worked

| Question | Pass | Result |
|---|---|---|
| Fonts | Domine and Karla resolve in the browser | `document.fonts.check` true for both |
| Structure untouched | the 014 suite passes with no test changed | 395 passed |
| Both widths | screenshots at 390 and 1280 px of every page | done |
