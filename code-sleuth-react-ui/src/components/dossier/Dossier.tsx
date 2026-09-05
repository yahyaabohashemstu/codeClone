import * as React from "react";
import { cn } from "@/lib/utils";
import { Scale, ScaleTicks, Tag } from "@/components/bench/Bench";

/**
 * Composition kit — re-voiced for the bench.
 *
 * Every screen is laid out on the comparator's bench: readings and ledgers are
 * ruled with hairlines, sources sit on lit plates, verdicts are tagged, and the
 * measured value is always positioned on an engraved scale. These primitives
 * keep their historical names and file path (fifteen pages import from here)
 * but render the design file's components.
 */

/* ────────────────────────────────────────────────────────────────────────
   Marks & instruments
   ──────────────────────────────────────────────────────────────────────── */

/** Registration crosshair — kept for loaders and seam markers. Sized via className. */
export function RegMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("h-4 w-4 shrink-0", className)}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="7" />
      <line x1="12" y1="1" x2="12" y2="23" />
      <line x1="1" y1="12" x2="23" y2="12" />
    </svg>
  );
}

/** The calibration strip — a short engraved scale used as a decorative signature. */
export function ControlStrip({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("scale inline-block w-40", className)}>
      <ScaleTicks ticks={21} />
    </span>
  );
}

