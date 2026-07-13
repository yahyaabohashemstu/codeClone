import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The "Evidence Dossier" composition kit.
 *
 * These primitives give every screen the rhetoric of a forensic case file —
 * ruled mastheads, monospace meta strips, margin-label fields, figure-framed
 * charts — instead of the generic "title + row of stat cards + content" dashboard
 * template. Compose pages from these; don't reinvent the header/card each time.
 */

/** Inline monospace key:value pairs, hairline-separated — a document header line. */
export function MetaStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <dt className="uppercase tracking-[0.12em] text-muted-foreground/70">{item.label}</dt>
          <dd className="font-semibold tabular-nums text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Case-file masthead: a mono kicker, a mono title, an optional meta strip and actions. Ruled, not boxed. */
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
    <header className={cn("border-b-2 border-foreground pb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker != null && (
            <div className="t-label flex items-center gap-2.5">
              <span className="h-px w-8 bg-primary" />
              {kicker}
            </div>
          )}
          {/* Editorial case-file title: large fluid display, heavy rule beneath. */}
          <h1
            className="mt-3 font-display font-bold leading-[1.05] tracking-[-0.02em] text-foreground"
            style={{ fontSize: "clamp(1.7rem, 3.2vw, 2.5rem)" }}
          >
            {title}
          </h1>
          {description != null && <p className="mt-2 max-w-[64ch] t-body">{description}</p>}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta != null && meta.length > 0 && <MetaStrip items={meta} className="mt-5" />}
    </header>
  );
}

/** The signature margin-label row: an uppercase mono label in the gutter, content in the main column, ruled. */
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
        "grid grid-cols-1 gap-x-8 gap-y-1.5 border-t border-border py-4 first:border-t-0 sm:grid-cols-[minmax(7rem,12rem)_1fr]",
        align === "center" && "sm:items-center",
        className,
      )}
    >
      <div className="t-label pt-0.5">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A stack of Field rows inside one hairline-bordered container (a printed form / spec sheet). */
export function FieldSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-card px-5 sm:px-6", className)}>{children}</div>;
}

/**
 * A dossier panel. Two modes:
 *  - default: a flat bordered CARD (border, never shadow) with a small mono header.
 *  - `bare`: a ruled editorial SECTION — a heavy §-rule header and content flowing
 *    on the page, no box. Use `bare` for primary page sections so the page reads as
 *    a printed case file rather than a stack of cards. `marker` prints a §/serial.
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
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2.5">
            {label != null ? (
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
                {marker != null && <span className="text-muted-foreground">{marker} </span>}
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
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(label != null || actions != null) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          {label != null ? (
            <h2 className="t-label text-foreground">
              {marker != null && <span className="text-muted-foreground">{marker} </span>}
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

/** A framed figure for a chart/visual: a mono "FIG.NN" caption + label. */
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
    <figure className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="t-label flex items-center gap-2 text-foreground">
          {n != null && <span className="text-muted-foreground">{`FIG.${String(n).padStart(2, "0")}`}</span>}
          {label}
        </span>
        {actions != null && <div className="flex items-center gap-2">{actions}</div>}
      </figcaption>
      <div className="p-4">{children}</div>
    </figure>
  );
}

/** A monospace index/serial marker (e.g. an exhibit or row number) — squared, hairline. */
export function Serial({ children, tone = "muted", className }: { children: React.ReactNode; tone?: "muted" | "primary"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm border px-1.5 font-mono text-[11px] font-bold tabular-nums",
        tone === "primary" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A ruled editorial section header — an optional §/serial marker + a mono title,
 * an optional right-aligned reading, all sitting under a HEAVY 2px rule. This is
 * the case-file section break that carries the editorial voice inside a page.
 */
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
    <div className={cn("mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2.5", className)}>
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
        {marker != null && <span className="text-muted-foreground">{marker} </span>}
        {title}
      </h2>
      {aside != null && (
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{aside}</span>
      )}
    </div>
  );
}

/** A vertical spec sheet: ruled mono label/value rows — the evidence-file reading. */
export function SpecList({
  rows,
  className,
}: {
  rows: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="font-mono text-[11px] uppercase leading-tight tracking-[0.1em] text-muted-foreground">{row.label}</dt>
          <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
