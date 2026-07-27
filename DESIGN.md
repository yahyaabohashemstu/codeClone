---
name: Clone Lens
description: Press Check — every screen is a registration proof. Two code sources are two printing plates (A prints cyan, B magenta); where they coincide the ink overprints into the violet verdict.
colors:
  overprint: "#3E2C8C"          # --primary · hsl(251 52% 36%) · cyan×magenta laid down together — the one action colour
  ink: "#131B24"                # --foreground · hsl(216 25% 10%) · rich black with a cyan lean
  press-slate: "#525A66"        # --muted-foreground · hsl(215 12% 36%) · secondary text, slugs
  press-bed: "#E3E7EB"          # --background · hsl(210 14% 91%) · the machine-grey ground chrome sits on
  proof-sheet: "#FCFDFD"        # --card · hsl(210 20% 99%) · the bright sheet all content is laid on
  hairline: "#C6CCD3"           # --border · hsl(212 14% 80%) · structure is drawn, never shadowed
  plate-a: "#00A0D1"            # --plate-a · hsl(194 100% 41%) · process cyan — source A's printed identity
  plate-a-deep: "#00577A"       # --plate-a-deep · hsl(197 100% 26%) · text-capable cyan (≥4.5:1)
  plate-b: "#E90C82"            # --plate-b · hsl(328 90% 48%) · process magenta — source B's printed identity
  plate-b-deep: "#970F51"       # --plate-b-deep · hsl(331 85% 32%) · text-capable magenta; also --accent-suspect
  pass-viridian: "#12684B"      # --success · hsl(160 70% 24%) · low similarity / passed
  review-amber: "#E09A00"       # --warning · hsl(41 100% 44%) · mid similarity / review (never small text)
  flag-red: "#BA261C"           # --destructive · hsl(4 74% 42%) · high similarity / flagged
typography:
  hero:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontStretch: "122%"
    fontSize: "clamp(2.4rem, 6.4vw, 5.5rem)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.01em"
    textTransform: "uppercase"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontStretch: "118%"
    fontSize: "2.6rem→1.9rem"
    fontWeight: 800
    lineHeight: 1.04
    textTransform: "uppercase"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontStretch: "106%"
    fontSize: "1.4rem→1.05rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  slug:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontStretch: "106–108%"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.1–0.12em"
    textTransform: "uppercase"
    fontVariantNumeric: "tabular-nums"
  stat:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontStretch: "120%"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
    fontVariantNumeric: "tabular-nums"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    note: "Code only — diffs, hashes, pasted sources. Mono is no longer the display voice."
  arabic:
    fontFamily: "IBM Plex Sans Arabic, system-ui, sans-serif"
    note: "Under html[lang=ar] every display element falls back to the Arabic face at normal width (Archivo has no Arabic glyphs; Plex Arabic has no width axis). Handled centrally in index.css."
rounded:
  all: "0px"        # press geometry — everything trims flush
  full: "9999px"    # dots, avatars, and the registration ring only
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
    backgroundColor: "{colors.overprint}"
    textColor: "{colors.proof-sheet}"
    rounded: "0"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.press-bed}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    rounded: "0"
  card:
    backgroundColor: "{colors.proof-sheet}"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "20px"
    border: "1px solid {colors.hairline}"
    shadow: "none"              # structure is drawn, never shadowed
  input:
    backgroundColor: "{colors.proof-sheet}"
    textColor: "{colors.ink}"
    rounded: "0"
    border: "1px solid hsl(212 14% 74%)"
  badge:
    style: "squared press label — Archivo 11px, stretch 108%, caps, 12–16% tint + same-hue 1px border"
    variants: "success · warning (ink text on amber tint) · error · info · plate-a · plate-b"
  stamp:
    style: "2px currentColor border, Archivo 800 stretch 116%, caps 0.14em — the verdict, pressed on the proof"
    variants: "pass (viridian) · review (amber border, ink text) · flag (red) · neutral"
---

# Design System: Clone Lens

## 1. Overview

**Creative North Star: "Press Check" — the registration proof.**

The product's mechanism *is* the metaphor: Clone Lens lays two pieces of code
over each other and reports where they coincide, which is precisely what a
pressman does at a register check. So the interface is a pre-press proof
sheet. **Source A is a printing plate that prints process cyan; source B
prints process magenta; where the two plates put ink down together the colour
overprints into a deep violet — and that violet is the product's one action
colour.** Agreement is literally rendered as overprint.

