---
name: Clone Lens
description: The Bench — every screen is the comparator's instrument table. Two code sources are lit paper plates laid on a warm charcoal bench; one signal colour marks everything the instrument has measured; structure is drawn with hairlines and engraved tick scales, never with shadows.
colors:
  bench-base: "#262624"          # --bench-base · the ground every screen sits on (also --background)
  bench-raised: "#2e2e2b"        # --bench-raised · top bar, panels, popovers, dialogs (also --card)
  bench-well: "#1d1d1b"          # --bench-well · inputs on the bench, meter tracks (also --muted)
  bench-hair: "#3b3b38"          # --bench-hair · the hairline every rule and frame is drawn with (also --border)
  bench-hair-strong: "#4a4a46"   # --bench-hair-strong · control outlines, segment frames, minor ticks (also --input)
  bench-tick: "#6b6a65"          # --bench-tick · major ticks, hollow lamps
  text-primary: "#e8e6e1"        # --text-primary · readings, titles, the lens of the mark (also --foreground)
  text-secondary: "#a5a39d"      # --text-secondary · body copy, nav at rest
  text-muted: "#908e88"          # --text-muted · labels, meta, placeholders on the bench
  text-faint: "#75736e"          # --text-faint · ordinals at rest, kbd hints
  signal-base: "#f2532a"         # --signal-base · THE colour: fills, needles, the L of the mark, primary buttons (also --primary)
  signal-on-bench: "#ff6a3d"     # --signal-on-bench · the signal as small text on the bench (hot tags, links on hover)
  signal-on-plate: "#b8391a"     # --signal-on-plate · the signal as small text on a plate (region labels)
  plate-base: "#f4f2ec"          # --plate-base · the lit paper code is laid on (also --code-surface)
  plate-strip: "#ebe9e2"         # --plate-strip · the plate's header strip
  plate-hair: "#d9d6cd"          # --plate-hair · hairlines on a plate
  plate-ink: "#1b1b19"           # --plate-ink · code and titles on a plate; the text ON the signal (also --primary-foreground)
  plate-ink-soft: "#5e5c56"      # --plate-ink-soft · comments, secondary text on a plate
  plate-gutter: "#6b6962"        # --plate-gutter · line numbers
  plate-placeholder: "#9c9a93"   # --plate-placeholder · placeholders on a plate
  plate-well: "#ffffff"          # --plate-well · inputs on a plate
  plate-well-stroke: "#c9c6bc"   # --plate-well-stroke · input and segment outlines on a plate
  plate-meter: "#e1ded4"         # --plate-meter · the byte meter's track
  match-band: "#fbddd3"          # --match-band · matched-region rows on a plate
  match-guard-band: "#eceae3"    # --match-guard-band · unmatched "guard" rows
  match-guard-marker: "#a9a69c"  # --match-guard-marker · the guard row's 3px marker
typography:
  display:
    fontFamily: "Sofia Sans Extra Condensed, Sofia Sans, system-ui, sans-serif"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.01em"
    textTransform: "uppercase"
    sizes: "208px combined reading · 72px plate title · 44px reading cell"
  statement:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.1
  verdict:
    fontFamily: "Sofia Sans"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.05
  page:
    fontFamily: "Sofia Sans"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: "Sofia Sans"
    fontSize: "14px · 15px/1.55 large · 12.5px small · 13px compact"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Sofia Sans"
    fontSize: "11px · 10px small · 9.5px tag"
    fontWeight: 600
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, Consolas, monospace"
    fontSize: "11px meta · 10px ordinal (tracking .06em) · 12px filename · 13px value · 12.5px/21px code"
  arabic:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    note: "Replaces every Latin face under html[lang=ar] with tracking reset; code and machine values stay in IBM Plex Mono, LTR."
rounding:
  control: "2px on every control, plate, tag, well and button"
  round: "only dots, rings and the registration crosshair"
spacing:
  base: "4px grid"
  page: "1440px working width · 40px margins (px-10) · 28px above the page header"
  rows: "46px ledger rows · 40px metric/lamp rows · 36px table heads · 32px signal rows · 28px section heads · 21px code lines"
---

# Design System: Clone Lens

## 1. Overview

