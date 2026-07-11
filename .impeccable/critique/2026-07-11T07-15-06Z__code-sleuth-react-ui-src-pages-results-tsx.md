---
target: Results.tsx (results dashboard)
total_score: 22
p0_count: 0
p1_count: 6
timestamp: 2026-07-11T07-15-06Z
slug: code-sleuth-react-ui-src-pages-results-tsx
---
Method: dual-agent — Assessment A (isolated panel: holistic design director + 3 specialist lenses) · Assessment B (deterministic detector). No degradation. 30 design findings; 29 code-verified, 1 refuted.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Rerun shows no inline progress — only a disabled button; the full-page loader fires only when there is no result yet (Results.tsx:1065). |
| 2 | Match System / Real World | 3 | The headline verdict is bare false precision (`toFixed(1)`) with a one-word band and no confidence framing. |
| 3 | User Control & Freedom | 2 | Active tab lives only in `useState` (Results.tsx:985) — refresh, deep-link, and rerun all dump the reviewer back on Overview. Rerun is irreversible with no confirm/cancel. |
| 4 | Consistency & Standards | 2 | Two card vocabularies on one screen (flat header vs gradient `card-premium` panels); risk colors go off-scale to orange/yellow/blue (StructuredReport.tsx:17-19) against the green/amber/red system. |
| 5 | Error Prevention | 2 | Destructive Rerun (Results.tsx:1329) fires on click with no confirm, discarding a verdict the reviewer may be citing. |
| 6 | Recognition Rather Than Recall | 2 | Radar axes are cryptic abbreviations (SimilarityRadar.tsx:19-21) meaningful only on hover; Metrics is a raw alphabetical key/value dump (MetricsComparison.tsx:55). |
| 7 | Flexibility & Efficiency | 2 | 7 tabs are plain `<button>`s (Results.tsx:1344) with no roving keyboard focus, no shortcuts, no deep-linkable state. |
| 8 | Aesthetic & Minimalist Design | 1 | Decorative glow washes, gradient+glow buttons, gradient progress fills, cards-in-cards, and the same similarity numbers rendered three times in Overview. |
| 9 | Error Recovery | 3 | Genuinely strong: per-panel ErrorBoundary, inline alerts, diff fallback, NaN-clamped radar. Weakness: failure states are dead-ends with no retry. |
| 10 | Help & Documentation | 2 | The flagship score ring ships no threshold legend, no band explanation, no calibration note — exactly where the reviewer must defend the number. |
| **Total** | | **22/40** | **Acceptable — significant improvements needed before users are happy** |

## Anti-Patterns Verdict

**Does this look AI-generated? Partly — yes, in the finish, not the bones.**

**LLM assessment.** The information architecture is instrument-grade, but the visual finish still wears the exact "premium glow SaaS costume" your own DESIGN.md says to retire. Concrete tells, all code-verified: gradient-brand fill + colored glow on the Export CTA (Results.tsx:1229) and the chat send button (AnalysisChatPanel.tsx:185); decorative radial-glow washes on the quality tone containers (Results.tsx:668-707, with a hardcoded near-black overlay that breaks in light mode); the signature score ring drawn with a **gradient stroke** instead of one solid semantic color (Results.tsx:1138); `card-premium` (a gradient-wash card with hover-lift) used as the default surface for every static panel, against "static cards stay flat"; and `.text-gradient-brand` / `.glow-*` / `.glass` still live in index.css:313-335. The IA saves it from being pure slop, but the verdict moment itself reads generic-premium.

**Deterministic scan.** `detect.mjs` exit 2 — **33 findings**: 32× `design-system-font-size` (literal sizes off the DESIGN.md type ramp; mostly dense micro-labels — advisory, but the 10px diff-gutter ones coincide with the AA contrast issue below), and 1× `bounce-easing` (AnalysisChatPanel.tsx:148 — DESIGN.md bans bounce/elastic; real, P3). The detector agreed with the review on the type-ramp drift and independently caught the bounce easing the LLM lens under-weighted.

**Visual overlays.** None available. A live browser render of this surface was not performed: the page is auth-gated (`ProtectedRoute`) and only mounts with a completed analysis object, which needs the full Flask + ML backend, a logged-in session, and a finished analysis job — a dev-server screenshot would only reach `/login` and exercise none of the target components. The deterministic scan is the fallback signal.

## Overall Impression

The bones are excellent and the finish undercuts them. The clone-detection evidence blocks are the product principle ("evidence over assertion") made concrete — genuinely best-in-class. But at the one moment that matters most for an integrity product — the verdict — the design is at its weakest: a decorated, false-precision number with no confidence, no threshold context, and no advisory marker, presented identically whether it is a deterministic exact clone or an advisory AI guess. **The single biggest opportunity: make the verdict honest and dominant.** Everything else is downstream of that.