The spatial model is **sheet-on-bed**: chrome (the job rail, the instrument
bar, the footer slug) sits on a cool machine-grey *press bed*; every route's
content is laid on a bright *proof sheet* with crop marks at its corners.
Structure is drawn with 1px hairlines and 2px rules — never shadowed — and
**everything trims square** (base radius 0). The press vocabulary supplies
the signature elements: registration crosshairs (⊕), crop marks, the ink
**calibration strip**, slug lines, verdict **stamps**, and a **misregistration
fringe** reserved for the 404 misprint.

Dark mode is **The Negative** — the same proof read on a light table with the
room lights off. Grounds go to film-dark; the plate inks turn luminous; the
overprint brightens to a light violet with dark text.

This system replaces the "Evidence Dossier" identity (warm paper, ink-navy,
JetBrains Mono display voice) wholesale. Nothing cream, nothing glowing,
nothing glass, no gradient text, no mono-as-costume: mono belongs to code
alone now, and the display voice is **Archivo across its width axis**.

**Key characteristics:**
- Cool press-bed ground + proof-sheet surfaces; hairline-drawn structure; flat depth.
- One Latin family (Archivo variable, wdth 62.5–125%) in three width cuts:
  expanded-heavy caps for display, near-normal for working headings and body,
  tracked small caps ("the slug voice") for labels. JetBrains Mono only where
  the content is code. IBM Plex Sans Arabic owns the entire RTL surface.
- The two-plate identity system: **A = cyan, B = magenta**, everywhere the
  two sources appear (upload panels, diff legends, AST graphs, exhibit chips).
- The **overprint violet** as the single action colour — buttons, active
  states, focus rings, progress fills.
- Square geometry throughout; `rounded-full` only for dots and the ⊕ ring.
- The similarity scale (green < 50 / amber 50–79 / red ≥ 80) unchanged in
  *meaning*, re-inked as pass-viridian / review-amber / flag-red.

## 2. Colors

### The plates and the overprint
- **Overprint** (`--primary`): the colour of "both plates down" — cyan ×
  magenta multiplied. It is the only action colour: primary buttons, focus
  rings, selection, the overlap band of every OverprintMeter. Fills take a
  near-white foreground (≈9:1). As text on the sheet it clears AA easily.
- **Plate A / Plate B** (`--plate-a`, `--plate-b`): full-strength process
  inks for marks, bars, chips, and graphics. **Never body text** — for text
  use the `-deep` cuts (`--plate-a-deep`, `--plate-b-deep`), which clear
  4.5:1 on the sheet. `--accent-suspect` is kept as a legacy alias of plate
  B's deep cut because the AST graph and diff components consume it.
- **The Plate Identity Rule.** Anywhere the two sources appear side by side,
  A is cyan and B is magenta — chips, panel headers, graph nodes, diff dots.
  The pairing is the product's premise; do not swap or restyle it locally.

### Neutrals
- **Ink** (`--foreground`): rich black with a cyan lean; all reading text.
- **Press Slate** (`--muted-foreground`): secondary text and slugs; ≥4.5:1 on
  both bed and sheet. Never dilute text with `/60`-style opacity.
- **Press Bed** (`--background`) vs **Proof Sheet** (`--card`): the bed is
  visibly grey so the sheet reads as a physical object on it. Panels within a
  sheet stay sheet-white and are separated by hairlines, not tone.

### The similarity scale
- **Pass Viridian** (`--success`) · low similarity, healthy, passed.
- **Review Amber** (`--warning`) · mid similarity. **Amber never appears as
  small text** — it is shown as ink text on an amber tint, or as an amber
  border/bar beside ink.
- **Flag Red** (`--destructive`) · high similarity, failed, irreversible
  actions. Distinct in hue from plate-B magenta; the two must never be
  conflated (magenta = identity, red = verdict).
- **The Calibrated Scale Rule.** The three bands map to the same thresholds
  everywhere (< 50 / 50–79 / ≥ 80) and colour is always paired with a text
  label or stamp.

### Charts
`--chart-1..5` = cyan-deep, magenta-deep, viridian, press slate, overprint —
the printed-ink legend. For *semantic* similarity bands use the similarity
scale directly, never the categorical palette.

## 3. Typography

**One Latin family, three widths.** Archivo (variable, `wght` + `wdth`)
carries display, UI, body, and labels; the *width axis* is the display voice:

- **`.t-hero` / `.t-h1` / `.t-h2`** — expanded (114–122%), weight 750–800,
  UPPERCASE: the press-poster cut. Page titles are short; caps are the stamp
  voice, not shouting. **Never case-transform user content** (file names,
  code labels get `normal-case`).