Clone Lens is a **code-similarity comparator**. The interface is the comparator's
bench: a warm charcoal instrument table on which two code sources are laid as lit
paper **plates**, measured, and read off an engraved 0–100 **scale**. One colour —
the **signal** — marks whatever the instrument has measured: the needle, the fill,
the matched regions, the flagged tag, the L in the mark. Everything else is ink on
the bench: hairlines, tick scales, tracked labels and monospaced machine values.

The design file (Figma "Clone Lens") defines four screens — **Sign in**, **New
comparison**, **Verdict**, **History** — and a Components page. This document is
their written form; `code-sleuth-react-ui/src/index.css` is the executable one.

Rules that never bend:

- **One look.** The bench is always lit from above. There is no light theme; both
  theme classes resolve to the same palette so a stored preference can never
  produce an undesigned surface.
- **One signal colour.** Nothing else is coloured. Categorical charts use the
  signal first and then the bench greys.
- **Code lives on a plate.** Every code surface is `--plate-base` with plate ink,
  a 3px marker column, a 41px gutter and 12.5/21 IBM Plex Mono. Never code on the
  dark bench.
- **Primary buttons are signal fill with ink text.** Never white on the signal.
- **Structure is drawn.** Hairlines, rules and tick scales; no shadows, no
  gradients, no glows, no washes.
- **Colour is never the only channel.** A tag carries its word, a lamp its label
  and value, a scale its numeral, a matched region its `R1` label.
- **The reading is honest.** The needle sits at the measured value; the threshold
  post sits at the real threshold (80); "n of 5 signals agree" counts real
  signals; nothing on a screen is decorative data.
- **Machine identifiers are frozen.** `codesimilar.*` storage keys and token
  salts, `codesimilar_*` metrics, `CODESIMILAR_*` CI variables, API paths and
  form field names never change with the visual identity.

## 2. Colors

### Surfaces

| Surface | Token | Use |
| --- | --- | --- |
| Bench | `--bench-base` | the page ground |
| Raised bench | `--bench-raised` | top bar, panels, dialogs, popovers, connector chips |
| Well | `--bench-well` | inputs and meter tracks on the bench |
| Hairline / strong | `--bench-hair` / `--bench-hair-strong` | rules, frames / control outlines, minor ticks |
| Tick | `--bench-tick` | major ticks, hollow lamps |
| Plate | `--plate-base` · `--plate-strip` · `--plate-hair` | the lit paper, its header strip, its rules |
| Plate wells | `--plate-well` / `--plate-well-stroke` | inputs and segment frames on a plate |

### Text

Bench: `--text-primary` (readings, titles), `--text-secondary` (body, nav at
rest), `--text-muted` (labels, meta), `--text-faint` (ordinals, kbd).
Plate: `--plate-ink`, `--plate-ink-soft`, `--plate-gutter`, `--plate-placeholder`.

### The signal

`--signal-base` is a fill colour. As small text it needs its two cuts:
`--signal-on-bench` on the bench and `--signal-on-plate` on a plate (both
≥ 4.5:1 against their surface).

### The similarity scale

Three bands, one threshold. They are typographic tags, not colours:

| Reading | Band | Tag | Fill |
| --- | --- | --- | --- |
| < 50 | neutral | `NO CLONE` — hairline, muted text | tick-toned ("quiet") |
| 50 – 79 | advisory | `ADVISORY` — secondary outline and text | signal |
| ≥ 80 | hot | `FLAGGED` / `TYPE-n` — signal outline and text | signal |

The threshold is **80 / 100** everywhere (scale post, CI gate, history readings).
The shadcn `--warning` token is retained for compatibility only and is never
used as small text.

### Matched regions

On the comparator plates, matched rows take `--match-band` with a signal marker
and an `R1…Rn` label; unmatched guard rows take `--match-guard-band` with a
`--match-guard-marker` marker and the words "no match".

### Charts

`--chart-1` signal, then `--chart-2…5` the bench greys from primary text down to
faint. Grid lines are `--bench-hair`; axis text is 11px mono muted; tooltips sit on
`--bench-raised` with a hairline.

## 3. Typography

Three families, each with one job:

- **Sofia Sans** — the UI voice: statements, page titles, verdict titles, body,
  tracked labels, buttons, nav.
