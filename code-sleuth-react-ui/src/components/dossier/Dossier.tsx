import * as React from "react";
import { Link } from "react-router-dom";
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
  prefix = "FIG",
}: {
  n?: number;
  label: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  prefix?: string;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="t-label flex items-center gap-2 text-foreground">
          {n != null && <span className="text-primary">{`${prefix}.${String(n).padStart(2, "0")}`}</span>}
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

/* ───────────────────────────────────────────────────────────────────────────
   Instrument primitives — readings, tags, meters, ledgers, transcript, notices.
   These extend the case-file vocabulary so page BODIES compose from one kit
   instead of hand-rolling stat-tiles, tables, chat bubbles, and alert cards.
   ─────────────────────────────────────────────────────────────────────────── */

type Tone =
  | "neutral" | "muted" | "primary" | "signal"
  | "success" | "ok" | "warning" | "warn" | "near"
  | "danger" | "over" | "accent";

// Colour encodes meaning only. `warning` uses ink text on an amber tint (amber
// text on warm paper fails AA), matching the .badge-warning rule.
const TONE_TAG: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  muted: "border-border text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  signal: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  ok: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/50 bg-warning/15 text-foreground",
  warn: "border-warning/50 bg-warning/15 text-foreground",
  near: "border-warning/50 bg-warning/15 text-foreground",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  over: "border-destructive/40 bg-destructive/10 text-destructive",
  accent: "border-border text-foreground",
};

/** A single instrument reading: mono UPPERCASE label + tabular value. The atom of MetaStrip. */
export function Reading({
  label,
  value,
  tone = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const valTone =
    tone === "primary" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "warning" ? "text-foreground"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className={cn("flex items-center gap-2 font-mono text-xs", className)}>
      <span className="uppercase tracking-[0.12em] text-muted-foreground/80">{label}</span>
      <span className={cn("font-semibold tabular-nums", valTone)}>{value}</span>
    </div>
  );
}

/** Square mono status stamp — the colour encodes state, never decoration. */
export function StatusTag({ tone = "muted", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] tabular-nums", TONE_TAG[tone], className)}>
      {children}
    </span>
  );
}

/** Square categorical word tag — Serial's sibling for words, not numbers. */
export function Tag({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]", TONE_TAG[tone], className)}>
      {children}
    </span>
  );
}

/** The calibrated similarity band for a 0–100 score: green <50 · amber 50–79 · red ≥80. */
export function scoreBand(v: number): "success" | "warning" | "danger" {
  return v >= 80 ? "danger" : v >= 50 ? "warning" : "success";
}

/** A verdict stamp derived from a similarity score, in the calibrated scale. */
export function Verdict({ score, className }: { score: number; className?: string }) {
  const band = scoreBand(score);
  const label = band === "danger" ? "LIKELY CLONE" : band === "warning" ? "PROBABLE" : "WEAK MATCH";
  return <StatusTag tone={band} className={className}>{label}</StatusTag>;
}

/** Ruled section divider: §NN (or a tick) + a mono label over a hairline. */
export function SectionRule({ n, tick = true, children, className }: { n?: React.ReactNode; tick?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-baseline gap-3 border-b border-border pb-2", className)}>
      {n != null && <span className="font-mono text-xs font-bold tabular-nums text-primary">{`§${n}`}</span>}
      {tick && n == null && <span className="h-px w-6 self-center bg-primary" />}
      <h2 className="t-label text-foreground">{children}</h2>
    </div>
  );
}

/** Horizontal semantic meter — the fill colour encodes the amount, not a fixed brand hue. */
export function Meter({
  value,
  max = 100,
  tone = "primary",
  ticks,
  className,
  ariaLabel,
}: {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "danger" | "auto";
  ticks?: number[];
  className?: string;
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved = tone === "auto" ? scoreBand(pct) : tone;
  const fill =
    resolved === "success" ? "bg-success"
    : resolved === "warning" ? "bg-warning"
    : resolved === "danger" ? "bg-destructive"
    : "bg-primary";
  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-[2px] bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className={cn("h-full rounded-[2px] transition-[width] duration-500 motion-reduce:transition-none", fill)} style={{ width: `${pct}%` }} />
      {ticks?.map((t) => (
        <span key={t} className="absolute top-0 h-full w-px bg-background/70" style={{ insetInlineStart: `${t}%` }} />
      ))}
    </div>
  );
}

/** Similarity readout: a band-coloured meter + its value in the same band, mono tabular. */
export function ScoreMeter({ value, className }: { value: number; className?: string }) {
  const band = scoreBand(value);
  const text = band === "success" ? "text-success" : band === "warning" ? "text-foreground" : "text-destructive";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Meter value={value} tone="auto" className="h-3.5 flex-1" ariaLabel={`similarity ${Math.round(value)} percent`} />
      <span className={cn("w-12 shrink-0 text-end font-mono text-sm font-bold tabular-nums", text)}>{Math.round(value)}%</span>
    </div>
  );
}

