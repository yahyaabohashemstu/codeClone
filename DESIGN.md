---
name: Clone Lens
description: A precision code-similarity instrument — a calm, calibrated readout that shows its work.
colors:
  signal-blue: "#405ce7"         # --primary · hsl(230 78% 58%) · the one accent — primary actions, selection, focus, the primary signal
  on-blue: "#ffffff"             # --primary-foreground · hsl(0 0% 100%) · white set on the blue fill (light)
  ink: "#131826"                 # --foreground · hsl(222 34% 11%) · body + heading text (near-black slate)
  slate-mute: "#5e6878"          # --muted-foreground · hsl(218 12% 42%) · secondary text, labels, captions
  canvas: "#f9fafb"              # --background · hsl(220 24% 98%) · app body (cool grey-white)
  surface: "#ffffff"             # --card / --surface-1 · hsl(0 0% 100%) · panels, cards, inputs (crisp white)
  hairline: "#e0e4eb"            # --border · hsl(220 20% 90%) · dividers, borders (cool hairline)
  neutral-fill: "#eff1f5"        # --secondary · hsl(220 24% 95%) · secondary buttons, neutral badge fill
  success-pass: "#2c9664"        # --success · hsl(152 55% 38%) · low-similarity / pass (green)
  warning-review: "#d38612"      # --warning · hsl(36 84% 45%) · mid-similarity / review (amber)
  flag: "#d94136"                # --destructive · hsl(4 68% 53%) · high-similarity / flagged (red)
  code-surface: "#f5f7fa"        # --code-surface · hsl(222 28% 97%) · code + data readouts
typography:
  hero:
    fontFamily: "Inter, IBM Plex Sans Arabic, system-ui, -apple-system, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, IBM Plex Sans Arabic, system-ui, -apple-system, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, IBM Plex Sans Arabic, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, IBM Plex Sans Arabic, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, IBM Plex Sans Arabic, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.08em"
  stat:
    fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, IBM Plex Sans Arabic, monospace"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, IBM Plex Sans Arabic, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"       # --radius-sm · status tags, badges, stamps, inline code
  md: "8px"       # --radius-md · buttons, small controls
  lg: "12px"      # --radius (0.75rem) · cards, panels, inputs (default)
  xl: "14px"      # --radius-xl
  2xl: "18px"     # --radius-2xl · large feature containers (ceiling)
  full: "9999px"  # dots, rings, meter tracks only
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.on-blue}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "rgba(64,92,231,0.9)"   # bg-primary/90
    textColor: "{colors.on-blue}"
  button-secondary:
    backgroundColor: "{colors.neutral-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-mute}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.flag}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.hairline}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  badge-status:
    backgroundColor: "rgba(211,134,18,0.18)"  # semantic hue at ~14–18% tint
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
    fontFamily: "{typography.title.fontFamily}"  # display voice (Inter) — see §5
---

# Design System: Clone Lens

## 1. Overview

**Creative North Star: "Instrument"**

Clone Lens is a precision measuring tool, not a marketing surface. Every screen is a calibrated readout: it reports what was measured, on what scale, and with how much confidence, then lays the evidence beside the number so a reviewer can act on it and defend the call. The visual system exists to make that reading trustworthy — Linear/Stripe rigor with a lab's exactness. Restraint is the aesthetic; the interface recedes and the evidence steps forward. "Premium" is carried by precision, spacing, and typographic care — universally, never by decoration.

The system speaks to an institutional reviewer under time pressure and, indirectly, to the student whose work is being judged. That raises the bar on legibility and fairness: a verdict shown without visible reasoning fails even when the number is right. So the ground is a cool grey-white canvas and near-black slate ink with a single working signal — a calibrated indigo-blue that stands for "act here / this is the current selection / the primary signal," never brand flourish. Type is calm and modern: prose and headings share one refined sans (Inter), while monospace is reserved for the precision data — code, labels, and numerals — so the readout reads like an authored instrument, not a generic dashboard.

The dark mode is **"Signal"**: a focused dark lab — matte charcoal ground, a cool bright-blue signal, controlled contrast. It is the same instrument at night, never a neon console.

This system is flat and clean by construction. It explicitly rejects decorative glow, gradients, glassmorphism, and neon — the "premium glow SaaS" costume that reads as generic and undercuts the instrument's credibility. Those anti-references are unchanged: the glow tokens are gone from `index.css`, the brand gradient is a no-op alias resolving to the solid accent, and `.glass` is not a resting surface. The target is the opposite: quiet cool surfaces, hairline structure, and color used only to carry meaning.

