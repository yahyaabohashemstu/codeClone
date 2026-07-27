import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The "Press Check" composition kit.
 *
 * Every screen is a registration proof: two code sources are two printing
 * plates (A prints cyan, B magenta), and where they coincide the ink
 * overprints into the violet action colour. These primitives carry that
 * rhetoric — job headers, slug lines, calibration strips, registration
 * marks, verdict stamps — so pages compose a proof sheet instead of a
 * generic dashboard. The file keeps its historical name/path; fifteen
 * pages import from it.
 */

/* ────────────────────────────────────────────────────────────────────────
   Marks & instruments
   ──────────────────────────────────────────────────────────────────────── */

/** Registration crosshair — the ⊕ pressmen align plates by. Sized via className. */
export function RegMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

/** The ink calibration strip — the press sheet's colour control bar. Decorative signature. */
export function ControlStrip({ className }: { className?: string }) {
  const chips = [
    "hsl(var(--plate-a))",
    "hsl(var(--plate-b))",
    "hsl(var(--primary))",
    "hsl(var(--foreground))",
    "hsl(var(--plate-a) / 0.4)",
    "hsl(var(--plate-b) / 0.4)",
    "hsl(var(--warning))",
    "hsl(var(--success))",
    "hsl(var(--destructive))",
  ];
  return (
    <span aria-hidden className={cn("inline-flex border border-border", className)}>
      {chips.map((c, i) => (
        <span key={i} className="h-2.5 w-3.5" style={{ background: c }} />
      ))}
    </span>
  );
}

/** Verdict stamp — pressed on the proof. The label text carries the meaning. */
export function Stamp({
  band,
  children,
  className,
}: {
  band: "pass" | "review" | "flag" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const bandClass =
    band === "pass" ? "stamp-pass" : band === "review" ? "stamp-review" : band === "flag" ? "stamp-flag" : "stamp-neutral";
  return <span className={cn("stamp", bandClass, className)}>{children}</span>;
}

/**
 * The overprint meter — the product's mechanism drawn literally. Plate A's
 * band prints from the left, plate B's from the right; each spans 50% plus
 * half the similarity, so their overlap is EXACTLY the similarity score,
 * rendered in the overprint violet. At 0% the plates barely meet; at 100%
 * they lie in perfect register.
 */
export function OverprintMeter({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  /** Accessible reading. Omit when a labelled parent already announces the value. */
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const half = v / 2;
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative h-3 w-full overflow-hidden border border-border bg-muted", className)}
    >
      {/* plate A — cyan, from the left */}
      <span
        aria-hidden
        className="absolute inset-y-0 start-0"
        style={{ width: `${50 + half}%`, background: "hsl(var(--plate-a) / 0.55)" }}
      />
      {/* plate B — magenta, from the right */}
      <span
        aria-hidden
        className="absolute inset-y-0 end-0"
        style={{ width: `${50 + half}%`, background: "hsl(var(--plate-b) / 0.55)" }}
      />
      {/* the overprint — where both plates put ink down */}
      {v > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0"
          style={{
            insetInlineStart: `${50 - half}%`,
            width: `${v}%`,
            background: "hsl(var(--primary))",
          }}
        />
      )}
    </div>
  );
}

/**
 * The graded scale ruler — the printed instrument a verdict is read against.
 * A 0–100 track built from the three calibrated bands (< 50 pass, 50–79
 * review, ≥ 80 flag) with threshold ticks and a needle at the measured
 * value. The score is POSITIONED on the scale rather than merely labelled.
 * Mirrors correctly in RTL via logical insets.
 */
