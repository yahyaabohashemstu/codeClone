---
name: Clone Lens
description: Evidence-dossier code-similarity workspace — a calibrated verdict that shows its work, printed on warm paper in a forensic mono voice.
colors:
  ink-navy: "#23508b"           # --primary · hsl(214 60% 34%) · the single signal: primary actions, selection, focus, focused evidence
  ink: "#25211d"                # --foreground · hsl(30 14% 13%) · body + heading text on paper
  slate-mute: "#655d54"         # --muted-foreground · hsl(34 9% 37%) · secondary text, labels
  paper: "#f4efe6"              # --background · hsl(42 30% 95%) · app body (warm paper)
  card: "#faf6ee"               # --card / --surface-1 · hsl(40 36% 97%) · panels, cards
  hairline: "#d8d2c6"           # --border · hsl(38 17% 82%) · dividers, borders (structure is drawn, not shadowed)
  olive-clear: "#438a52"        # --success · hsl(130 32% 33%) · low similarity / pass
  amber-review: "#e08a0f"       # --warning · hsl(38 92% 45%) · mid similarity / needs review
  oxblood-flag: "#b23a2b"       # --destructive · hsl(8 64% 42%) · high similarity / flagged
  terracotta-suspect: "#b9663a" # --accent-suspect · hsl(16 58% 46%) · the second exhibit's identity tone (AST B, diff B)
typography:
  hero:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "4.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "3rem→2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "1.5rem→1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.08em"
    textTransform: "uppercase"
  stat:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    fontVariantNumeric: "tabular-nums"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  arabic:
    fontFamily: "IBM Plex Sans Arabic, Inter, system-ui, sans-serif"
    note: "Under html[lang=ar] the mono display voice is replaced by IBM Plex Sans Arabic for every heading/label/stat — JetBrains Mono has no Arabic glyphs."
rounded:
  sm: "2px"
  md: "3px"
  lg: "0.35rem"    # --radius, the base
  xl: "0.5rem"
  2xl: "0.625rem"
  full: "9999px"   # dots and the score ring only
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
    backgroundColor: "{colors.ink-navy}"
    textColor: "#f6f1e6"        # near-white paper on navy — navy is a dark hue and takes a light foreground (7.6:1)
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "#1b3f6c"
    textColor: "#f6f1e6"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-mute}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
    border: "1px solid {colors.hairline}"
    shadow: "none"              # border OR shadow, never both — flat by default
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  badge:
    backgroundColor: "hsl(var(--warning) / 0.18)"   # 14–18% tint of the semantic hue
    textColor: "{colors.ink}"   # ink on amber tint (never small amber text on paper)
    rounded: "{rounded.sm}"     # squared evidence label, NOT a pill
    padding: "2px 8px"
    fontFamily: "{typography.label.fontFamily}"
    fontSize: "11px"
---

# Design System: Clone Lens

## 1. Overview

**Creative North Star: "The Evidence Dossier"**

Clone Lens is a case file, not a marketing surface. Every screen is an exhibit: it states what was measured, on what scale, and with how much confidence, then lays the evidence beside the number so a reviewer can act on the call and defend it. The interface recedes and the evidence steps forward. "Premium" is carried by precision, spacing, and typographic care — never by decoration.

The material metaphor is **warm paper and ink**: a calibrated off-white ground (`--background`), warm-ink text (`--foreground`), and a single **ink-navy** signal that stands in for "the thing worth looking at." The type has a **forensic mono display voice** — headings, labels, and figures are set in JetBrains Mono so the product reads as an authored instrument rather than a generic dashboard — while long prose stays in Inter (and the full Arabic RTL surface in IBM Plex Sans Arabic) so it reads as a document, not a terminal. Depth is nearly flat; structure is drawn with a 1px hairline and tonal surface steps, not shadow.