**Key Characteristics:**
- Cool grey-white canvas with near-black slate ink; one working signal (Signal Blue) used for meaning, not decoration.
- One type family for reading — Inter for both prose and headings; monospace reserved strictly for the precision data (code, labels, stats, numbers). IBM Plex Sans Arabic rides every stack for the full Arabic RTL surface.
- Near-flat elevation; a single soft cool neutral shadow marks true overlays, never a colored glow. Cards separate by hairline alone.
- Semantic similarity scale — green (low) → amber (review) → red (high) — applied consistently to scores, badges, rings, and radar.
- Modernised radii (6–18px); razor-sharp corners and toy over-rounding are both retired.
- Bilingual and RTL-correct by construction; code, data, and numeric axes stay left-to-right inside an Arabic layout.

## 2. Colors

A cool paper-and-ink ground with a single working accent and a three-stop similarity scale. Color is a measurement, not a mood. Every value below is authored in `index.css` as an HSL triple on `:root` ("Instrument", light) and `.dark` ("Signal", dark).

### The Accent — one signal
- **Signal Blue** (#405ce7 · `hsl(230 78% 58%)`): the single accent — primary buttons, current selection, focus rings (`--ring`), active nav tint, and the "primary signal" throughout. Its foreground pairing is **white** (`--primary-foreground`, #ffffff) in light. In "Signal" (dark) it brightens to a cool #478df5 · `hsl(216 90% 62%)`, and its foreground flips to a **dark navy ink** (#091425 · `hsl(216 60% 9%)`) — a deliberate high-contrast choice that keeps the bright-blue chip legible and calm rather than glowing. It is the interface's single loud voice; spend it deliberately.

Signal Blue means **action / current selection / focus / the primary signal** — it is *never* a similarity band. The only non-neutral hues in the system are this one accent and the three semantic similarity colors below. Everything else is cool canvas, slate ink, and hairline.

### Neutral
- **Ink** (#131826 · `hsl(222 34% 11%)`): all body copy and headings. Near-black slate; clears AA/AAA on the canvas even at small sizes. Dark: #e6e9f0 · `hsl(220 24% 92%)`.
- **Slate Mute** (#5e6878 · `hsl(218 12% 42%)`): secondary text, captions, table labels. Verified ≥4.5:1 on white and on the canvas — never lighten it "for elegance." Dark: #929aaa · `hsl(220 12% 62%)`.
- **Canvas** (#f9fafb · `hsl(220 24% 98%)`): the app body ground (cool grey-white). Dark: #0e1015 · `hsl(224 20% 7%)` (matte charcoal).
- **Surface** (#ffffff · `--card` / `--surface-1`): crisp white cards, panels, inputs. Tonal steps `surface-2` (`220 24% 97%`) / `surface-3` (`220 22% 94%`) layer panels without shadow. Dark: #191c24 · `hsl(223 18% 12%)`.
- **Neutral Fill** (#eff1f5 · `--secondary`, `hsl(220 24% 95%)`): secondary buttons and the neutral status tag. Dark: `hsl(222 14% 16%)`.
- **Hairline** (#e0e4eb · `hsl(220 20% 90%)`): borders and dividers. Structure is drawn with a 1px cool hairline, not a shadow. Dark: #2c303a · `hsl(222 14% 20%)`.
- **Code Surface** (#f5f7fa · `hsl(222 28% 97%)`): the ground for code blocks and data readouts. Dark: `hsl(224 24% 6%)`.

### Semantic — the Similarity Scale
- **Success / Pass** (#2c9664 · `hsl(152 55% 38%)`): low similarity, pass, healthy state. Dark: #36c987 · `hsl(153 58% 50%)`.
- **Warning / Review** (#d38612 · `hsl(36 84% 45%)`): mid similarity, needs review. Dark: #eca83c · `hsl(37 82% 58%)`.
- **Destructive / Flag** (#d94136 · `hsl(4 68% 53%)`): high similarity, fail, flagged. Dark: #f26467 · `hsl(359 84% 67%)`.

> Note: the review band (amber Warning) is a distinct token from the blue accent — they never touch in hue, so there is no risk of confusing "this score is mid-band" with "act here." Keep them apart in code by role (`--warning` vs `--primary`).

### Named Rules
**The One-Signal Rule.** Signal Blue carries no more than ~10% of any screen's pixels. It marks the one primary action or the current selection and then stops. Its rarity is what makes it read as "important," so a screen with three blue buttons has none.

**The Meaning-Only Color Rule.** Every non-neutral color must encode a fact — an action, a state, a similarity band. If a color is present only to look premium, delete it. Premium is the spacing and the type, not the hue.

**The Calibrated-Scale Rule.** Green → amber → red always maps to the same similarity bands (green &lt;50 / amber 50–79 / red ≥80), everywhere: score ring/dial, calibrated scale, badges, radar dots, history rows. A reviewer learns the scale once.

## 3. Typography

**Prose / Body Font:** Inter (with `IBM Plex Sans Arabic, system-ui, -apple-system, sans-serif`) — `--font-sans`
**Display Voice (headings):** Inter (same stack) — `--font-display`
**Data Font (code, labels, stats, numbers):** JetBrains Mono (with `Fira Code, Cascadia Code, IBM Plex Sans Arabic, monospace`) — `--font-mono`
**Arabic Font:** IBM Plex Sans Arabic (loaded for `html[lang="ar"]`, weights 400–700) — `--font-arabic`

**Character:** This is the big shift from the retired system. Headings and prose now share **one refined sans — Inter** — tuned with `cv02/cv03/cv04/cv11` for a precise, engineered read. The `.t-hero / .t-display / .t-h1…t-h5` utilities all resolve to `var(--font-display)`, which is Inter; `.t-body / .t-sm / .t-xs` stay on `var(--font-sans)`, also Inter. This deliberately **reverses** the old rule that headings were monospace — headings are now sans, and mono is pulled back to where it belongs.

**Monospace is reserved for the precision data only:** code and diffs, `.t-label` (mono uppercase labels and column heads), `.t-stat` (mono, `tabular-nums` — scores, counts, metrics), and inline numbers/scores. A code-forensics tool that speaks monospace *only at its numbers and labels* reads as an authored instrument; setting a heading or a paragraph in mono would be "terminal cosplay" and is a defect. Rule of thumb: **mono measures and labels; Inter reads.**

Under `html[lang="ar"]`, the mono data voice falls back to IBM Plex Sans Arabic (JetBrains Mono has no Arabic glyphs), so Arabic labels and stats keep the proper Arabic typeface. `index.css` scopes `.t-*` to the Arabic face under `html[lang="ar"]` so Arabic headings/labels never tofu, while code, data, and numeric axes stay LTR inside the RTL layout.

### Hierarchy
- **Hero** (`.t-hero` · Inter · 700, 4.5rem/`--fs-hero`, lh 1.05, -0.02em): marketing Home hero only. Never inside the product shell. `.t-display` is its fluid sibling (`clamp(3rem, 7vw, 6.5rem)`) for the Home cover.
- **Headline** (`.t-h1`/`.t-h2` · Inter · 700, 3rem→2rem/`--fs-h1`,`--fs-h2`, lh 1.15→1.2, -0.02em→-0.015em): page titles and major section heads.
- **Title** (`.t-h3`/`.t-h4`/`.t-h5` · Inter · 600, 1.5rem→1.125rem/`--fs-h3…--fs-h5`, lh 1.25→1.4): card and panel headings.
- **Body** (`.t-body` · Inter · 400, 1rem, lh 1.6): prose and descriptions; cap analysis prose at 65–75ch. Data-dense tables may run wider.
- **Small / Micro** (`.t-sm` Inter 400 0.875rem · `.t-xs` Inter 500 0.75rem): captions and dense secondary copy.
- **Label** (`.t-label` · mono · 600, 0.75rem, 0.08em, UPPERCASE): field labels and column heads — a utility, not a section eyebrow.
- **Stat** (`.t-stat` · mono · 700, 3rem/`--fs-h1`, lh 1, `tabular-nums`, -0.01em): big numbers — scores, counts, metrics.
- **Mono** (`.t-mono` · mono · 400, 0.875rem, lh 1.5): code, diffs, hashes; `font-variant-numeric: tabular-nums` for aligned metrics.

### Named Rules
**The Fixed-Scale Rule.** Product type is fixed rem, never fluid `clamp()`. A heading that shrinks inside a sidebar looks broken, not responsive. Only the Home hero (`.t-display`) may be fluid.

**The One-Sans / Reserved-Mono Rule.** Exactly one working sans (Inter) carries all reading — prose *and* headings — with hierarchy from weight (400/500/600/700) and size, not from a second display face. Monospace is not a second "voice"; it is a reserved instrument for the precision data (code, labels, stats, numbers). No third typeface, no decorative display face.

**The Mono-Is-Data Rule.** Mono must **never** run a heading or a paragraph. If a sentence of running text — or a page/section title — is set in mono, it is a defect. Mono appears only on code, `.t-label`, `.t-stat`, and inline numerals/scores.

## 4. Elevation

Flat by default, with soft structural shadows reserved for true overlays. Surfaces rest flat and are separated by the hairline border and tonal layering (`surface-1/2/3`). Cards do not carry a resting shadow at all — `.card-premium` and `.stat-card` are border-only, and their hover state *deepens the hairline* (`foreground / 0.22`) rather than lifting or glowing. The single soft, **cool neutral, uncolored** shadow appears only where an element genuinely floats above the page — dropdowns, dialogs, popovers. Depth marks structure, never adds atmosphere.

### Shadow Vocabulary
- **Rest** (`--card-shadow-rest: 0 1px 2px hsl(222 30% 12% / 0.05)`): a whisper-soft cool neutral shadow, reserved for true overlays — not applied to resting cards. Dark: `0 1px 2px hsl(0 0% 0% / 0.45)`.
- **Hover / Float** (`--card-shadow-hover: 0 6px 20px -6px hsl(222 30% 12% / 0.14)`): a slightly deeper, softly-spread version for floating layers (menus, dialogs). Dark: `0 8px 24px -6px hsl(0 0% 0% / 0.6)`.

Both use a cool slate base (`222 30% 12%`), not a warm one, and carry no hue of the accent.

### Deleted / retired (do not reintroduce)
- **Colored glow** (`--shadow-glow-*`, `--glow-shadow-*`, the `pulse-glow` animation, `.glow-primary`, `.glow-accent`): removed from `index.css`, not merely deprecated. Do not reference them as existing tokens.
- **Brand gradients** (`--gradient-brand`, `.bg-gradient-brand`, `.text-gradient-brand`): retired to the solid accent. `--gradient-brand` is a no-op alias resolving to `hsl(var(--primary))`, and a compat shim forces the readable `--primary-foreground` on any legacy element still filled with the brand color. New work uses `hsl(var(--primary))` directly, never a gradient.

### Named Rules
**The No-Glow Rule.** Shadows are neutral, cool, and structural. A shadow tinted with the accent hue, or any glow used as decoration, is forbidden. If it looks like the element is emitting light, it is wrong.

**The Structure-Over-Shadow Rule.** Reach for a 1px hairline or a tonal surface step before a shadow. A card uses **border _or_ shadow, never both** — and in this system a resting card uses the border. A shadow must justify itself by marking a real z-layer (an overlay), not by making a flat card feel "premium."

## 5. Components

Compose from the **Dossier kit** (`src/components/dossier/Dossier.tsx`) — the shared composition vocabulary: `Masthead`, `Panel`, `Field` / `FieldSheet`, `Figure`, `MetaStrip`, `Reading`, the `Ledger` family (`Ledger`, `LedgerHead`, `LedgerRow`, `LedgerCell`, `LedgerFooter`, `LedgerEmpty`, `LedgerFault`, `LedgerSkeleton`), `Tag` / `StatusTag` / `Verdict`, `Meter` / `ScoreMeter`, `Register`, `Notice`, and `SectionRule`. **Don't hand-roll tables, tiles, or badges** — the kit already encodes the tokens, the calibrated scale, and the RTL behavior.

### Buttons
- **Shape:** modern, 8px (`rounded-md` = `--radius-md`). Never pill-round a rectangular action button; never exceed ~14px (`--radius-xl`) on a button.
- **Primary** (`variant="default"`): solid Signal Blue fill with `--primary-foreground` text — **white** in light, **dark navy ink** in "Signal" (dark). `h-10`, `px-4 py-2`, `font-medium`. One primary action per view.
- **Hover / Focus:** hover settles the fill to `bg-primary/90` via a color transition (no transform bounce); focus-visible shows a 2px accent ring (`--ring`) with a 2px offset, never removed. `:active` settles the fill.
- **Secondary:** `--secondary` neutral fill (#eff1f5), ink text. **Ghost:** transparent, slate-mute text; cool `--accent` tint on hover. **Outline:** 1px `--input` border on the canvas. **Destructive:** red (#d94136) fill with white text, for irreversible actions only.
- **States are non-negotiable:** default, hover, focus-visible, active, disabled (50% opacity, `pointer-events-none`), and loading (inline spinner, label retained) all ship together.

### Cards / Containers
- **Corner Style:** 12px (`rounded-lg` = `--radius`) for cards, panels, and inputs; up to 18px (`--radius-2xl`) only for large feature containers. Never above 18px.
- **Background:** `--card` (#ffffff on the cool canvas). Tonal steps `surface-2` / `surface-3` layer nested regions without shadow.
- **Border:** 1px cool hairline (#e0e4eb) is the default and only separator; no resting shadow.
- **Hover:** interactive cards deepen the hairline to `foreground / 0.22` (`.card-premium:hover`, `.stat-card:hover`). No `translateY` lift, no shadow, no glow.
- **Internal Padding:** 20px (`p-5`); never nest a card inside a card.

### Inputs / Fields
- **Style:** `--card` fill, 1px `--input` border, 12px radius, ink text; label above in `.t-label` (mono, uppercase).
- **Focus** (`.input-focus`): 2px accent ring at 40% (`ring-primary/40`) + border shift to `primary/60`, 150ms. No glow.
- **Error:** red border + a helper line beneath; never color-only (pair with text/icon for color-blind users). **Disabled:** muted fill, reduced-opacity text.

### Navigation (Sidebar)
- **Style:** quiet vertical list; item label in body weight, sidebar-foreground/slate-mute at rest.
- **Active** (`.nav-link-active`): accent text on a 12%-blue tint fill (`primary / 0.12`), full-width, weight 600. No `border-left` side-stripe — the background tint is the active affordance.
- **Hover:** subtle cool surface tint. The enterprise nav section is hidden entirely for non-admins.

### Status Tags / Badges
- **Utilities** (`.badge-success` / `.badge-warning` / `.badge-error` / `.badge-info`): squared chips — `rounded-sm` (6px), `px-2 py-0.5`, 11px `font-semibold` in the **display voice** (`--font-display`, i.e. Inter). Semantic variants map to the Similarity Scale: success (green, `--success/0.14` fill + same-hue text + 0.3 border), warning (amber, `--warning/0.18` fill, ink text, 0.42 border), error (red, `--destructive/0.14`). The **info** tag is intentionally **neutral** — `--secondary` fill, slate-mute text, hairline border — because info is not a signal band.
- **Kit serials** (`StatusTag` / `Tag` / `Verdict`): the Dossier primitives render short serials, categorical words, and verdicts in **mono** (`font-mono`, 10px, uppercase, `tabular-nums`, `rounded-sm`) — this is the precision-data mono at work. `Verdict` derives its label and band straight from the score via `scoreBand()` (green &lt;50 / amber 50–79 / red ≥80).

### Similarity Score Ring / Meter (signature)
The flagship readout: an SVG progress ring / dial showing the combined similarity 0–100, its stroke colored by the Similarity Scale (green &lt;50 / amber 50–79 / red ≥80), with the number set in `.t-stat` (mono, `tabular-nums`) at the center. `Meter` / `ScoreMeter` and the `.metric-bar-*` track/fill are its horizontal siblings; the fill color encodes the amount (`tone="auto"` resolves through `scoreBand`), never a fixed accent hue. It is the single most important "instrument dial" in the product — it must read instantly and its color must always agree with the verdict text beside it.

### Signature Motifs
Kept from the identity, retuned to the accent:
- **`.ink-panel`** — a scoped dark charcoal feature band (the hero cover / a dark section) that keeps its dark palette in **both** themes by re-declaring the core tokens locally, so every token-driven child inverts automatically. The bold hero ground.
- **`.stamp`** — a clean small mono uppercase chip in the accent (blue tint: `primary/0.08` fill, `primary/0.28` border, accent text, `rounded-sm`). For "case open" / "filed" accents.
- **`.paper-grid`** / **`.paper-grid-fine`** — a whisper-subtle blueprint grid drawn from the border token (so it tracks light/dark and any scoped `.ink-panel`). Texture, not pattern; hero surfaces only.
- **`.tick-frame`** — subtle accent corner registration L-marks (hairline, RTL-aware) that frame a live exhibit.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Blue to ≤10% of any screen — one primary action or the current selection, then stop (The One-Signal Rule).
- **Do** draw structure with a 1px cool hairline (#e0e4eb) and tonal surface steps; a resting card uses border, not shadow (border _or_ shadow, never both).
- **Do** reserve the single soft cool neutral shadow for true overlays (dropdowns, dialogs, popovers) — never a colored or accent-tinted shadow.
- **Do** set body and secondary text in Ink (#131826) / Slate Mute (#5e6878), verified ≥4.5:1; never lighten body text for "elegance."
- **Do** read in one sans (Inter) for both prose and headings, and reserve mono strictly for the precision data — code, `.t-label`, `.t-stat`, and inline numbers; under Arabic, let mono fall back to IBM Plex Sans Arabic.
- **Do** pair the blue fill with `--primary-foreground` (white in light, dark navy ink in dark), never a hand-picked text color.
- **Do** map every semantic color to the same similarity band everywhere (green/amber/red), and always pair color with text or icon so it survives color blindness.
- **Do** compose from the Dossier kit (`Panel`, `Ledger`, `Tag`, `Meter`, `Verdict`, …) rather than hand-rolling tables, tiles, or badges.
- **Do** keep code, diffs, data, and numeric axes left-to-right inside the Arabic RTL layout.

### Don't:
- **Don't** use decorative glow or neon accents — the `--shadow-glow-*` / `--glow-shadow-*` tokens, `.glow-primary/accent`, and `pulse-glow` have been **deleted** from `index.css`; do not reintroduce them.
- **Don't** use glassmorphism or blur as a default surface — `.glass` (frosted `backdrop-filter`) is not a resting-panel treatment.
- **Don't** use gradient text or gradient fills — `.text-gradient-brand` and `.bg-gradient-brand` resolve to the solid accent; emphasize with weight, size, and the one signal color.
- **Don't** reintroduce a second accent hue — the one signal is Signal Blue, and the only other non-neutral hues are the semantic scale. Blue is never a similarity band.
- **Don't** set a heading or a paragraph in mono, and don't introduce a third typeface. Mono is data only; Inter reads.
- **Don't** use a `border-left`/`border-right` colored accent stripe on the active nav item — use the full blue background tint instead.
- **Don't** round cards past 18px (`--radius-2xl`) or buttons past ~14px, and don't go razor-sharp; over-rounding reads as toy, under-rounding as brittle.
- **Don't** tint a shadow with the accent hue or animate a glow. If an element looks like it emits light, it's wrong.

## 7. Accessibility

Accessibility is a floor, not a finish — the readout must be trustworthy for every reviewer.

- **Contrast — WCAG 2.2 AA floor.** Ink (#131826) and Slate Mute (#5e6878) are verified ≥4.5:1 on the canvas and on white surfaces; large display type clears its 3:1 threshold. The accent's foreground pairings are chosen for contrast, not taste — white on Signal Blue in light, dark navy ink on the brighter blue in "Signal" (dark). Never lighten body or secondary text below the AA floor "for elegance."
- **Never color-only.** Every semantic state pairs its hue with text and/or an icon — success/warning/error tags carry a word, the score ring carries its number and verdict — so the similarity scale survives color blindness and grayscale.
- **Full bilingual EN / AR with correct RTL.** The whole surface is authored for English and Arabic. Under `html[lang="ar"]` the type falls back to IBM Plex Sans Arabic (including the `.t-*` utilities, so Arabic headings/labels/stats never tofu), `body[dir="rtl"]` mirrors layout and text alignment, while code, `.code-surface`, `.font-mono`, and numeric axes are forced back to LTR so data reads correctly inside the RTL page.
- **Keyboard-complete.** Every interactive element is reachable and operable by keyboard, with a visible focus-visible ring (2px accent ring, 2px offset) that is never removed. Ship default, hover, focus-visible, active, disabled, and loading states together.
- **Respects `prefers-reduced-motion`.** A global base-layer block collapses animations, transitions, and scroll behavior to near-instant with no travel; entrances (`animate-fade-in`) are opacity-only, so the reduced-motion experience is a genuine alternative, not a broken one.