## What's Working

1. **The clone-detection matrix is the product's principle made real.** Each clone type shows its family, a detected/not state, an interpretation-vs-reading line, and a "why it matters" block (Results.tsx:345-400). This is "evidence over assertion" done right and is the strongest part of the surface.
2. **Honest handling of scale and messy data.** The diff is virtualized with a visible line cap, the AST graph truncates at 600 nodes and *says so*, the radar clamps non-numeric values to 0 instead of a misleading green dot, and the pylint parser degrades to a raw-report disclosure. This directly serves the stress-tester and the "honest about confidence" principle.
3. **Resilience and i18n depth.** Every heavy panel has its own ErrorBoundary so one failing widget can't take down the verdict (Results.tsx:1372-1404), and the surface is thoroughly bilingual with correct RTL that keeps code and diffs LTR inside an Arabic layout.

## Priority Issues

**[P1] The verdict peak signals no confidence — advisory results are dressed as definitive.**
*Why it matters:* This is the core of the product promise. The ring shows `overallScore.toFixed(1)` (false precision) with a one-word High/Moderate/Low band and no threshold legend, no confidence interval, and no "this clone type is advisory" caveat (Results.tsx:1136-1220). An advisory semantic/cross-language guess is styled identically to a deterministic exact-clone match (Results.tsx:352-357). For the institutional reviewer this is un-defendable on appeal; for the student it is a punitive red number with no visible "why." It directly violates "honest about confidence" and "accountable by design."
*Fix:* Add a confidence band + a threshold legend (the <50 / 50–79 / ≥80 bands) at the ring, drop precision to a whole number, mark advisory detections (Type-4 / cross-language) with an explicit "advisory" chip, and give a one-line plain-language "what this means."
*Command:* `/impeccable clarify` (verdict copy + confidence), then `/impeccable colorize` for the ring's single-solid-color scale.

**[P1] The Overview tab is a Wall-of-Options with no verdict→evidence chain.**
*Why it matters:* 5 of 8 cognitive-load checks fail here. Overview renders the code comparison + a 4-engine tile row + SimilarityBars + SimilarityRadar + the full 11-card clone matrix at once — and three of those show the *same* similarity numbers (Results.tsx:1250-1377). There is no path from "here's the verdict" to "here's why." The reviewer must reconcile three redundant widgets before finding the reasoning.
*Fix:* Upgrade the existing top-engines strip (Results.tsx:1250-1287) into a ranked verdict→drivers chain — "combined X% driven by A / B / C," ranked by signal strength (not `slice(0,4)`), naming which clone families fired, each chip deep-linking to its tab. Then collapse the redundant radar and the code panel behind progressive disclosure so Overview leads with verdict + drivers. Exclude "Combined" from both the tiles and SimilarityBars (it *is* the ring).
*Command:* `/impeccable layout` (+ `/impeccable distill` for the redundancy).

**[P1] Micro-text falls below WCAG AA — worst in the diff gutter, your evidence trail.**
*Why it matters:* The diff line numbers — the evidence a reviewer cites — render at ~10px with `text-muted-foreground/40` and `/25` on the opposite gutters (DiffViewer.tsx:31-34), effectively invisible. Against your AA/AAA bar and the "student under review" fairness goal, the proof is unreadable.
*Fix:* Raise all functional diff line numbers to full-opacity Slate Mute at ≥11px and remove the `/40` and `/25` opacity tiers entirely (line numbers are evidence, never decorative). Sweep the other 32 off-ramp micro-sizes the detector flagged.
*Command:* `/impeccable harden` (contrast pass).

**[P1] The 7 tabs are not an accessible tablist and lose the reviewer's place.**
*Why it matters:* The tab row is plain `<button>`s with no `role="tab"`/`tablist`/`aria-selected` and no arrow-key roving focus (Results.tsx:1339-1361) — a keyboard user Tabs through all seven individually and a screen reader hears nothing about tab structure. Worse, the active tab is never written to the URL (Results.tsx:985), so a refresh or a shared link always resets to Overview, destroying context mid-review. *(Verification note: the native browser focus ring does still show — nothing sets `outline:none` — so the a11y gap is a missing branded/guaranteed focus indicator, P2, layered under the P1 ARIA + keyboard-model gap.)*
*Fix:* Convert to a proper ARIA tablist with roving `tabIndex` and arrow-key navigation, add a branded `focus-visible` ring matching `.input-focus`, and sync the active tab to a URL query param so refresh and deep-links preserve position.
*Command:* `/impeccable harden` (a11y + deep-linkable state).

