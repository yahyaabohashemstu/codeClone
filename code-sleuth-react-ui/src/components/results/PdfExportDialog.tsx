import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BookOpen,
  Code2,
  FileText,
  GitCompare,
  Loader2,
  ListChecks,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/LanguageContext";
import { openPdfReport, DEFAULT_SECTIONS, type PdfSections } from "@/lib/pdfGenerator";
import type { AnalysisResult } from "@/types/api";
import { cn } from "@/lib/utils";

type SectionKey = keyof PdfSections;

interface SectionDef {
  key: SectionKey;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  descKey: string;
  alwaysOn?: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    key: "cover",
    icon: BookOpen,
    labelKey: "results.pdfExport.coverLabel",
    descKey: "results.pdfExport.coverDesc",
    alwaysOn: true,
  },
  {
    key: "executiveSummary",
    icon: BarChart3,
    labelKey: "results.pdfExport.executiveSummaryLabel",
    descKey: "results.pdfExport.executiveSummaryDesc",
  },
  {
    key: "similarityMetrics",
    icon: TrendingUp,
    labelKey: "results.pdfExport.similarityMetricsLabel",
    descKey: "results.pdfExport.similarityMetricsDesc",
  },
  {
    key: "cloneDetection",
    icon: GitCompare,
    labelKey: "results.pdfExport.cloneDetectionLabel",
    descKey: "results.pdfExport.cloneDetectionDesc",
  },
  {
    key: "aiStructuredReport",
    icon: ListChecks,
    labelKey: "results.pdfExport.aiStructuredReportLabel",
    descKey: "results.pdfExport.aiStructuredReportDesc",
  },
  {
    key: "aiAnalysisText",
    icon: FileText,
    labelKey: "results.pdfExport.aiAnalysisTextLabel",
    descKey: "results.pdfExport.aiAnalysisTextDesc",
  },
  {
    key: "codeQuality",
    icon: ShieldAlert,
    labelKey: "results.pdfExport.codeQualityLabel",
    descKey: "results.pdfExport.codeQualityDesc",
  },
  {
    key: "sourceCode",
    icon: Code2,
    labelKey: "results.pdfExport.sourceCodeLabel",
    descKey: "results.pdfExport.sourceCodeDesc",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: AnalysisResult;
}

export function PdfExportDialog({ open, onOpenChange, result }: Props) {
  const { language, isRTL } = useLanguage();
  const { t } = useTranslation("results");

  const [sections, setSections] = useState<PdfSections>({ ...DEFAULT_SECTIONS });
  const [generating, setGenerating] = useState(false);

  const enabledCount = Object.values(sections).filter(Boolean).length;

  const toggleAll = (val: boolean) => {
    setSections(
      Object.fromEntries(
        SECTIONS.map((s) => [s.key, s.alwaysOn ? true : val]),
      ) as unknown as PdfSections,
    );
  };

  const toggle = (key: SectionKey) => {
    const def = SECTIONS.find((s) => s.key === key);
    if (def?.alwaysOn) return;
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = () => {
    setGenerating(true);
    // Small timeout to let the button state render before the synchronous HTML build
    setTimeout(() => {
      try {
        openPdfReport(result, sections, language === "ar" ? "ar" : "en");
      } finally {
        setGenerating(false);
        onOpenChange(false);
      }
    }, 80);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle className="t-h4 flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            {t("results.pdfExport.title")}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {t("results.pdfExport.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* Section picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="t-label flex items-center gap-2.5">
              <span className="h-px w-6 bg-primary" />
              {t("results.pdfExport.sectionTitle")}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {t("results.pdfExport.selectAll")}
              </button>
              <span className="text-muted-foreground">&middot;</span>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-[11px] font-medium text-muted-foreground hover:underline"
              >
                {t("results.pdfExport.deselectAll")}
              </button>
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {SECTIONS.map((def) => {
              const checked = sections[def.key];
              const Icon = def.icon;
              const label = t(def.labelKey);
              const desc = t(def.descKey);
              return (
                <label
                  key={def.key}
                  htmlFor={`sec-${def.key}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors",
                    checked ? "bg-muted" : "hover:bg-muted/60",
                    def.alwaysOn && "cursor-default",
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                    toggle(def.key);
                  }}
                >
                  <Checkbox
                    id={`sec-${def.key}`}
                    checked={checked}
                    disabled={def.alwaysOn}
                    onCheckedChange={() => toggle(def.key)}
                    className="mt-0.5 shrink-0"
                  />
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", checked ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`sec-${def.key}`} className="cursor-pointer text-sm font-medium text-foreground">
                        {label}
                      </Label>
                      {def.alwaysOn && (
                        <span className="badge-info">
                          {t("results.pdfExport.alwaysOn")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Counter + note */}
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span>
              <span className="font-mono font-semibold text-foreground">{enabledCount}</span>{" "}
              {t("results.pdfExport.selected")}
            </span>
            <span className="text-[10px] italic">{t("results.pdfExport.previewNote")}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("results.pdfExport.cancel")}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleGenerate}
            disabled={generating || enabledCount === 0}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {generating ? t("results.pdfExport.generating") : t("results.pdfExport.generate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
