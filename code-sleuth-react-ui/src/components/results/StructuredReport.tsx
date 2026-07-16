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
  critical: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  high: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
  moderate: { color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  low: { color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
  none: { color: "text-success", bg: "bg-success/10 border-success/30" },
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
  low: "bg-muted-foreground",
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
    <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
      {/* Risk Badge + Verdict */}
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", riskStyle.bg)}>
        <RiskIcon className={cn("mt-0.5 h-5 w-5 shrink-0", riskStyle.color)} />
        <div className="min-w-0">
          <p className={cn("text-xs font-semibold uppercase tracking-wide", riskStyle.color)}>
            {t(riskLabelKey)}
          </p>
          {data.verdict && (
            <p className="mt-1 text-sm font-medium text-foreground">{data.verdict}</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {t("results.structured.summary")}
            </h4>
          </div>
          <p className="px-5 py-4 text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
        </div>
      )}

      {/* Findings */}
      <div className="card-premium overflow-hidden">
        <div className="border-b border-border/50 px-5 py-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-primary" />
            {t("results.structured.findings")}
            {data.findings?.length > 0 && (
              <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {data.findings.length}
              </span>
            )}
          </h4>
        </div>
        <div className="divide-y divide-border/40">
          {data.findings?.length > 0 ? data.findings.map((f, i) => {
            const sevDot = SEV_DOTS[f.severity] ?? SEV_DOTS.info;
            const sevLabelKey = SEV_LABEL_KEYS[f.severity] ?? SEV_LABEL_KEYS.info;
            return (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sevDot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{f.title}</span>
                    <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold opacity-70" style={{ color: "inherit" }}>
                      {t(sevLabelKey)}
                    </span>
                  </div>
                  {f.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                  )}
                </div>
              </div>
            );
          }) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t("results.structured.noFindings")}</p>
          )}
        </div>
      </div>

      {/* Refactoring Suggestion */}
      {data.refactoring_suggestion && (
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              {t("results.structured.suggestion")}
            </h4>
          </div>
          <p className="px-5 py-4 text-sm text-muted-foreground leading-relaxed">{data.refactoring_suggestion}</p>
        </div>
      )}
    </div>
  );
}
