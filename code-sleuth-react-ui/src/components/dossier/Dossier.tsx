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
    <header className={cn("border-b border-border pb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker != null && (
            <div className="t-label flex items-center gap-2.5">
              <span className="h-px w-6 bg-primary" />
              {kicker}
            </div>
          )}
          <h1 className="mt-2.5 t-h2">{title}</h1>
          {description != null && <p className="mt-1.5 max-w-[64ch] t-body">{description}</p>}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta != null && meta.length > 0 && <MetaStrip items={meta} className="mt-4" />}
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

/** A flat dossier panel with an optional ruled, mono-labelled header. Border, never shadow. */
export function Panel({
  label,
  actions,
  children,
  bodyClassName,
  className,
}: {
  label?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {(label != null || actions != null) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          {label != null ? <h2 className="t-label text-foreground">{label}</h2> : <span />}
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
          {n != null && <span className="text-primary">{`FIG.${String(n).padStart(2, "0")}`}</span>}
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
        tone === "primary" ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