- **`.t-h3`–`.t-h5`** — near-normal width, sentence case: working headings.
- **`.t-body` / `.t-sm` / `.t-xs`** — normal width; prose caps at ~65–75ch.
- **`.press-slug`** — the signature label voice: 11px caps, stretch ~106%,
  tracking 0.1em, tabular figures. Replaces the old mono meta entirely; used
  for field labels, table heads, job lines, and edge annotations.
- **`.t-stat`** — expanded 800 tabular numerals for scores and counters.
- **`.t-mono`** — JetBrains Mono, **code only** (diffs, hashes, pasted
  sources, code blocks). Mono used for anything that is not code is a defect.

**The Arabic Exemption.** Under `html[lang="ar"]` every display class
(`.t-*`, `.press-slug`, `.stamp`, `.font-display`) falls back to IBM Plex
Sans Arabic at `font-stretch: normal`, `letter-spacing: 0` — handled once in
`index.css`. Code and data stay LTR inside the RTL layout.

## 4. Elevation & Geometry

- **Flat.** Surfaces are separated by hairlines and the bed/sheet tone step.
  The single neutral shadow (`--card-shadow-*`) exists only for true
  overlays (menus, dialogs). Border **or** shadow, never both.
- **Square.** `--radius: 0` and the whole Tailwind radius scale points at
  0px tokens. `rounded-full` survives only for dots, avatars, spinners, and
  the registration ring.
- **Rules carry hierarchy.** A page's masthead sits above a **double rule**
  (4px `double` in foreground); sections open with a single 2px rule;
  everything else is a 1px hairline.

## 5. The Press Kit (composition primitives)

All in `src/components/dossier/Dossier.tsx` (path kept for its 15 importers):

- **`Masthead`** — job header: slug kicker with a ⊕ reg-dot, expanded-caps
  title, slug meta line, actions; closed by the double rule.
- **`SectionHead` / `Panel bare`** — 2px-ruled section openers.
- **`Panel` / `Figure`** — hairline sheets with slug header strips; figures
  carry `FIG NN` captions.
- **`Field` / `FieldSheet` / `SpecList` / `MetaStrip`** — printed-form rows
  and density readouts in the slug voice.
- **`Serial`** — plate/serial chip; tones `plate-a`, `plate-b`, `primary`,
  `muted`.
- **`RegMark`** — the ⊕ crosshair SVG. Brand mark (in an overprint square),
  seam marker between the two sources, active-nav indicator, and — rotating —
  the loading spinner.
- **`ControlStrip`** — the ink calibration bar (9 chips: C, M, overprint, K,
  tints, semantic inks). Decorative signature: sidebar foot, sheet footer,
  section asides. Always `aria-hidden`.
- **`OverprintMeter`** — the flagship instrument. Plate A's band prints from
  the left, plate B's from the right, each spanning `50% + score/2`, so the
  violet overlap is **exactly the similarity score**. At 0 the plates barely
  meet; at 100 they lie in perfect register. Used on the Results verdict,
  History rows, and the Home demo. Pass `label` for standalone use; omit it
  when a labelled parent already announces the value.
- **`Stamp`** — the verdict, pressed on the proof: `pass` / `review` /
  `flag` / `neutral`. The label text carries the meaning; colour is never
  alone.
- **`ScaleRuler`** — the graded 0–100 instrument the verdict is read against:
  band-tinted track (pass/review/flag), threshold ticks at 0/50/80/100, and a
  needle at the measured value. The score is POSITIONED, not merely labelled.
- **`PlatePair`** — the compact A-over-B lockup (ink swatch + name per plate).
  The standard way to print "this pair" in ledgers, headers, and grounding
  blocks. `mono` when the labels are file names/code.
- **`.press-tabs-list` / `.press-tab`** — squared folder tabs cut into a
  sheet edge; the active tab joins the content sheet below it (bottom edge
  opens into the panel). Works with Radix triggers (`data-state`) and plain
  buttons. Wraps on narrow viewports.
- **`CropMarks`** — corner ticks for a `relative` sheet container (the
  MainLayout content sheet, hero panels).
- **`.misreg`** — cyan/magenta split text-shadow: the plates coming apart.
  Reserved for the 404 misprint and at most one hero moment. Never body text.

## 5a. The mark

The logo is a **C+L monogram that is also a lens**: the C is the optic's ring,
the L sits in its field of view, and the handle completes the instrument. It
ships as approved artwork — two inks, no gradients, no effects:

- **Lens + handle** — the overprint violet `#3e2c8c`, i.e. `--primary` exactly.
- **The L** — ink; it takes `--foreground`, so it inverts to a light letter in
  dark mode rather than disappearing.

