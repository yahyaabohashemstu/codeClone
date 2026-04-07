import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import type { StructuredReport as StructuredReportType } from "@/types/api";

const RISK_META: Record<string, { label: string; labelAr: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { label: "Critical Risk", labelAr: "خطر حرج", color: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: XCircle },
  high:     { label: "High Risk",     labelAr: "خطر عالٍ", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/30", icon: ShieldAlert },
  moderate: { label: "Moderate Risk", labelAr: "خطر متوسط", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30", icon: AlertTriangle },
  low:      { label: "Low Risk",      labelAr: "خطر منخفض", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30", icon: Info },
  none:     { label: "No Risk",       labelAr: "لا خطر", color: "text-success", bg: "bg-success/10 border-success/30", icon: ShieldCheck },
};

const SEVERITY_META: Record<string, { dot: string; label: string; labelAr: string }> = {
  critical: { dot: "bg-destructive", label: "Critical", labelAr: "حرج" },
  high:     { dot: "bg-orange-500",  label: "High",     labelAr: "عالٍ" },
  medium:   { dot: "bg-yellow-500",  label: "Medium",   labelAr: "متوسط" },
  low:      { dot: "bg-blue-500",    label: "Low",      labelAr: "منخفض" },
  info:     { dot: "bg-muted-foreground", label: "Info", labelAr: "معلومة" },
};

export function StructuredReport({ data }: { data: StructuredReportType }) {
  const { language, isRTL } = useLanguage();

  const riskKey = (data.risk_level ?? "none").toLowerCase() as keyof typeof RISK_META;
  const risk = RISK_META[riskKey] ?? RISK_META.none;
  const RiskIcon = risk.icon;

  const copy = language === "ar"
    ? { verdict: "الحكم", summary: "الملخص", findings: "التفاصيل", suggestion: "اقتراح إعادة الهيكلة", noFindings: "لم يُكتشف أي مشكلة محددة." }
    : { verdict: "Verdict", summary: "Summary", findings: "Findings", suggestion: "Refactoring Suggestion", noFindings: "No specific findings detected." };

  return (
    <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
      {/* Risk Badge + Verdict */}
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", risk.bg)}>
        <RiskIcon className={cn("mt-0.5 h-5 w-5 shrink-0", risk.color)} />
        <div className="min-w-0">
          <p className={cn("text-xs font-semibold uppercase tracking-wide", risk.color)}>
            {language === "ar" ? risk.labelAr : risk.label}
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
              {copy.summary}
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
            {copy.findings}
            {data.findings?.length > 0 && (
              <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {data.findings.length}
              </span>
            )}
          </h4>
        </div>
        <div className="divide-y divide-border/40">
          {data.findings?.length > 0 ? data.findings.map((f, i) => {
            const sev = SEVERITY_META[f.severity] ?? SEVERITY_META.info;
            return (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sev.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{f.title}</span>
                    <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-semibold opacity-70" style={{ color: "inherit" }}>
                      {language === "ar" ? sev.labelAr : sev.label}
                    </span>
                  </div>
                  {f.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                  )}
                </div>
              </div>
            );
          }) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">{copy.noFindings}</p>
          )}
        </div>
      </div>

      {/* Refactoring Suggestion */}
      {data.refactoring_suggestion && (
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wrench className="h-4 w-4 text-primary" />
              {copy.suggestion}
            </h4>
          </div>
          <p className="px-5 py-4 text-sm text-muted-foreground leading-relaxed">{data.refactoring_suggestion}</p>
        </div>
      )}
    </div>
  );
}
