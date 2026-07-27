import { cn } from "@/lib/utils";

/**
 * The Clone Lens mark — the approved artwork, path-for-path.
 *
 * C is the lens (violet), L is what the lens finds (ink), and the handle
 * completes the instrument. The two inks default to the live theme tokens so
 * the mark tracks light/dark automatically; pass explicit colours only where
 * the surface is fixed regardless of theme (the auth rail).
 *
 * Aspect ratio is 245.98 : 187.74 (≈1.31:1) — size it by HEIGHT and let the
 * width follow, never the other way round.
 */
export function BrandMark({
  className,
  lens = "hsl(var(--primary))",
  letter = "hsl(var(--foreground))",
  title,
}: {
  className?: string;
  /** The C-ring and handle. */
  lens?: string;
  /** The L. */
  letter?: string;
  /** Supply only when the mark is the sole label; otherwise it stays decorative. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 245.98 187.74"
      className={cn("block w-auto", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* handle */}
      <path
        fill={lens}
        d="M235.51,175.82l-85.88-41.6h0c5.78-11.94,20.15-16.93,32.08-11.14l64.27,31.13-10.47,21.61Z"
      />
      {/* the C — the lens ring */}
      <path
        fill={lens}
        d="M187.75,93.61l-28.71.08c-.02-7.24-1.24-14.37-3.61-21.2-5.67-16.31-17.46-29.5-33.22-37.13-9.19-4.45-19.03-6.68-28.87-6.63-7.03.03-14.06,1.22-20.85,3.58-1.07.37-2.12.77-3.16,1.19-14.85,6.03-26.84,17.3-33.97,32.03-7.63,15.75-8.72,33.41-3.05,49.72,11.79,33.95,49,51.97,82.94,40.18,6.84-2.38,13.19-5.85,18.88-10.32l17.74,22.59c-8.2,6.44-17.35,11.44-27.19,14.86-23.56,8.18-49.01,6.64-71.67-4.34-22.66-10.97-39.65-29.99-47.83-53.54C-3,101.12-1.46,75.67,9.51,53.01,20.49,30.35,39.51,13.36,63.06,5.18c2.08-.72,4.17-1.36,6.27-1.93C77.23,1.11,85.29.03,93.34,0c14.13-.05,28.23,3.14,41.39,9.51,11.33,5.49,21.24,12.99,29.34,22.06,8.1,9.07,14.4,19.71,18.49,31.49,3.42,9.85,5.17,20.13,5.19,30.55Z"
      />
      {/* the L */}
      <path
        fill={letter}
        d="M141.15,93.87c0,6.63-2.69,12.63-7.04,16.98-4.34,4.34-10.35,7.03-16.98,7.03h-47.8V3.25C77.23,1.11,85.29.03,93.34,0v93.87h47.81Z"
      />
    </svg>
  );
}

/** The mark plus the name, locked up. Sized by the mark's height. */
export function BrandLockup({
  className,
  markClassName = "h-8",
  lens,
  letter,
  wordClassName,
}: {
  className?: string;
  markClassName?: string;
  lens?: string;
  letter?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={cn("shrink-0", markClassName)} lens={lens} letter={letter} />
      <span
        className={cn("font-display font-extrabold uppercase leading-none tracking-wide", wordClassName)}
        style={{ fontStretch: "118%" }}
      >
        Clone Lens
      </span>
    </span>
  );
}