/** Verdict tag (legacy name). The label text carries the meaning. */
export function Stamp({
  band,
  children,
  className,
}: {
  band: "pass" | "review" | "flag" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const tone = band === "flag" ? "hot" : band === "review" ? "advisory" : "neutral";
  return (
    <Tag tone={tone} className={className}>
      {children}
    </Tag>
  );
}

/**
 * Compact reading meter (legacy name): the engraved scale with a signal fill
 * and needle at the measured value.
 */
export function OverprintMeter({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  return <Scale value={value} className={cn("w-[110px]", className)} label={label} quiet={value < 50} />;
}

/**
 * The full 0–100 instrument (legacy name): scale with fill, needle, the
 * threshold post at 80 and the numerals 0 · 50 · 100.
 */
export function ScaleRuler({
  value,
  className,
  label,
  threshold = 80,
  thresholdLabel,
}: {
  value: number;
  className?: string;
  label?: string;
  threshold?: number;
  thresholdLabel?: string;
}) {
  return (
    <div className={cn("pt-4", className)}>
      <Scale value={value} threshold={threshold} thresholdLabel={thresholdLabel} label={label} className="h-9 [&>.scale-needle]:h-9 [&>.scale-ticks]:top-6 [&>.scale-ticks]:h-3" />
      <div aria-hidden className="mono-meta-sm mt-2 flex items-start justify-between text-txt-muted">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** Compact A / B lockup: each plate named with its ordinal letter. */
export function PlatePair({
  a,
  b,
  className,
  mono = false,
}: {
  a: React.ReactNode;
  b: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  const textClass = mono ? "mono-filename" : "text-xs font-medium";
  return (
    <span className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="label-tag w-2.5 shrink-0 text-txt-muted">A</span>
        <span className={cn("min-w-0 truncate text-txt-primary", textClass)} dir="auto">{a}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="label-tag w-2.5 shrink-0 text-txt-muted">B</span>
        <span className={cn("min-w-0 truncate text-txt-primary", textClass)} dir="auto">{b}</span>
      </span>
    </span>
  );
}

/** Corner marks are not part of the bench design; kept as a no-op for callers. */
export function CropMarks(_props: { className?: string; inset?: number }) {
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
   Sheet composition
   ──────────────────────────────────────────────────────────────────────── */

/** Inline slug of key·value pairs. */
export function MetaStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <dt className="label text-txt-muted">{item.label}</dt>
          <dd className="mono-value text-txt-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Page header: kicker label, page title, optional description, meta and actions. */
export function Masthead({
  kicker,
  title,
  description,
  meta,
  actions,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: Array<{ label: string; value: React.ReactNode }>;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("pb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2.5">
          {kicker != null && <span className="label text-txt-muted">{kicker}</span>}
          <h1 className="t-page text-txt-primary">{title}</h1>
          {description != null && <p className="body-lg mt-1 max-w-[64ch] text-txt-secondary">{description}</p>}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {meta != null && meta.length > 0 && <MetaStrip items={meta} className="rule-t mt-5 pt-4" />}
    </header>
  );
}

/** The signature margin-label row: a label in the gutter, content in the main column, ruled. */
export function Field({
  label,
  children,
  className,
  align = "start",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center";
}) {
  return (
    <div
      className={cn(
        "rule-t grid grid-cols-1 gap-x-8 gap-y-1.5 py-4 first:border-t-0 sm:grid-cols-[minmax(7rem,12rem)_1fr]",
        align === "center" && "sm:items-center",
        className,
      )}
    >
      <div className="label pt-0.5 text-txt-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A stack of Field rows inside one hairline frame. */
export function FieldSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border border-bench-hair px-5 sm:px-6", className)}>{children}</div>;
}

/**
 * A section of the bench. Two modes:
 *  - `bare`: a labelled section — tracked slug, content flowing on the bench.
 *  - default: a raised hairline panel with a small label strip.
 */
export function Panel({
  label,
  actions,
  children,
  bodyClassName,
  className,
  bare = false,
  marker,
}: {
  label?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  bare?: boolean;
  marker?: React.ReactNode;
}) {
  if (bare) {
    return (
      <section className={className}>
        {(label != null || actions != null) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {label != null ? (
              <h2 className="label flex items-center gap-2 text-txt-muted">
                {marker != null && <span className="mono-ordinal">{marker}</span>}
                {label}
              </h2>
            ) : (
              <span />
            )}
            {actions != null && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }
  return (
    <section className={cn("overflow-hidden border border-bench-hair bg-bench-raised", className)}>
      {(label != null || actions != null) && (
        <div className="flex items-center justify-between gap-3 border-b border-bench-hair px-5 py-3">
          {label != null ? (
            <h2 className="label text-txt-primary">
              {marker != null && <span className="text-txt-muted">{marker} </span>}
              {label}
            </h2>
          ) : (
            <span />
          )}
          {actions != null && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A framed figure for a chart: label strip + body. */
export function Figure({
  n,
  label,
  actions,
  children,
  className,
}: {
  n?: number;
  label: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("overflow-hidden border border-bench-hair", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-bench-hair px-4 py-2.5">
        <span className="label flex items-center gap-2 text-txt-primary">
          {n != null && <span className="mono-ordinal text-txt-muted">{String(n).padStart(2, "0")}</span>}
          {label}
        </span>
        {actions != null && <div className="flex items-center gap-2">{actions}</div>}
      </figcaption>
      <div className="p-4">{children}</div>
    </figure>
  );
}

/** A serial/ordinal chip in the mono voice. */
export function Serial({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "plate-a" | "plate-b";
  className?: string;
}) {
  const toneClass = tone === "primary" ? "border-signal text-signal-bench" : "border-bench-strong text-txt-secondary";
  return (
    <span className={cn("mono-ordinal inline-flex h-6 min-w-6 items-center justify-center border px-1.5", toneClass, className)}>
      {children}
    </span>
  );
}

/** A section header — tracked label with an optional aside, ruled beneath. */
export function SectionHead({
  marker,
  title,
  aside,
  className,
}: {
  marker?: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1", className)}>
      <h2 className="label flex items-center gap-2 text-txt-muted">
        {marker != null && <span className="mono-ordinal">{marker}</span>}
        {title}
      </h2>
      {aside != null && <span className="body-sm text-txt-secondary">{aside}</span>}
    </div>
  );
}

/** A ruled label/value list — the readout. */
export function SpecList({
  rows,
  className,
}: {
  rows: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-bench-hair", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="label text-txt-muted">{row.label}</dt>
          <dd className="mono-value text-txt-primary">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