- **Sofia Sans Extra Condensed** (ExtraBold, line-height .86, uppercase) — the
  display cut for readings: the 208px combined similarity, the 72px plate title
  ("SIGN IN"), the 44px reading cells, the 404.
- **IBM Plex Mono** — code, meta lines, filenames, ordinals, machine values,
  timestamps, kbd hints. Never for prose.
- **IBM Plex Sans Arabic** replaces every Latin face under `html[lang="ar"]`
  (tracking reset, no uppercase); code and mono values stay LTR in Plex Mono.

Classes (in `index.css`): `.t-display` `.t-statement` `.t-page` `.t-verdict`
`.t-h1…h5` · `.body-lg` `.body-compact` `.t-body` `.t-sm` `.t-xs` · `.label`
`.label-sm` `.label-tag` · `.mono-meta` `.mono-meta-sm` `.mono-ordinal`
`.mono-filename` `.mono-value` `.mono-code` · `.ui-nav` `.ui-control`
`.ui-button` `.ui-wordmark`. Legacy names (`.t-hero`, `.t-label`, `.press-slug`,
`.t-stat`, `.t-mono`) alias onto these so older pages keep compiling.

## 4. Geometry

- **Radius 2px** on every control, plate, tag, well, button and panel
  (`--radius-control`; the whole Tailwind radius scale is wired to it). Only
  dots, rings and the registration crosshair are round.
- **Hairlines, not shadows.** Every shadow token is `none`. Overlays draw a
  strong hairline. Hover states change a border tone or a text tone, never a
  background wash.
- **Scales.** 51 engraved ticks spread with space-between (every fifth one
  major: 12px `--bench-tick`, minors 6px `--bench-hair-strong`); a 2px signal
  fill along the baseline to the value; a 2px needle standing at it; a dashed
  1px `--text-secondary` post at the threshold. The vertical rail on the sign-in
  screen is the same scale turned upright (100 top, 0 bottom).
- **Meters.** Quota: 64×8 well with hairline and signal fill. Plate bytes: 80×6
  `--plate-meter` track with ink fill.
- **Lamps.** 10px squares: signal-filled when a check fires, hollow tick border
  when it does not.

## 5. The kit

`src/components/bench/Bench.tsx` renders the design file's components 1:1;
`src/components/bench/icons.tsx` carries the exported 16px stroke icons verbatim
(1.5px, square caps, `currentColor`); `src/components/dossier/Dossier.tsx` keeps
the older composition names (`Masthead`, `Panel`, `Field`, `SectionHead`,
`SpecList`, `Figure`, `Stamp`, `OverprintMeter`, `ScaleRuler`…) but renders them
in the bench voice, so every page shares one vocabulary.

| Component | What it is |
| --- | --- |
| `TopBar` | 56px raised bar: lockup (22px mark + wordmark), numbered mode tabs `01 Compare · 02 History · 03 Analytics · 04 Analyst · 05 API` (active = 2px signal underline), quota meter, plan chip, avatar menu (Home, Billing, Settings, Help, admin routes, language, sign out). |
| `AuthShell` | The access screen: 56px rail, 520px statement column, the ACCESS plate centred on the remaining bench, legal links bottom-right. `PlateTitle`, `PlateField`, `PlateNotice` compose the plate. |
| `Plate` · `PlateHeader` · `PlateFooter` · `PlateMeter` | The lit paper: 40px strip (label + mono filename + segments or meta), body, 32px mono footer. |
| Code rows | `.code-line` = 3px marker · 41px gutter · code text; `.is-match` / `.is-guard`; `.code-region` labels. The editor overlays a transparent textarea on the highlighted rows (`Analysis.tsx`). |
| `Scale` · `ScaleTicks` · `ScaleRail` · `ScaleNumerals` | The instrument. `quiet` draws the fill in tick tone for readings under 50. |
| `Tag` (`hot` / `advisory` / `neutral`) | Squared verdict label, 9.5px tracked caps. |
| `Lamp` | Clone-type check row: square + label + mono value. |
| `SegmentGroup` / `Segment` | Segmented control; 28px cells on the bench (active inverts to primary text), 24px on a plate (active inks). |
| `BenchSelect` | Label + value + chevron in a hairline box over a native select; default 36px, large 40px. |
| `BenchButton` / `Button` | Primary = signal fill + ink text; secondary/disabled = hairline; 40px default, 46px large; `Kbd` trailing hints. |
| `Reading` | Ruled reading cell: label, 44px display numeral, mono note. |
| `well` / `plate-well` | 36px dark search/input box on the bench; 44px white input on a plate. |
| `BrandMark` / `BrandLockup` | The approved mark, sized by height (1.31:1); lens = primary text, L = signal. |

