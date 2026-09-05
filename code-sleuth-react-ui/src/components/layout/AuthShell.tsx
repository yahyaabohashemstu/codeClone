import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "@/components/brand/BrandMark";
import { ScaleRail, ScaleTicks } from "@/components/bench/Bench";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

/**
 * The access screen (design: "Sign in", node 9:2). A 56px engraved rail on
 * the left edge, a 520px statement column, and the ACCESS plate centred in
 * the remaining bench with the legal links pinned bottom-right.
 */
export function AuthShell({
  children,
  stripLabel,
  serial,
}: {
  children: React.ReactNode;
  stripLabel?: React.ReactNode;
  serial?: React.ReactNode;
}) {
  const { t } = useTranslation("auth");
  const { language, toggleLanguage } = useLanguage();

  return (
    <div className="relative flex min-h-screen flex-col bg-bench-base text-txt-primary lg:flex-row">
      {/* The rail — 100 at the top, 0 at the bottom */}
      <aside aria-hidden className="relative hidden w-14 shrink-0 border-e border-bench-hair lg:block">
        <ScaleRail />
        <span className="mono-meta-sm absolute start-2.5 top-3 text-txt-muted">100</span>
        <span className="mono-meta-sm absolute start-2.5 top-1/2 -translate-y-1/2 text-txt-muted">50</span>
        <span className="mono-meta-sm absolute start-2.5 bottom-3 text-txt-muted">0</span>
      </aside>

      {/* Statement column */}
      <section className="flex w-full shrink-0 flex-col px-6 pb-6 pt-8 sm:px-10 sm:pt-10 lg:min-h-screen lg:w-[520px] lg:pb-10">
        <Link to="/" className="inline-flex w-fit items-center" aria-label="Clone Lens">
          <BrandLockup markClassName="h-[22px]" />
        </Link>

        <div className="my-auto max-w-[380px] py-8 lg:py-0">
          <h1 className="t-statement text-txt-primary">{t("auth.bench.statement")}</h1>
          <p className="body-lg mt-4 text-txt-secondary">{t("auth.bench.statementBody")}</p>
          <p className="rule-t mt-7 pt-3.5 text-[12.5px] leading-[1.5] text-txt-muted">{t("auth.bench.scopeNote")}</p>
        </div>

        <div aria-hidden className="hidden w-[440px] lg:block">
          <div className="scale h-[14px] [&_.scale-tick]:h-[7px] [&_.scale-tick-major]:h-[14px]">
            <ScaleTicks />
          </div>
          <div className="mono-meta mt-3.5 flex items-center justify-between text-txt-muted" dir="ltr">
            <span>v1.0</span>
            <span>15 languages</span>
            <span>calibration 2026-07</span>
          </div>
        </div>
      </section>

      {/* The access plate, centred on the remaining bench */}
      <main className="flex flex-1 items-start justify-center px-4 pb-28 pt-2 sm:px-10 lg:items-center lg:py-10">
        <div className={cn("plate w-full max-w-[520px]")}>
          <div className="plate-strip !px-5">
            <span className="label text-plate-ink">{stripLabel ?? t("auth.bench.plateStrip")}</span>
            <span className="mono-meta uppercase text-plate-placeholder" dir="ltr">
              {serial ?? t("auth.bench.plateSerial")}
            </span>
          </div>
          <div className="px-6 pb-9 pt-8 sm:px-10">{children}</div>
        </div>
      </main>

      {/* Legal links + language, bottom-right of the bench */}
      <nav className="absolute bottom-10 end-6 flex items-center gap-5 text-[12.5px] text-txt-secondary sm:end-10">
        <button type="button" onClick={toggleLanguage} className="label text-txt-muted hover:text-txt-primary" aria-label={language === "en" ? "العربية" : "English"}>
          {language === "en" ? "AR" : "EN"}
        </button>
        <Link to="/terms" className="hover:text-txt-primary">{t("auth.bench.legalTerms")}</Link>
        <Link to="/privacy" className="hover:text-txt-primary">{t("auth.bench.legalPrivacy")}</Link>
        <Link to="/status" className="hover:text-txt-primary">{t("auth.bench.legalStatus")}</Link>
      </nav>
    </div>
  );
}

/** The plate's title block: 72px display word + a 14px qualifier. */
export function PlateTitle({ word, qualifier }: { word: React.ReactNode; qualifier?: React.ReactNode }) {
  return (
    <div>
      <h2 className="t-display text-[72px] text-plate-ink [html[lang=ar]_&]:text-[52px] [html[lang=ar]_&]:leading-[1.1]">{word}</h2>
      {qualifier != null && <p className="mt-2.5 text-sm text-plate-soft">{qualifier}</p>}
    </div>
  );
}

/** A labelled field on the plate: label row (label + optional aside) above a 44px well. */
export function PlateField({
  label,
  aside,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="label text-plate-soft">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Feedback on the plate. Errors carry the signal edge; notices a soft one. */
export function PlateNotice({ tone, children, role }: { tone: "error" | "notice"; children: React.ReactNode; role?: "alert" | "status" }) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn(
        "border px-3.5 py-3 text-[13px] leading-[1.5]",
        tone === "error" ? "border-signal text-signal-plate" : "border-plate-stroke text-plate-soft",
      )}
    >
      {children}
    </div>
  );
}