This system **explicitly rejects the "premium glow SaaS" costume** it inherited: coloured glow (`--shadow-glow-*`, neon drop-shadows), frosted glassmorphism, gradient text, indigo/cyan neon, and rounded-blob geometry. Those patterns read as machine-generated and undercut the instrument's credibility. They are **retired**, not the target. The target is the opposite: quiet paper surfaces, hairline structure, sharp corners, and colour used only to carry meaning.

**Key Characteristics:**
- Warm-paper canvas with a single **ink-navy** signal (light) / **Ink & Ember** near-black ground with a brighter navy (dark). One deliberate voice, spent sparingly.
- **Mono display voice** (JetBrains Mono) for headings, labels, and stats; Inter for body prose; IBM Plex Sans Arabic for the whole Arabic RTL surface.
- Near-flat elevation: a single restrained **uncoloured** hairline/shadow marks true elevation, never a coloured glow.
- Sharp, technical geometry — base radius `0.35rem`; over-rounding retired.
- Semantic similarity scale — green (low) → amber (review) → red (high) — applied consistently to scores, badges, and rings, and always paired with text/icon.
- Bilingual and RTL-correct by construction; code and data stay left-to-right inside an Arabic layout.

## 2. Colors

A warm-paper ground with a single ink-navy signal, a terracotta "second exhibit" identity tone, and a three-stop similarity scale. Colour is a measurement, not a mood.

### Primary
- **Ink Navy** (`--primary` · `hsl(214 60% 34%)` light, `hsl(210 72% 64%)` dark): the one action-and-state colour — primary buttons, current selection, focus rings, the focused piece of evidence. It reads as the fountain-pen/ledger ink a physical case file is signed in — the interface's single deliberate voice; spend it sparingly. **Navy is a dark hue — any navy *fill* takes a light (near-white) foreground** (`--primary-foreground`), the reverse of the amber it replaced. And because it is dark, navy **clears contrast as small text** (7.4:1 on paper), so the accent may be used directly for links, the active-nav label, and `Serial`/`FIG.NN` markers.

### Second Exhibit
- **Terracotta Suspect** (`--accent-suspect` · `hsl(16 58% 46%)`): the identity tone of the *second* thing being compared — the "B" side AST graph, the second exhibit. It partners with the navy signal to represent "two things being compared," which is the product's whole premise. It is warm and distinct from both the navy signal and the oxblood alarm. Fully token-based so it tracks light/dark. Not decorative: if it is not marking the second exhibit, it should not appear.

### Neutral (paper & ink)
- **Ink** (`--foreground` · `hsl(30 14% 13%)`): all body copy and headings. Clears AA/AAA on paper even at small sizes.
- **Slate Mute** (`--muted-foreground` · `hsl(34 9% 37%)`): secondary text, captions, labels. Verified ≥4.5:1 on the card surface — **never lighten it "for elegance"** (no `/60`, `/50`, `/40` opacity dilutions on text).
- **Paper** (`--background` · `hsl(42 30% 95%)`): the app body ground. Dark: `hsl(30 12% 8%)` (Ink & Ember).
- **Card / Surface** (`--card` · `hsl(40 36% 97%)`): cards, panels, inputs. Tonal steps `--surface-1/2/3` layer panels without shadow.
- **Hairline** (`--border` · `hsl(38 17% 82%)`): borders and dividers. Structure is drawn with a 1px hairline, not a shadow.

### Semantic — the Similarity Scale
- **Olive Clear** (`--success` · `hsl(130 32% 33%)`): low similarity, pass, healthy state.
- **Amber Review** (`--warning` · `hsl(38 92% 45%)`): mid similarity, needs review.
- **Oxblood Flag** (`--destructive` · `hsl(8 64% 42%)`): high similarity, fail, flagged.

### Charts
- **`--chart-1..5`**: a categorical palette (ink-navy, terracotta, olive, warm slate, muted plum) for *categorical* series (languages, single-series activity). For *semantic* bands (a similarity distribution) use the similarity scale (`--success`/`--warning`/`--destructive`) directly, never the categorical palette. Never hand-write raw `hsl(...)` literals in a chart — reference the tokens.

