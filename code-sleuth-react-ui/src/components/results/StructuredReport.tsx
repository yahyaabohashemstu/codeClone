import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import type { StructuredReport as StructuredReportType } from "@/types/api";

const RISK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  critical: XCircle,
  high: ShieldAlert,
  moderate: AlertTriangle,
  low: Info,
  none: ShieldCheck,
};

// Risk maps onto the calibrated green/amber/red system, never off-palette hues.
const RISK_STYLES: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-destructive", bg: "bg-destructive/10" },
  moderate: { color: "text-foreground", bg: "bg-warning/10" },
  low: { color: "text-success", bg: "bg-success/10" },
  none: { color: "text-success", bg: "bg-success/10" },
};

const RISK_LABEL_KEYS: Record<string, string> = {
  critical: "results.structured.riskCritical",
  high: "results.structured.riskHigh",
  moderate: "results.structured.riskModerate",
  low: "results.structured.riskLow",
  none: "results.structured.riskNone",
};

const SEV_DOTS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-success",
  info: "bg-muted-foreground",
};

const SEV_LABEL_KEYS: Record<string, string> = {
  critical: "results.structured.sevCritical",
  high: "results.structured.sevHigh",
  medium: "results.structured.sevMedium",
  low: "results.structured.sevLow",
  info: "results.structured.sevInfo",
};

export function StructuredReport({ data }: { data: StructuredReportType }) {
  const { isRTL } = useLanguage();
  const { t } = useTranslation("results");

  const riskKey = (data.risk_level ?? "none").toLowerCase() as keyof typeof RISK_STYLES;
  const riskStyle = RISK_STYLES[riskKey] ?? RISK_STYLES.none;
  const RiskIcon = RISK_ICONS[riskKey] ?? RISK_ICONS.none;
  const riskLabelKey = RISK_LABEL_KEYS[riskKey] ?? RISK_LABEL_KEYS.none;

  return (
    /* One continuous docket sheet: risk strip, then ruled sections. */
    <div className="border border-border bg-card" dir={isRTL ? "rtl" : "ltr"}>
      {/* Risk reading — the docket's opening strip */}
      <div className={cn("flex items-start gap-3 border-b-2 border-foreground p-5", riskStyle.bg)}>
        <RiskIcon className={cn("mt-0.5 h-5 w-5 shrink-0", riskStyle.color)} />
        <div className="min-w-0">
          <p className={cn("press-slug", riskStyle.color)}>{t(riskLabelKey)}</p>
          {data.verdict && (
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">{data.verdict}</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <section className="border-b border-border px-5 py-4">
          <h4 className="t-label flex items-center gap-2 text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            {t("results.structured.summary")}
          </h4>
          <p className="mt-2.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{data.summary}</p>
        </section>
      )}

      {/* Findings ledger */}
      <section className="border-b border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
          <h4 className="t-label flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-primary" />
            {t("results.structured.findings")}
          </h4>
          {data.findings?.length > 0 && (
            <span className="press-slug tabular-nums">{String(data.findings.length).padStart(2, "0")}</span>
          )}
        </div>
        <div className="divide-y divide-border/50">
          {data.findings?.length > 0 ? (
            data.findings.map((f, i) => {
              const sevDot = SEV_DOTS[f.severity] ?? SEV_DOTS.info;
              const sevLabelKey = SEV_LABEL_KEYS[f.severity] ?? SEV_LABEL_KEYS.info;
              return (
                <div key={i} className="grid grid-cols-[auto_1fr] gap-x-3 px-5 py-3.5">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0", sevDot)} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{f.title}</span>
                      <span className="press-slug text-[9px]">{t(sevLabelKey)}</span>
                    </div>
                    {f.description && (
                      <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">{f.description}</p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t("results.structured.noFindings")}</p>
          )}
        </div>
      </section>

      {/* Refactoring Suggestion */}
      {data.refactoring_suggestion && (
        <section className="px-5 py-4">
          <h4 className="t-label flex items-center gap-2 text-foreground">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            {t("results.structured.suggestion")}
          </h4>
          <p className="mt-2.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{data.refactoring_suggestion}</p>
        </section>
      )}
    </div>
  );
}