## 6. Page compositions

**Sign in** — rail 56px (100 / 50 / 0) · statement column 520px with the lockup at
the top, "Code-similarity comparator." (32/600) with the body and the ruled scope
note vertically centred, and the calibration strip (`v1.0 · 15 languages ·
calibration 2026-07`) at the foot · the ACCESS plate (520px) centred in the
remaining bench: 40px strip (`ACCOUNT` / `PLATE 00 · ACCESS`), 72px display
title + 14px qualifier, 44px wells with 11px labels, 46px primary button with a
trailing arrow, hairline footer (`No account yet? Create one` / `2FA prompt
follows if enabled`). Verify-email and reset-password reuse the same plate.

**New comparison** — header (kicker `COMPARATOR`, 26px title; right: plate
status, `LANGUAGE` select, `Run comparison ⌃↵` — hairline until both plates are
loaded, then signal) · two 576px plates with a 48px spine and the swap control ·
plate strip = `PLATE A` + filename + `PASTE FILE ZIP SHEET` segments · code rows
from y+14 · footer `13 lines · 402 B · UTF-8` / `402 B of 2 MB` + meter · status
line: the signal roster on the left, `clone threshold 80 · calibrated 2026-07 on
labeled set` on the right.

**Verdict** — breadcrumb bar (`Compare / Verdict #id`, saved-at, Re-run · Share ·
Export PDF) · verdict block: 208px reading over the 36px scale with the threshold
post and 0/50/100, beside the 40px verdict title, `TYPE-n` tag, confidence line
and the five-signal table (weights .20/.25/.25/.15/.15) · comparator (side by side
/ overlay / blink) on two plates joined by numbered connectors · `WHY THIS
VERDICT` ruled rows (ordinal · statement · mono evidence) · `CLONE-TYPE CHECKS`
lamps, 2×6 · metrics ledger (Metric / Plate A / Plate B / Δ) beside the
`ANALYST NOTE` · footer strip in mono with `Open in History` / `Ask the Analyst`.

**History** — header (`ARCHIVE` / History, `Export CSV`) · four ruled readings
(`TOTAL COMPARISONS`, `THIS MONTH`, `CLONES FLAGGED`, `MEDIAN READING`) · filters
(300px search well, `LANGUAGE` / `VERDICT` / `RANGE` selects, `Clear`, `n
results`) · ledger: 36px head, 46px rows (`#` mono muted · date mono · `A`/`B`
filenames · lang · 110px scale + value · tag · `Open` `Re-run`) · 48px pagination
(`1–10 of 128`, 32px chevrons).

Every page starts 28px under the top bar with a kicker label and the page title;
every section opens with a tracked label; every table is ruled, never boxed.

## 7. Motion

One motion: the needle settling on its reading (`animate-needle-in`, 600ms,
ease-out). Everything else is a 150–200ms colour transition. Blink mode in the
comparator alternates plates every 700ms and falls back to a manual A|B toggle
under `prefers-reduced-motion`, which also disables every animation globally.

## 8. Do's and Don'ts

### Do

- Lay code on a plate; lay readings on the bench.
- Open every section with a `label`; rule rows with `--bench-hair`.
- Show the numeral next to every scale and the word inside every tag.
- Keep programming-language names and code LTR under Arabic.
- Size the mark by height and keep the L in the signal colour.

### Don't

- Don't add a second accent, a gradient, a glow, a shadow or a wash.
- Don't put white text on the signal, or the signal as small text without its cut.
- Don't round anything but dots and rings.
- Don't invent data to fill a slot the design shows — omit the slot.
- Don't rename a machine identifier to match a visual rename.