### Named Rules
**The One Signal Rule.** The navy signal carries no more than ~10% of any screen's pixels. It marks the one primary action or the current selection, then stops. Its rarity is what makes it read as "important," so a screen with three navy buttons has none.

**The Meaning-Only Colour Rule.** Every non-neutral colour must encode a fact — an action, a state, a similarity band, an exhibit identity, a chart series. If a colour is present only to look premium, delete it. Premium is the spacing and the type, not the hue.

**The Legible-Accent Rule.** Navy is a dark hue: any element *filled* with `--primary` takes a **light** foreground (`--primary-foreground`, near-white paper). Because navy is dark it also clears contrast as text (7.4:1 on paper), so — unlike the amber it replaced — the accent may be used directly for links, the active-nav label, `Serial`/`FIG.NN` markers, and small labels. (This retires the old "never accent-as-text" workaround, which existed only because amber failed.)

**The Amber-Is-Warning-Only Rule.** Amber now appears **only** as `--warning` — the mid-similarity / review band of the Similarity Scale. Amber still fails as small text on paper (~2.4:1), so a warning is shown as **ink text on an amber tint** (`.badge-warning`, and the `DRAFT`/`NO DATA`/`Awaiting` chips) or as an amber dot/bar beside ink — never as small amber reading or status text.

**The Calibrated Scale Rule.** Green → amber → red always maps to the same similarity bands (roughly <50 / 50–79 / ≥80), everywhere: score ring, badges, radar dots, history rows, distribution charts. A reviewer learns the scale once.

## 3. Typography

**Display / Heading / Label / Stat voice:** JetBrains Mono (`--font-display`, with `Fira Code, ui-monospace, monospace`) — the forensic voice.
**Body / Prose / UI Font:** Inter (`--font-sans`, with `system-ui, -apple-system, sans-serif`).
**Code Font:** JetBrains Mono (`--font-mono`).
**Arabic Font:** IBM Plex Sans Arabic (loaded for `html[lang="ar"]`, weights 400–700) — **replaces the mono display voice** for every heading/label/stat under RTL.

**Character:** The product speaks in two registers. Structural elements that name or measure — headings, labels, figures, badges, the score — are set in **JetBrains Mono** via the `.t-hero / .t-h1…t-h5 / .t-label / .t-stat` utilities, giving an engineered, authored read. Everything you *read as a sentence* — descriptions, analysis prose, help text — stays in **Inter** for comfort. Mono is the voice of "this is a value or a name"; Inter is the voice of "this is an explanation." This split is deliberate: forcing mono onto long prose would read as a developer-tool cliché, and forcing Inter onto the figures would erase the instrument character.

### Hierarchy (utilities in `index.css`)
- **`.t-hero`** (mono, 700, 4.5rem, lh 1.05, -0.02em): marketing Home hero only. Never inside the product shell.
- **`.t-h1 / .t-h2`** (mono, 700, 3rem→2rem, lh 1.15–1.2): page titles and major section heads.
- **`.t-h3 / .t-h4 / .t-h5`** (mono, 600, 1.5rem→1.125rem): card and panel headings.
- **`.t-body / .t-sm / .t-xs`** (Inter): prose and descriptions; cap analysis prose at ~65–75ch.
- **`.t-label`** (mono, 600, 0.75rem, 0.08em, UPPERCASE): field labels and column heads — a utility, not a section eyebrow.
- **`.t-stat`** (mono, 700, tabular-nums): the big figures (score, KPIs).
- **`.t-mono`** (mono, 0.875rem): code, diffs, hashes.

### Named Rules
**The Two-Register Rule.** Headings, labels, and figures speak in mono (`.t-*` display utilities); body prose speaks in Inter. Do not set a paragraph in mono, and do not set a heading in Inter (a raw `text-2xl font-semibold` heading is a defect — use `.t-h4` / `font-[family:var(--font-display)]`).