Use `<BrandMark>` (`components/brand/BrandMark.tsx`), never an `<img>`: the
inline SVG lets both inks track the live theme tokens. **Size it by height and
let the width follow** — the artwork is 245.98 : 187.74 (≈1.31:1), so a
square box will distort it. Pass explicit `lens` / `letter` colours only where
the surface is fixed regardless of theme (the auth rail, which is always dark).

The mark appears at brand moments only — the sidebar head, the mobile header,
the auth panel, the favicon, and the PDF cover. **`RegMark` (the ⊕ crosshair)
is a different thing**: a design-system motif for seams, loaders, nav state
and section markers. The two coexist; do not substitute one for the other.

Assets: `public/brand/clone-lens.svg` (the artwork) and `public/brand/mark.svg`
(square favicon; its L flips light under `prefers-color-scheme: dark`).

## 5b. Page compositions (each surface's printed form)

Every section has its own press-artifact structure — recolouring a generic
layout is a defect. The register:

- **Home** — the specimen poster: registration hero (three-layer key phrase),
  impression counters, the overlay demo with a live meter + stamp, the
  ink-legend signals index, the drenched overprint colophon.
- **Analysis** — the imposition desk: the two plates on the table joined at a
  dotted registration seam; the **job ticket** rail (language, plate
  readiness, engine checklist) travels beside them; sticky press-control bar.
- **Results** — the proof report: one **proof block** (readout ▸ pair &
  reading ▸ stamped disposition) closed by the **ScaleRuler**; press file
  tabs; drivers as deep-link chips; density bars with 50/80 ticks; metrics as
  the **registration table** (Metric · A · B · Δ); quality as A/B plate
  dockets; the chat as a correspondence log.
- **History** — the press log: log-numeral lines, PlatePair cells, overprint
  meters, verdict stamps, slug dates.
- **Analytics** — the gauge board: a 4-cell **gauge bank** behind shared
  rules; figures as a contact sheet (activity area, language **ink-coverage
  bar** + ledger, banded similarity bars); top pairs as a PlatePair ledger.
- **Chat** — the grounded consultation: grounding docket (plate serials +
  spec rows) above the correspondence log (ruled annotation entries with
  speaker slugs — never messenger bubbles).
- **Billing** — the subscription statement (plan block ▸ ink-coverage gauge
  with quarter ticks) and the **rate card**: tiers as columns, attributes as
  rows, the current tier stamped.
- **API Keys** — the key cabinet: press tabs; issue form; the one-time token
  on a dashed **hand-off slip** with a review stamp; the register as a
  log-numeral ledger; docs as ruled spec sheets with numbered exhibits.
- **Settings** — the account docket: the **ID plate** (operator name +
  role stamp + email), the 2FA enrolment as a numbered procedure (a genuine
  sequence), access/data control rows, and the flag-stamped **void block**.
- **Help** — the operator's manual: contents rail with ⊕ bullets (named, not
  numbered), the support **directory**, the route list, and the printed
  **Q./A.** reference in plate colours.
- **Admin** — the control room: live masthead readings, press tabs, census
  ledgers, figure bars, and log-numeral tables (flagged rows read red).
- **Enterprise** — Workspaces as the registry ledger (threshold shown as a
  banded scale position); Review Cases as the case docket (PlatePair
  artifacts, overprint meters, disposition tallies).

## 6. Motion

- Product surfaces: 150–300ms colour/width transitions; state, not
  choreography. Loading is the rotating RegMark, skeletons stay quiet.
- The one entrance: the Home hero's key phrase prints three times (cyan
  layer, magenta layer, black impression) and slides into near-register over
  0.9s (`animate-register-a/b`) — the brand moment, Home only.
- The global `prefers-reduced-motion` contract in `index.css` collapses all
  animation and pins the hero layers at their static offsets
  (`motion-reduce:translate-x-*`).

## 7. Do's and Don'ts

### Do
- Keep A = cyan and B = magenta wherever the two sources meet.
- Spend the overprint violet on one primary action per view; let the
  hairlines and type carry everything else.
- Draw structure (hairline / 2px rule / double rule); trim everything square.
- Use `.press-slug` for labels and annotations; keep mono strictly for code.
- Pair every band colour with its label or stamp; keep the < 50 / 50–79 /
  ≥ 80 thresholds identical everywhere.
- Preserve the Arabic exemption and LTR code inside RTL.

### Don't
- Don't reintroduce the retired costumes: no glow, no glass, no gradient
  text, no cream paper, no mono headings, no rounded blobs.
- Don't use full-strength plate inks as small text (use the `-deep` cuts).
- Don't put amber on small text, ever.
- Don't case-transform user content in display styles.
- Don't use `.misreg` outside the misprint (404) context.
- Don't shadow a bordered surface or nest sheets inside sheets.
