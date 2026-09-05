import * as React from "react";
import { cn } from "@/lib/utils";
import { IconChevronDown } from "@/components/bench/icons";
import type { TagTone } from "@/lib/bands";

/** The band a tag carries. Defined with the bands themselves; re-exported here
 *  because the kit is what most callers import. */
export type { TagTone };

/**
 * The bench kit — the composition primitives of the comparator's instrument
 * table, built 1:1 from the design file's components:
 *
 *   Scale/Ticks · Scale/Ticks Vertical · Tag · Lamp · Segment · Select · Kbd
 *   Button · Plate Header · Plate footer · code lines · readings
 *
 * Every primitive uses the design tokens declared in index.css and the type
 * classes that mirror the Figma text styles. Colour is never the only channel:
 * a tag's label, a lamp's value and a scale's numeral always accompany it.
 */

/* ────────────────────────────────────────────────────────────────────────
   Scale — the engraved 0–100 instrument
   ──────────────────────────────────────────────────────────────────────── */

/** 51 engraved ticks (every fifth one major), spread with space-between. */
export function ScaleTicks({ className, ticks = 51 }: { className?: string; ticks?: number }) {
  return (
    <div aria-hidden className={cn("scale-ticks", className)}>
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={cn("scale-tick", i % 5 === 0 && "scale-tick-major")} />
      ))}
    </div>
  );
}

/**
 * A reading on the scale: fill along the baseline to `value`% and a 2px needle
 * standing at it. `quiet` draws the fill in the tick tone (a signal that sits
 * below its own threshold); `threshold` adds a dashed post with a label.
 */