**The Fixed-Scale Rule.** Product type is fixed rem, never fluid `clamp()`. Only the Home hero may be fluid.

**The Arabic-Exemption Rule.** JetBrains Mono has no Arabic glyphs. Under `html[lang="ar"]` every display element falls back to IBM Plex Sans Arabic (handled centrally in `index.css`). Never hardcode a mono `font-family` on a heading in a way that bypasses this.

## 4. Elevation

Flat by default, with structural shadows only. Surfaces rest flat, separated by the hairline border and tonal layering (`--surface-1/2/3`). A single restrained, **uncoloured** neutral shadow appears only where an element genuinely floats above the page — dropdowns, dialogs, popovers. Depth marks structure, never adds atmosphere.

### Shadow Vocabulary
- **Rest** (`--card-shadow-rest`: `0 1px 2px hsl(30 24% 18% / 0.05)`): a single hairline shadow. Most cards use the 1px border *instead* — border **or** shadow, never both.
- **Hover / Float** (`--card-shadow-hover`): a slightly deeper version for true floating layers (menus, dialogs). Interactive cards deepen their **border** on hover rather than lifting.

### Retired (do not use in new work)
- **Coloured glow** — `--shadow-glow-*`, `--glow-shadow-*`, neon drop-shadows, `pulse-glow`. Aliased to `none` so legacy call sites render flat; do not add new ones.
- **Glassmorphism** — `backdrop-blur` + translucent `bg-*/50` as a resting surface. Use a solid fill + hairline.
- **Gradient fills / text** — `--gradient-brand` is aliased to a solid; `.text-gradient-brand` renders as one solid colour.

### Named Rules
**The No-Glow Rule.** Shadows are neutral and structural. A shadow tinted with a brand hue, or any glow used as decoration, is forbidden. If it looks like the element is emitting light, it is wrong.

**The Structure-Over-Shadow Rule.** Reach for a 1px hairline or a tonal surface step before a shadow. A shadow must justify itself by marking a real z-layer.

## 5. Components

### Buttons
- **Shape:** sharp, base radius `--radius` (`0.35rem`). Never pill-round a rectangular action button.
- **Primary:** solid Ink Navy, **near-white text** (`--primary-foreground`), 10px×16px padding. One primary action per view.
- **Hover / Focus:** hover darkens the fill with a 150ms transition; focus shows a 2px navy ring at 40% (`--ring`), never removed. `:active` settles the fill; no transform bounce.
- **Secondary:** card fill, ink text, 1px hairline. **Ghost:** transparent, slate-mute text, hairline on hover. **Destructive:** Oxblood fill for irreversible actions only.
- **States are non-negotiable:** default, hover, focus-visible, active, disabled (55% opacity), and loading (inline spinner, **label retained**) all ship together, plus the global `prefers-reduced-motion` contract.

### Cards / Containers
- **Corner Style:** base radius `--radius` (`0.35rem`) for cards and panels; `--radius-xl` (`0.5rem`) only for large feature containers. Never a `rounded-2xl`/`3xl` blob.
- **Background:** `--card`, or a subtle `--surface-1`→`--surface-2` step for stat/premium cards. **Solid fills only** — no glass.
- **Border:** 1px hairline is the default separator. **Border or shadow, never both.**
- **Shadow Strategy:** flat at rest; interactive cards deepen the **border** on hover (`.card-premium:hover`), they do not lift-and-glow. Static cards stay flat.
- **Internal Padding:** ~20px; never nest a card inside a card.

### Inputs / Fields
- **Style:** card fill, 1px `--input` border, `--radius`, ink text; label above in `.t-label`.
- **Focus:** 2px navy ring at 40% + border shift to navy at 60% (`.input-focus`), 150ms. No glow.
- **Error:** Oxblood border + a red helper line beneath; never colour-only (pair with text/icon). **Disabled:** muted fill, 55% text.