/* ── Ledger: the shared ruled table. One `columns` string drives head + rows. ── */
const LedgerCtx = React.createContext<string>("");
export const ledgerHeadClass = "bg-muted/40 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function Ledger({ columns, children, className }: { columns: string; children: React.ReactNode; className?: string }) {
  return (
    <LedgerCtx.Provider value={columns}>
      <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
        <div className="scrollbar-thin overflow-x-auto" role="table">{children}</div>
      </div>
    </LedgerCtx.Provider>
  );
}

export function LedgerHead({ cells, aligns }: { cells: React.ReactNode[]; aligns?: Array<"start" | "end"> }) {
  const columns = React.useContext(LedgerCtx);
  return (
    <div className={cn("grid items-center gap-x-4", ledgerHeadClass)} style={{ gridTemplateColumns: columns }} role="row">
      {cells.map((c, i) => (
        <div key={i} role="columnheader" className={aligns?.[i] === "end" ? "text-end" : "text-start"}>{c}</div>
      ))}
    </div>
  );
}

export function LedgerRow({ children, to, onClick, className }: { children: React.ReactNode; to?: string; onClick?: () => void; className?: string }) {
  const columns = React.useContext(LedgerCtx);
  const interactive = to != null || onClick != null;
  const grid = (
    <div
      className={cn("grid items-center gap-x-4 border-t border-border px-4 py-3", interactive && "transition-colors hover:bg-muted", className)}
      style={{ gridTemplateColumns: columns }}
      role="row"
    >
      {children}
    </div>
  );
  if (to) return <Link to={to} className="block">{grid}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-start">{grid}</button>;
  return grid;
}

export function LedgerCell({ children, align, mono, className }: { children?: React.ReactNode; align?: "end"; mono?: boolean; className?: string }) {
  return <div role="cell" className={cn("min-w-0", align === "end" && "text-end", mono && "font-mono tabular-nums", className)}>{children}</div>;
}

export function LedgerFooter({ left, right, className }: { left?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground", className)}>
      <span>{left}</span>
      <span className="tabular-nums text-foreground">{right}</span>
    </div>
  );
}

/** Empty / fault / loading rows framed inside a Ledger. */
export function LedgerEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-5 py-8 text-sm text-muted-foreground">
      <Serial>00</Serial>
      <span>{children}</span>
    </div>
  );
}

export function LedgerFault({ children, onRetry, retryLabel = "Retry" }: { children: React.ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-6 text-sm">
      <Serial className="border-destructive/40 bg-destructive/10 text-destructive">!!</Serial>
      <span className="text-foreground">{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-mono text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function LedgerSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border px-5 py-3.5">
          <span className="skeleton h-3 w-6" />
          <span className="skeleton h-3 flex-1" />
          <span className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Segmented filter/tally chips — shows the distribution instead of hiding it in a dropdown. */
export function Register({
  items,
  active,
  onSelect,
  className,
}: {
  items: Array<{ value: string; label: React.ReactNode; count?: number }>;
  active?: string;
  onSelect?: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group">
      {items.map((it) => {
        const on = it.value === active;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect?.(it.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
              on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            <span>{it.label}</span>
            {it.count != null && <span className="tabular-nums font-semibold">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A numbered index row: Serial gutter + title/desc + a right-aligned cross-reference. */
export function IndexRow({
  serial,
  icon,
  title,
  meta,
  children,
  to,
  className,
}: {
  serial: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  to?: string;
  className?: string;
}) {
  const body = (
    <div className={cn("grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-4", to && "transition-colors hover:bg-muted", className)}>
      <div className="flex items-center gap-2.5 pt-0.5">
        {serial}
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-foreground">{title}</div>
        {children && <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>}
      </div>
      {meta != null && <div className="pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{meta}</div>}
    </div>
  );
  if (to) return <Link to={to} className="block">{body}</Link>;
  return body;
}

/** A ruled conversation log — margin-labelled turns, no chat bubbles. */
export function Transcript({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function TranscriptTurn({
  role,
  serial,
  speaker,
  time,
  children,
  className,
}: {
  role: "user" | "assistant";
  serial?: React.ReactNode;
  speaker: React.ReactNode;
  time?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-x-6 gap-y-2 border-t border-border py-4 first:border-t-0 sm:grid-cols-[minmax(6rem,9rem)_1fr]", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {serial}
        <span className="t-label">{speaker}</span>
        {time != null && <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{time}</span>}
      </div>
      <div className={cn("min-w-0 whitespace-pre-wrap text-sm leading-relaxed text-foreground", role === "assistant" && "border-s-2 border-primary/40 ps-4")}>
        {children}
      </div>
    </div>
  );
}

/** A flat ruled notice — an inline-start accent edge, not a filled colour card. */
export function Notice({
  tone = "info",
  label,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const bar =
    tone === "warning" ? "bg-warning"
    : tone === "danger" ? "bg-destructive"
    : tone === "success" ? "bg-success"
    : "bg-primary";
  return (
    <div className={cn("flex overflow-hidden border-y border-border bg-card", className)}>
      <span className={cn("w-0.5 shrink-0", bar)} aria-hidden="true" />
      <div className="px-4 py-3">
        {label != null && <div className="t-label text-foreground">{label}</div>}
        <div className={cn("text-sm leading-relaxed text-muted-foreground", label != null && "mt-1")}>{children}</div>
      </div>
    </div>
  );
}