export function Scale({
  value,
  className,
  quiet = false,
  threshold,
  thresholdLabel,
  label,
  animate = false,
}: {
  value: number;
  className?: string;
  quiet?: boolean;
  threshold?: number;
  thresholdLabel?: string;
  /** Accessible reading. Omit when a labelled parent already announces it. */
  label?: string;
  animate?: boolean;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const th = threshold != null ? Math.max(0, Math.min(100, threshold)) : null;
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("scale", className)}
    >
      <ScaleTicks />
      <span
        className={cn("scale-fill", quiet && "is-quiet", animate && "origin-[left] animate-needle-in rtl:origin-[right]")}
        style={{ width: `${v}%` }}
      />
      <span className="scale-needle" style={{ insetInlineStart: `calc(${v}% - 1px)` }} />
      {th != null && (
        <>
          <span className="scale-threshold" style={{ insetInlineStart: `${th}%` }} />
          {thresholdLabel && (
            <span
              className="label-sm absolute -top-[14px] whitespace-nowrap text-txt-muted"
              style={{ insetInlineStart: `calc(${th}% + 8px)` }}
            >
              {thresholdLabel}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Numerals printed under a scale: 0 · 50 · 100 (or any set). */
export function ScaleNumerals({ marks = [0, 50, 100], className }: { marks?: number[]; className?: string }) {
  return (
    <div aria-hidden className={cn("mono-meta-sm flex items-start justify-between text-txt-muted", className)}>
      {marks.map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );
}

/** Vertical engraved rail (the sign-in rail): 100 at top, 0 at bottom. */
export function ScaleRail({ className, ticks = 51 }: { className?: string; ticks?: number }) {
  return (
    <div aria-hidden className={cn("rail-ticks", className)}>
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={cn("rail-tick", i % 5 === 0 && "rail-tick-major")} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Tag · Lamp · Kbd
   ──────────────────────────────────────────────────────────────────────── */

/** Squared verdict tag. Hot = clone flagged (signal), Advisory = mid reading, Neutral = no clone. */
export function Tag({ tone = "neutral", className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return (
    <span className={cn("tag", tone === "hot" ? "tag-hot" : tone === "advisory" ? "tag-advisory" : "tag-neutral", className)} {...props}>
      {children}
    </span>
  );
}

/** Clone-type indicator lamp: a 10px square, filled with signal when the check fires. */
export function Lamp({
  on,
  label,
  value,
  className,
}: {
  on: boolean;
  label: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rule-t flex h-10 min-w-0 items-center gap-2.5", className)}>
      <span aria-hidden className={cn("lamp", on && "is-on")} />
      <span className={cn("body-compact min-w-0 flex-1 truncate", on ? "text-txt-primary" : "text-txt-secondary")}>{label}</span>
      {value != null && <span className="mono-meta shrink-0 text-txt-muted">{value}</span>}
      <span className="sr-only">{on ? "on" : "off"}</span>
    </div>
  );
}

/** Keyboard hint chip. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("kbd", className)}>{children}</kbd>;
}

/* ────────────────────────────────────────────────────────────────────────
   Segmented control
   ──────────────────────────────────────────────────────────────────────── */

export function SegmentGroup({
  surface = "bench",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { surface?: "bench" | "plate" }) {
  return (
    <div role="group" className={cn(surface === "plate" ? "segment-group-plate" : "segment-group", className)} {...props}>
      {children}
    </div>
  );
}

export function Segment({
  on,
  surface = "bench",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; surface?: "bench" | "plate" }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(surface === "plate" ? "segment-plate" : "segment", on && "is-on", className)}
      {...props}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Select — label + value + chevron in a hairline box (native select beneath)
   ──────────────────────────────────────────────────────────────────────── */

export function BenchSelect({
  label,
  value,
  displayValue,
  options,
  onChange,
  size = "default",
  className,
  id,
  name,
  disabled,
}: {
  label: React.ReactNode;
  value: string;
  /** What to print for the current value (defaults to the option label). */
  displayValue?: React.ReactNode;
  options: Array<{ value: string; label: React.ReactNode }>;
  onChange: (value: string) => void;
  size?: "default" | "large";
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  const large = size === "large";
  return (
    <div
      className={cn(
        "relative inline-flex items-center border border-bench-strong bg-transparent",
        large ? "h-10 gap-3.5 ps-3.5 pe-3" : "h-9 gap-2.5 ps-3 pe-2.5",
        disabled && "opacity-50",
        className,
      )}
      style={{ borderRadius: "var(--radius-control)" }}
    >
      <span className="label pointer-events-none text-txt-muted">{label}</span>
      <span className="ui-control pointer-events-none truncate text-txt-primary">{displayValue ?? current?.label ?? value}</span>
      <IconChevronDown size={large ? 16 : 14} className="pointer-events-none text-txt-secondary" />
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        aria-label={typeof label === "string" ? label : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {typeof o.label === "string" ? o.label : o.value}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Buttons — signal fill with ink text, or a hairline box
   ──────────────────────────────────────────────────────────────────────── */

export const BenchButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "primary" | "secondary" | "disabled";
    size?: "default" | "large";
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    /** FILL width: content left, trailing right. */
    block?: boolean;
  }
>(function BenchButton({ tone = "secondary", size = "default", leading, trailing, block, className, children, disabled, ...props }, ref) {
  const effective = disabled ? "disabled" : tone;
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "btn",
        size === "large" && "btn-lg",
        effective === "primary" ? "btn-primary" : effective === "disabled" ? "btn-disabled" : "btn-secondary",
        block ? "w-full" : "",
        !trailing && "justify-center",
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2">
        {leading}
        <span>{children}</span>
      </span>
      {trailing}
    </button>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   Plates
   ──────────────────────────────────────────────────────────────────────── */

export function Plate({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("plate", className)} {...props}>
      {children}
    </div>
  );
}

/** Lit-plate header strip: identity (label + filename) and either meta or a control slot. */
export function PlateHeader({
  label,
  filename,
  filenameMuted = false,
  meta,
  children,
  className,
}: {
  label: React.ReactNode;
  filename?: React.ReactNode;
  filenameMuted?: boolean;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("plate-strip", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="label shrink-0 text-plate-ink">{label}</span>
        {filename != null && (
          <span className={cn("mono-filename min-w-0 truncate", filenameMuted ? "text-plate-placeholder" : "text-plate-soft")} dir="ltr">
            {filename}
          </span>
        )}
      </div>
      {meta != null && <span className="mono-meta shrink-0 text-plate-soft">{meta}</span>}
      {children}
    </div>
  );
}

export function PlateFooter({ start, end, className }: { start?: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("plate-footer", className)}>
      <span className="min-w-0 truncate">{start}</span>
      <span className="flex shrink-0 items-center gap-2">{end}</span>
    </div>
  );
}

/** The plate's byte meter: an 80×6 track with an ink fill. */
export function PlateMeter({ fraction, className }: { fraction: number; className?: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span aria-hidden className={cn("plate-meter", className)}>
      <span className="plate-meter-fill" style={{ width: `${Math.max(f > 0 ? 2.5 : 0, f * 100)}%` }} />
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Readings & sections
   ──────────────────────────────────────────────────────────────────────── */

/** A ruled reading cell: label, display numeral, mono note. */
export function Reading({
  label,
  value,
  note,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-2.5 py-4", className)}>
      <span className="label text-txt-muted">{label}</span>
      <span className="t-display text-[2.75rem] text-txt-primary">{value}</span>
      {note != null && <span className="mono-meta text-txt-muted">{note}</span>}
    </div>
  );
}

/** Section label — the tracked slug that opens every bench section. */
export function SectionLabel({ children, className, aside }: { children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 pb-4", className)}>
      <span className="label text-txt-muted">{children}</span>
      {aside != null && <span className="body-sm text-txt-secondary">{aside}</span>}
    </div>
  );
}

/** Page header: kicker label + page title on the left, actions on the right (items-end). */
export function PageHeader({
  kicker,
  title,
  actions,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-2.5">
        {kicker != null && <span className="label text-txt-muted">{kicker}</span>}
        <h1 className="t-page text-txt-primary">{title}</h1>
      </div>
      {actions != null && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Quota meter (top bar): 64×8 well with a signal fill. */
export function QuotaMeter({ used, limit, className }: { used: number; limit: number; className?: string }) {
  const f = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;
  return (
    <span aria-hidden className={cn("meter", className)}>
      <span className="meter-fill" style={{ width: `calc(${f * 100}% + 2px)` }} />
    </span>
  );
}