**[P1] Decorative glow and gradient-brand fills contradict your own anti-references.**
*Why it matters:* Your DESIGN.md and PRODUCT.md explicitly retire glow, glassmorphism, and gradient text — yet the highest-visibility elements still use them: the Export CTA is a `--gradient-brand` fill with a `--glow-shadow-sm` (Results.tsx:1229), the quality containers carry radial-glow washes (668-707), and the verdict ring uses a gradient stroke (1138). For an instrument that must read as credible, light-emitting decoration undercuts trust. *(Verification note: only the single Export CTA in the header uses gradient+glow — the adjacent button is already `variant="outline"`, so the scope is that one control plus the quality washes and the ring, not "all buttons.")*
*Fix:* Replace the Export CTA's inline style with a solid `hsl(var(--primary))` fill and a neutral rest shadow (or none) + the standard 2px focus ring; strip the radial-glow washes from the quality containers; make the ring stroke a single solid scale color; and delete `.text-gradient-brand` / `.glow-*` / `.glss` glow tokens from index.css so they can't creep back.
*Command:* `/impeccable quieter`.

## Persona Red Flags

**Alex (power user):** No arrow-key navigation across the 7 tabs — 7 Tab stops (Results.tsx:1344). Active tab is not in the URL, so no shareable/deep-linkable view and refresh loses position. No keyboard shortcuts for Rerun/Export/tab-switching; Export is buried in a dropdown.

**Sam (accessibility / screen reader / contrast):** Diff gutter numbers at `/40` and `/25` opacity, ~10px — fail AA (DiffViewer.tsx:31-34). Tab row exposes no `role=tab`/`aria-selected`; panels no `role=tabpanel`. The radar conveys the similarity band by dot color only (SimilarityRadar.tsx:96-102). Off-scale risk colors (orange/yellow/blue) add color meanings outside the learned green/amber/red system (StructuredReport.tsx:17-19).

**Riley (stress tester):** Refresh or a shared link always resets to Overview, discarding tab context. Rerun mid-flow shows no progress and no cancel — only a disabled button. Large inputs are handled well, but the AST truncation silently drops nodes beyond 600, so a clone in node 601+ is unreachable (AstGraphPanel.tsx:485).

**The institutional reviewer (must defend a verdict):** The ring gives a false-precision % with no confidence interval or threshold legend to cite. Advisory semantic/AI clones are styled identically to deterministic exact clones, making "why flagged" hard to defend. The gradient stroke on the ring blurs the single-color signal the scale rule requires.

**The student under review (fairness / clarity of why):** The verdict is a scarlet, decorated number with a generic description and no plain-language reason. No confidence or "this clone type is advisory" caveat at the moment of judgement. The Report tab holds the reasoning but is not the default and is lost on refresh — so the fair explanation is easy to miss.

## Minor Observations

- **[P1, verified] The "Grounded" chat badge is a false trust claim.** AnalysisChatPanel.tsx:71 asserts the answer is grounded in the analysis, but the request carries no analysis id — the backend attaches context from a *stale per-user cache* that is not synced to the viewed saved analysis (the restore path skips caching when a complete snapshot exists). For a "trusted verdicts" product this is a genuine accountability bug. Fix by threading `saved_analysis_id` into the chat request and loading context by that id, and resetting the thread when the analysis changes.
- **Off-palette risk/severity colors** (StructuredReport.tsx:15-19) break the Calibrated Scale Rule and add color-only meaning — map them onto green/amber/red.
- **Rerun looks frozen** — the context already exposes `analysisProgress`/`isAnalyzing`, but Results.tsx ignores them (Results.tsx:982/1065); render a staged-progress banner over the retained result.
- **Bars + Radar are the same dataset twice, side-by-side** — make the radar a genuinely different cut (this pair vs corpus baseline) or a secondary toggle.
- **The permanently-disabled "Saved" button** is a dead affordance colored success-green while inert (Results.tsx:1298-1302).
- **Diff refetches from the network on every tab open** (DiffViewer.tsx:99) — cache per analysis.
- **`card-premium` gradient wash + hover-lift is the default panel** — move static panels to flat + hairline per DESIGN.md.
- **Nested cards** (rounded tiles inside `card-premium`, Results.tsx:297/309/332) violate "nested cards are always wrong."
- **Blockquote left-stripe** (index.css:955) trips the >1px side-stripe ban.

## Questions to Consider

- What if the verdict led with *confidence* rather than *precision* — "High similarity, high confidence" instead of "87.3%"?
- Does Overview need three views of the same number, or one honest verdict→drivers line?
- What would the most *defensible* version of this screen look like — the one a reviewer could hand to an appeals committee unchanged?
- If the student under review saw only this screen, would they understand *why* — and would they feel it was fair?
