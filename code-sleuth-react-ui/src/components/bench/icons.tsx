import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The instrument's icon set — the exact vectors exported from the design file
 * (16px stroke icons, 1.5px strokes, square caps). The path data is the
 * exported asset verbatim; only the stroke colour is bound to `currentColor`
 * so each icon recolours with the text it sits beside.
 */

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, className, children, viewBox = "0 0 16 16", ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      aria-hidden={props["aria-label"] ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Icon/arrow-right */
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 8H13M9 12L13 8L9 4" />
  </Icon>
);

/** Icon/chevron-down */
export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6L8 10L12 6" />
  </Icon>
);

/** Icon/chevron-left (14px in the design) */
export const IconChevronLeft = ({ size = 14, ...p }: IconProps) => (
  <Icon size={size} viewBox="0 0 14 14" {...p}>
    <path d="M8.75 3.5L5.25 7L8.75 10.5" />
  </Icon>
);

/** Icon/chevron-right (14px in the design) */
export const IconChevronRight = ({ size = 14, ...p }: IconProps) => (
  <Icon size={size} viewBox="0 0 14 14" {...p}>
    <path d="M5.25 3.5L8.75 7L5.25 10.5" />
  </Icon>
);

/** Icon/swap */
export const IconSwap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5H12M9 8L12 5L9 2M13 11H4M7 14L4 11L7 8" />
  </Icon>
);

/** Icon/download */
export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2V10M11.5 6.5L8 10L4.5 6.5M2.5 13.5H13.5" />
  </Icon>
);

/** Icon/share */
export const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 10V2M11.5 5.5L8 2L4.5 5.5M3 9V13.5H13V9" />
  </Icon>
);

/** Icon/rerun */
export const IconRerun = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8C12.9933 9.15335 12.588 10.2689 11.8529 11.1576C11.1177 12.0464 10.098 12.6537 8.96634 12.8765C7.83471 13.0994 6.66082 12.9242 5.64358 12.3807C4.62634 11.8371 3.82831 10.9585 3.3847 9.89388C2.9411 8.82922 2.8792 7.64395 3.20951 6.53888C3.53981 5.43382 4.242 4.47693 5.1971 3.83035C6.15219 3.18378 7.30145 2.88728 8.45014 2.99109C9.59883 3.09491 10.6763 3.59266 11.5 4.4M13 2V5H10" />
  </Icon>
);

/** Icon/search */
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 11.5C9.48528 11.5 11.5 9.48528 11.5 7C11.5 4.51472 9.48528 2.5 7 2.5C4.51472 2.5 2.5 4.51472 2.5 7C2.5 9.48528 4.51472 11.5 7 11.5Z" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
);

/** Icon/file-plus (24/28px in the design) */
export const IconFilePlus = ({ size = 28, ...p }: IconProps) => (
  <Icon size={size} viewBox="0 0 28 28" {...p}>
    <path d="M22.1667 9.33333L16.3333 3.5H7V24.5H22.1667V9.33333ZM16.3333 3.5V9.33333H22.1667M14 12.8333V19.8333M10.5 16.3333H17.5" />
  </Icon>
);
