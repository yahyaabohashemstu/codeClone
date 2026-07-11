---
name: Clone Lens
description: Instrument-grade code-similarity workspace — a calibrated verdict that shows its work.
colors:
  signal-indigo: "#3f4dee"      # --primary  · hsl(235 84% 59%) · primary actions, selection, focus
  diagnostic-cyan: "#18a3bf"    # --accent   · hsl(190 78% 42%) · the second measurement signal
  ink: "#1a1e2e"                # --foreground · hsl(228 28% 14%) · body + heading text
  slate-mute: "#636b7d"         # --muted-foreground · hsl(223 12% 44%) · secondary text, labels
  canvas: "#f5f7fa"             # --background · hsl(220 32% 97%) · app body
  surface: "#ffffff"            # --card / --surface-1 · panels, cards
  hairline: "#dadde7"           # --border · hsl(220 22% 88%) · dividers, borders
  clear-green: "#26a163"        # --success · hsl(150 62% 39%) · low-similarity / pass
  caution-amber: "#e68c0f"      # --warning · hsl(35 88% 48%) · mid-similarity / review
  verdict-red: "#dd2c2c"        # --destructive · hsl(0 72% 52%) · high-similarity / fail
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.04em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "16px"
  2xl: "20px"
  full: "9999px"
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
    backgroundColor: "{colors.signal-indigo}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "#3644d6"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-mute}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-info:
    backgroundColor: "rgba(63,77,238,0.12)"
    textColor: "{colors.signal-indigo}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Clone Lens

## 1. Overview

**Creative North Star: "The Measuring Instrument"**

Clone Lens is an instrument, not a marketing surface. Every screen is a readout: it reports what was measured, on what scale, and with how much confidence, then lays the evidence beside the number so a reviewer can act on it and defend the call. The visual system exists to make that reading trustworthy. Restraint is the aesthetic; the interface recedes and the evidence steps forward. "Premium" is carried by precision, spacing, and typographic care, never by decoration.

The system speaks to an institutional reviewer under time pressure and, indirectly, to the student whose work is being judged. That raises the bar on legibility and fairness: a verdict shown without visible reasoning fails even when the number is right. So the palette is a calibrated slate with two working signals (an indigo and a cyan that stand for the measurement axes, not brand flourish), the type is a single well-tuned Inter for everything with JetBrains Mono reserved for code, and depth is nearly flat, spent only where structure genuinely changes.

This system explicitly rejects the look it inherited. The current CSS leans on decorative glow (`--shadow-glow-*`, `pulse-glow`), frosted glassmorphism (`.glass`), and gradient text (`.text-gradient-brand`) — a "premium glow SaaS" costume that reads as generic and undercuts the instrument's credibility. Those patterns are **legacy, on the way out**, not the target. The target is the opposite: quiet surfaces, hairline structure, and color used only to carry meaning.

**Key Characteristics:**
- Calibrated luminous-slate canvas; two working signals (Signal Indigo, Diagnostic Cyan) used for meaning, not decoration.
- One type family (Inter) across the whole UI; JetBrains Mono for code only; IBM Plex Sans Arabic for the full Arabic RTL surface.
- Near-flat elevation; a single restrained neutral shadow marks true elevation, never a colored glow.
- Semantic similarity scale — green (low) → amber (review) → red (high) — applied consistently to scores, badges, and rings.
- Bilingual and RTL-correct by construction; code and data stay left-to-right inside an Arabic layout.

## 2. Colors

A calibrated slate ground with two working signal colors and a three-stop similarity scale. Color is a measurement, not a mood.