export function ScaleRuler({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const ticks = [0, 50, 80, 100];
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative pt-1", className)}
    >
      {/* the graded track */}
      <div className="relative flex h-2.5 border border-border">
        <span aria-hidden className="h-full" style={{ width: "50%", background: "hsl(var(--success) / 0.28)" }} />
        <span aria-hidden className="h-full" style={{ width: "30%", background: "hsl(var(--warning) / 0.38)" }} />
        <span aria-hidden className="h-full" style={{ width: "20%", background: "hsl(var(--destructive) / 0.3)" }} />
        {/* the needle */}
        <span
          aria-hidden
          className="absolute -top-1 bottom-0 w-0.5 bg-foreground"
          style={{ insetInlineStart: `calc(${v}% - 1px)` }}
        />
      </div>
      {/* threshold ticks */}
      <div aria-hidden className="relative mt-0.5 h-4">
        {ticks.map((t) => (
          <span
            key={t}
            className="press-slug absolute -translate-x-1/2 text-[9px] rtl:translate-x-1/2"
            style={{ insetInlineStart: `${t}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compact A-over-B lockup: the two plates named, each with its ink swatch. */
export function PlatePair({
  a,
  b,
  className,
  mono = false,
}: {
  a: React.ReactNode;
  b: React.ReactNode;
  className?: string;
  /** Set when the labels are code/file names. */
  mono?: boolean;
}) {
  const textClass = mono ? "font-mono text-xs" : "text-xs font-medium";
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 bg-plate-a" />
        <span className={cn("min-w-0 truncate text-foreground", textClass)} dir="auto">{a}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 shrink-0 bg-plate-b" />
        <span className={cn("min-w-0 truncate text-foreground", textClass)} dir="auto">{b}</span>
      </span>
    </span>
  );
}

/** Corner crop marks for a sheet. Parent must be `relative`; marks sit just inside the trim. */
export function CropMarks({ className, inset = 0 }: { className?: string; inset?: number }) {
  const pos = `${inset}px`;
  const arm = "0.75rem";
  const line = "1.5px";
  const color = "hsl(var(--muted-foreground) / 0.55)";
  const corners: Array<React.CSSProperties> = [
    { top: pos, left: pos, borderTop: `${line} solid ${color}`, borderLeft: `${line} solid ${color}` },
    { top: pos, right: pos, borderTop: `${line} solid ${color}`, borderRight: `${line} solid ${color}` },
    { bottom: pos, left: pos, borderBottom: `${line} solid ${color}`, borderLeft: `${line} solid ${color}` },
    { bottom: pos, right: pos, borderBottom: `${line} solid ${color}`, borderRight: `${line} solid ${color}` },
  ];
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {corners.map((style, i) => (
        <span key={i} className="absolute" style={{ width: arm, height: arm, ...style }} />
      ))}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Sheet composition
   ──────────────────────────────────────────────────────────────────────── */

/** Inline slug of key·value pairs — the job line set along a sheet's edge. */
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
          <dt className="press-slug">{item.label}</dt>
          <dd className="font-display text-xs font-bold tabular-nums text-foreground" style={{ fontStretch: "106%" }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Job header: slug kicker, expanded-caps title, optional slug meta and actions.
    Sits above the double rule that opens every printed job sheet. */
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
    <header
      className={cn("border-b-4 border-foreground pb-5", className)}
      style={{ borderBottomStyle: "double" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker != null && (
            <div className="t-label flex items-center gap-2 text-muted-foreground">
              <span className="reg-dot h-3 w-3 text-primary" />
              {kicker}
            </div>
          )}
          <h1 className="t-h1 mt-3 text-foreground" style={{ fontSize: "clamp(1.7rem, 3.2vw, 2.5rem)", textWrap: "balance" }}>
            {title}
          </h1>
          {description != null && <p className="t-body mt-2.5 max-w-[64ch] normal-case">{description}</p>}
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta != null && meta.length > 0 && <MetaStrip items={meta} className="mt-5" />}
    </header>
  );
}

/** The signature margin-label row: a slug label in the gutter, content in the main column, ruled. */
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

/** A stack of Field rows inside one hairline sheet (a printed form). */
export function FieldSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border border-border bg-card px-5 sm:px-6", className)}>{children}</div>;
}

/**
 * A proof panel. Two modes:
 *  - default: a flat hairline SHEET with a small slug header strip.
 *  - `bare`: a ruled SECTION — heavy rule header, content flowing on the
 *    page. Use `bare` for primary page sections so the page reads as one
 *    printed sheet rather than a stack of cards. `marker` prints a serial.
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
              <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground" style={{ fontStretch: "114%" }}>
                {marker != null && <span className="press-slug">{marker}</span>}
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
    <section className={cn("overflow-hidden border border-border bg-card", className)}>
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

/** A framed figure for a chart/visual: slug "FIG NN" caption + label. */
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
    <figure className={cn("overflow-hidden border border-border bg-card", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="t-label flex items-center gap-2 text-foreground">
          {n != null && <span className="text-muted-foreground">{`FIG ${String(n).padStart(2, "0")}`}</span>}
          {label}
        </span>
        {actions != null && <div className="flex items-center gap-2">{actions}</div>}
      </figcaption>
      <div className="p-4">{children}</div>
    </figure>
  );
}

/**
 * A plate/serial marker. `plate-a` frames cyan, `plate-b` magenta — the two
 * sources' printed identities. `primary`/`muted` remain for neutral serials.
 */
export function Serial({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "plate-a" | "plate-b";
  className?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/50 bg-primary/10 text-foreground"
      : tone === "plate-a"
        ? "border-plate-a bg-plate-a/10 text-plate-a-deep"
        : tone === "plate-b"
          ? "border-plate-b bg-plate-b/10 text-plate-b-deep"
          : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center border px-1.5 font-display text-[11px] font-bold tabular-nums",
        toneClass,
        className,
      )}
      style={{ fontStretch: "112%" }}
    >
      {children}
    </span>
  );
}

/** A ruled section header — marker + caps title under a heavy 2px rule. */
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
      <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground" style={{ fontStretch: "114%" }}>
        {marker != null && <span className="press-slug">{marker}</span>}
        {title}
      </h2>
      {aside != null && <span className="press-slug">{aside}</span>}
    </div>
  );
}

/** A vertical spec sheet: ruled slug label/value rows — the density readout. */
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
          <dt className="press-slug">{row.label}</dt>
          <dd className="font-display text-sm font-bold tabular-nums text-foreground" style={{ fontStretch: "108%" }}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