### Navigation (Sidebar)
- **Style:** quiet vertical list; item label in body weight, slate-mute at rest.
- **Active:** ink text on a 12%-navy tint fill (`.nav-link-active`), full-width. **No `border-left` side-stripe** — the full background tint carries the state.
- **Hover:** subtle surface tint. The enterprise nav section is hidden entirely for non-admins.

### Badges / Status (evidence labels, not pills)
- **Style:** **squared** (`--radius-sm`), **mono** (`--font-display`), 11px, a 14–18% tint of the semantic hue with a same-hue 1px border. Variants: info (neutral), success (olive), warning (**ink** text on amber tint — see the Amber-Is-Warning-Only rule), error (oxblood). Mapped to the Similarity Scale. Never a `rounded-full` pill.

### Similarity Score Ring (signature)
The flagship readout on the results page: an SVG progress ring showing combined similarity 0–100, stroke coloured by the Similarity Scale (green <50 / amber 50–79 / red ≥80), with the number in `.t-stat` mono at the centre. The single most important "instrument dial" in the product — it must read instantly and its colour must always agree with the verdict text beside it.

### AST Graph (two exhibits)
- Nodes are flat token cards (solid `--card` fill + hairline), **no glow, no glass, no neon**. The "A" graph is toned ink navy (`--primary`); the "B" graph is toned terracotta (`--accent-suspect`). Selection and ancestry-path emphasis are carried by a **border-colour change only** — no transform, no coloured drop-shadow — which keeps the graph calm and reduced-motion friendly.

## 6. Do's and Don'ts

### Do:
- **Do** keep the navy signal to ≤10% of any screen — one primary action or the current selection, then stop (The One Signal Rule).
- **Do** put a **light** foreground on any navy fill; amber appears only as `--warning`, shown as **ink on an amber tint** (never small amber text on paper).
- **Do** draw structure with a 1px hairline and tonal surface steps before reaching for any shadow (border **or** shadow, never both).
- **Do** set body and secondary text in Ink / Slate Mute at full strength, verified ≥4.5:1 — never lighten body/label text with `/60`,`/50`,`/40` opacity.
- **Do** speak in two registers: mono (`.t-*` display) for headings/labels/figures, Inter for prose; IBM Plex Sans Arabic for the whole Arabic surface.
- **Do** map every semantic colour to the same similarity band everywhere (green/amber/red), and always pair colour with text or icon so it survives colour blindness.
- **Do** ship every interactive component with default, hover, focus-visible, active, disabled, and loading states — the global `@media (prefers-reduced-motion: reduce)` block in `index.css` is the app-wide motion contract; new components inherit it.
- **Do** keep code, diffs, and data left-to-right inside the Arabic RTL layout.

### Don't:
- **Don't** use decorative glow or neon — `--shadow-glow-*`, coloured drop-shadows, and `pulse-glow` are retired. If an element looks like it emits light, it's wrong.
- **Don't** use glassmorphism (`backdrop-blur` + translucent fill) as a resting surface — use a solid fill + hairline.
- **Don't** use gradient text or gradient fills — `--gradient-brand`/`.text-gradient-brand` are aliased to a solid; emphasise with weight, size, and one solid colour.
- **Don't** build the interchangeable SaaS template — identical icon-card grids, an "AI-Powered Platform" badge, "Everything you need…" / "Ready to…?" copy, or generic `Sparkles`/`Zap`/`Shield` metaphor icons. Use domain-specific labels and icons.
- **Don't** use a `border-left`/`border-right` greater than 1px as a coloured accent stripe — use a full background tint.
- **Don't** round cards past `--radius-xl` or use `rounded-full` on anything but dots and the score ring; over-rounding reads as toy, not instrument.
- **Don't** introduce a second sans or set long prose in mono; don't set a heading in Inter.