### Primary
- **Signal Indigo** (#3f4dee · `hsl(235 84% 59%)`): the primary action and system-state color — primary buttons, current selection, focus rings, the info badge, the first similarity axis on charts. In dark mode it lightens to `hsl(235 85% 65%)` for contrast. It is the interface's single loud voice; spend it deliberately.

### Secondary
- **Diagnostic Cyan** (#18a3bf · `hsl(190 78% 42%)`): the second measurement signal — the paired axis on the similarity radar and metric bars, the accent node color in the AST graph. It partners with indigo to represent "two things being compared," which is the product's whole premise. Not a decorative accent; if it is not carrying a signal, it should not appear.

### Neutral
- **Ink** (#1a1e2e · `hsl(228 28% 14%)`): all body copy and headings. Use it even at small sizes; it clears AA/AAA on the canvas.
- **Slate Mute** (#636b7d · `hsl(223 12% 44%)`): secondary text, captions, table labels. Verified ≥4.5:1 on `surface` — never lighten it "for elegance."
- **Canvas** (#f5f7fa · `hsl(220 32% 97%)`): the app body ground. Dark mode: `hsl(222 28% 7%)`.
- **Surface** (#ffffff · `--surface-1`): cards, panels, inputs. Tonal steps `surface-2` / `surface-3` layer panels without shadow.
- **Hairline** (#dadde7 · `hsl(220 22% 88%)`): borders and dividers. Structure is drawn with a 1px hairline, not a shadow.

### Semantic — the Similarity Scale
- **Clear Green** (#26a163 · `hsl(150 62% 39%)`): low similarity, pass, healthy state.
- **Caution Amber** (#e68c0f · `hsl(35 88% 48%)`): mid similarity, needs review.
- **Verdict Red** (#dd2c2c · `hsl(0 72% 52%)`): high similarity, fail, flagged.

### Named Rules
**The One Signal Rule.** Signal Indigo carries no more than ~10% of any screen's pixels. It marks the one primary action or the current selection and then stops. Its rarity is what makes it read as "important," so a screen with three indigo buttons has none.

**The Meaning-Only Color Rule.** Every non-neutral color must encode a fact — an action, a state, a similarity band, a chart axis. If a color is present only to look premium, delete it. Premium is the spacing and the type, not the hue.

**The Calibrated Scale Rule.** Green → amber → red always maps to the same similarity bands (roughly &lt;50 / 50–79 / ≥80), everywhere: score ring, badges, radar dots, history rows. A reviewer learns the scale once.

## 3. Typography

**Display / Body / UI Font:** Inter (with `system-ui, -apple-system, sans-serif`)
**Code Font:** JetBrains Mono (with `Fira Code, Cascadia Code, monospace`)
**Arabic Font:** IBM Plex Sans Arabic (loaded for `html[lang="ar"]`, weights 400–700)

**Character:** One humanist-grotesque sans does all the work — headings, controls, labels, data — tuned with Inter's `cv02/cv03/cv04/cv11` features for a precise, engineered read. Contrast comes from weight and size, never from a second display face. Mono appears only where characters must align (code, diffs, hashes, tabular figures).

### Hierarchy
- **Display** (700, 4.5rem/`--fs-hero`, lh 1.08, -0.02em): marketing Home hero only. Never inside the product shell.
- **Headline** (700, 3rem→2rem/`--fs-h1`,`--fs-h2`, lh 1.25, -0.015em): page titles and major section heads.
- **Title** (600, 1.5rem→1.25rem/`--fs-h3`,`--fs-h4`, lh 1.25): card and panel headings.
- **Body** (400, 1rem, lh 1.6): prose and descriptions; cap analysis prose at 65–75ch. Data-dense tables may run wider.
- **Label** (600, 0.75rem, 0.04em, UPPERCASE via `.t-label`): field labels and column heads — a utility, not a section eyebrow.
- **Mono** (400, 0.875rem, lh 1.5): code, diffs, hashes; `font-variant-numeric: tabular-nums` for aligned metrics.

### Named Rules
**The Fixed-Scale Rule.** Product type is fixed rem, never fluid `clamp()`. A heading that shrinks inside a sidebar looks broken, not responsive. Only the Home hero may be fluid.

**The One-Voice-of-Type Rule.** No second sans, no display face in the app. Hierarchy is weight (400/600/700) and size. A "designer font" in a button label is a defect.

**The Mono-Means-Code Rule.** JetBrains Mono signals "this is code or an exact value." Never use it for prose, headings, or decoration.

## 4. Elevation

Flat by default, with structural shadows only. Surfaces rest flat and are separated by the hairline border and tonal layering (`surface-1/2/3`). A single restrained, **uncolored** neutral shadow appears only where an element genuinely floats above the page — dropdowns, dialogs, popovers, and the hover lift on an interactive card. Depth marks structure, never adds atmosphere.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 14px 38px rgba(24,39,75,0.08), 0 2px 8px rgba(24,39,75,0.06)`): the resting card shadow (`--card-shadow-rest`). Soft, neutral, low. In dark mode it becomes a near-black ambient shadow.
- **Hover / Float** (`--card-shadow-hover`): a slightly deeper version for the 1px hover lift on interactive cards and for floating layers (menus, dialogs).

### Deprecated (do not use in new work)
- **Colored glow** (`--shadow-glow-sm/md/lg`, `--glow-shadow-*`, the `pulse-glow` animation, `.glow-primary`, `.glow-accent`): indigo/cyan glow shadows. These are the legacy "premium glow" tell PRODUCT.md rejects. Retire them.

### Named Rules
**The No-Glow Rule.** Shadows are neutral and structural. A shadow tinted with a brand hue, or any glow used as decoration, is forbidden. If it looks like the element is emitting light, it is wrong.

**The Structure-Over-Shadow Rule.** Reach for a 1px hairline or a tonal surface step before a shadow. A shadow must justify itself by marking a real z-layer, not by making a flat card feel "premium."

## 5. Components

### Buttons
- **Shape:** gently rounded, 8px (`{rounded.md}`). Never pill-round a rectangular action button; never exceed 12px on a button.
- **Primary:** solid Signal Indigo (#3f4dee), white text, 10px×16px padding, `font-weight: 500`. One primary action per view.
- **Hover / Focus:** hover darkens the fill (~#3644d6) with a 150ms transition; focus shows a 2px indigo ring at 40% (`--ring`), never removed. `:active` settles the fill; no transform bounce.
- **Secondary:** surface fill, ink text, 1px hairline border. **Ghost:** transparent, slate-mute text, hairline appears on hover. **Destructive:** Verdict Red fill for irreversible actions only.
- **States are non-negotiable:** default, hover, focus-visible, active, disabled (55% opacity, `not-allowed`), and loading (inline spinner, label retained) all ship together.

### Cards / Containers
- **Corner Style:** 16px (`{rounded.xl}`) for cards and panels; 20px (`{rounded.2xl}`) only for large feature containers. Never above 20px.
- **Background:** `surface` (#ffffff), or a subtle `surface`→`surface-2` vertical wash for `.stat-card` / `.card-premium`.
- **Border:** 1px hairline at ~70% is the default separator.
- **Shadow Strategy:** Rest shadow at rest; Hover shadow + a 1px `translateY(-1px)` lift on interactive cards only. Static cards stay flat.
- **Internal Padding:** 20px (`{spacing.lg}`–`xl`); never nest a card inside a card.

### Inputs / Fields
- **Style:** `surface` fill, 1px `--input` border, 8px radius, ink text; label above in `.t-label`.
- **Focus:** 2px indigo ring at 40% + border shift to indigo at 60% (`.input-focus`), 150ms. No glow.
- **Error:** Verdict Red border + a red helper line beneath; never color-only (pair with text/icon for color-blind users). **Disabled:** muted fill, 55% text.

### Navigation (Sidebar)
- **Style:** quiet vertical list; item label in body weight, slate-mute at rest.
- **Active:** indigo text on a 12%-indigo tint fill (`.nav-link-active`), full-width. **Do not** use the current `border-left: 2px` side-stripe — replace it with the background tint (and an optional left icon), per the side-stripe ban.
- **Hover:** subtle surface tint. The enterprise nav section is hidden entirely for non-admins.

### Badges / Status
- **Style:** pill (`{rounded.full}`), 12%-tint background of the semantic hue, same-hue text, 1px 20%-tint border, `.t-label`-scale text. Variants: info (indigo), success (green), warning (amber), error (red) — mapped to the Similarity Scale.

### Similarity Score Ring (signature)
The flagship readout on the results page: an SVG progress ring showing the combined similarity 0–100, its stroke colored by the Similarity Scale (green &lt;50 / amber 50–79 / red ≥80), with the number in tabular mono at the center. It is the single most important "instrument dial" in the product — it must read instantly and its color must always agree with the verdict text beside it.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Indigo to ≤10% of any screen — one primary action or the current selection, then stop (The One Signal Rule).
- **Do** draw structure with a 1px hairline (#dadde7) and tonal surface steps before reaching for any shadow.
- **Do** keep shadows neutral and structural, marking only real z-layers (dropdowns, dialogs, hover lift).
- **Do** set body and secondary text in Ink (#1a1e2e) / Slate Mute (#636b7d), verified ≥4.5:1 (AAA where feasible); never lighten body text for "elegance."
- **Do** carry one type family (Inter) across the UI; hierarchy via weight and size; JetBrains Mono for code only.
- **Do** map every semantic color to the same similarity band everywhere (green/amber/red), and always pair color with text or icon so it survives color blindness.
- **Do** ship every interactive component with default, hover, focus-visible, active, disabled, and loading states, and a `prefers-reduced-motion` alternative for every animation.
- **Do** keep code, diffs, and data left-to-right inside the Arabic RTL layout.

### Don't:
- **Don't** use decorative glow or neon accents — retire `--shadow-glow-*`, `.glow-primary/accent`, and `pulse-glow` (PRODUCT.md anti-reference).
- **Don't** use glassmorphism or blur as a default surface — `.glass` (frosted `backdrop-filter`) is not a resting-panel treatment (PRODUCT.md anti-reference).
- **Don't** use gradient text or rainbow accents — `.text-gradient-brand` (`background-clip: text`) is banned; emphasize with weight, size, and one solid color (PRODUCT.md anti-reference).
- **Don't** build the interchangeable SaaS template — identical icon-card grids and a big-number gradient hero (PRODUCT.md anti-reference).
- **Don't** use a `border-left`/`border-right` greater than 1px as a colored accent stripe (the current `.nav-link-active` stripe) — use a full background tint instead.
- **Don't** round cards past 20px or buttons past 12px; over-rounding reads as toy, not instrument.
- **Don't** tint a shadow with a brand hue or animate a glow. If an element looks like it emits light, it's wrong.
- **Don't** introduce a second sans or a display font into product UI, or set prose/labels in mono.
