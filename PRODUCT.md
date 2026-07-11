# Product

## Register

product

## Platform

web

## Users

The primary user is the **institutional reviewer**: instructors, teaching assistants, academic-integrity officers, and the workspace reviewers inside an organization who run code-similarity checks over student or team submissions. Their context is consequential and time-pressured — they review potentially many submissions and must reach a decision they can defend to a student, a committee, or an appeal. They need to know not only *that* two pieces of code match but *why*, with evidence solid enough to act on.

The secondary audience is the **student under review**. They (or an instructor on their behalf) see the flagged pair and its evidence, so the fairness and legibility of *why* something was flagged matters directly to them; a verdict presented without clear reasoning fails this audience even when it is correct.

The same detection engine also powers a self-serve path for individual developers through the CI gate and public API, but the interface is tuned first for the institutional reviewer and the person whose work they are judging.

## Product Purpose

Clone Lens answers one question with rigor: how similar are two pieces of code, and why. It blends a language-agnostic AST engine, a semantic embedding, and an optional LLM narrative into a single calibrated verdict, then surfaces the evidence behind that verdict — the contributing signals, the diff, the syntax structure, and a written rationale. For institutions it adds multi-tenant workspaces, repository scans, and human-reviewed similarity cases so an integrity decision can be made, recorded, and stood behind. Success is a reviewer who trusts the verdict and understands the reasoning well enough to act on it.

## Positioning

The similarity tool that shows its work: a calibrated, explainable verdict, not just a score — one a reviewer can defend line by line.

## Brand Personality

Instrument-grade precision, refined and premium, institutionally authoritative. The voice is calm, exact, and evidence-forward: it states what it measured and how confident it is, never oversells a result, and treats the reader as a professional making a serious judgment. "Premium" here is carried by craft, restraint, and clarity rather than by decoration; the interface should feel like a well-made measuring instrument, not a marketing surface.

## Anti-references

No decorative glow or neon accents. No glassmorphism or blur as a default surface treatment. No gradient text or rainbow accents — emphasis is earned through weight, size, and deliberate color, never a `background-clip` heading. Not the interchangeable SaaS template of identical icon-card grids and a big-number gradient hero. The current UI leans on several of these (glow shadows, `.glass`, `.text-gradient-brand`); they are the identity to move away from, not toward.

## Design Principles

**Evidence over assertion.** Every verdict shows its work. A score never stands alone; the signals, diff, structure, and rationale that produced it are always within reach. If a reviewer cannot see why, the screen has failed regardless of whether the number is right.

**An instrument, not a dashboard.** The interface is a precise measuring tool. Density and legibility beat ornament; restraint reads as confidence. Reach for the plainest treatment that carries the information before any decorative one.

**Accountable by design.** Decisions here get appealed. Favor defensible, recorded, reproducible presentation — clear thresholds, visible confidence, an evidence trail — over persuasive flourish. Fairness to the person under review is a feature, not a courtesy.

**One system, two workflows.** Pairwise analysis and enterprise review are equal first-class surfaces that share one visual vocabulary. A control, state, or affordance means the same thing in both; a reviewer moving between them should never have to relearn the interface.

**Honest about confidence.** The engine is candid that some clone types are advisory, not certain. The UI must signal that confidence honestly and never dress an advisory result as a definitive one. Trust is built by not overstating.

## Accessibility & Inclusion

WCAG 2.2 AA is the floor, reaching AAA where feasible (7:1 body-text contrast, larger hit targets) to support education and institutional procurement. Full bilingual English and Arabic with correct RTL mirroring is already in place and must be preserved on every new surface, including keeping code and data left-to-right within an RTL layout. Every interactive path is keyboard-complete with a visible focus state, and every animation ships a genuine `prefers-reduced-motion` alternative rather than simply disabling motion.
