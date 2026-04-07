import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Code2,
  FileText,
  GitCompare,
  Loader2,
  ShieldAlert,
  Sparkles,
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
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/context/LanguageContext";
import { openPdfReport, DEFAULT_SECTIONS, type PdfSections } from "@/lib/pdfGenerator";
import type { AnalysisResult } from "@/types/api";
import { cn } from "@/lib/utils";

type SectionKey = keyof PdfSections;

interface SectionDef {
  key: SectionKey;
  icon: React.ComponentType<{ className?: string }>;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
  alwaysOn?: boolean;
}

const SECTIONS: SectionDef[] = [
  {
    key: "cover",
    icon: BookOpen,
    labelEn: "Cover Page",
    labelAr: "صفحة الغلاف",
    descEn: "Title, date, source labels, combined score gauge",
    descAr: "العنوان، التاريخ، مصادر الشيفرة، مقياس التشابه الكلي",
    alwaysOn: true,
  },
  {
    key: "executiveSummary",
    icon: BarChart3,
    labelEn: "Executive Summary",
    labelAr: "الملخص التنفيذي",
    descEn: "Key KPIs — score, risk level, clone count, language",
    descAr: "المؤشرات الرئيسية — الدرجة، مستوى الخطورة، عدد النسخ",
  },
  {
    key: "similarityMetrics",
    icon: TrendingUp,
    labelEn: "Similarity Metrics",
    labelAr: "مؤشرات التشابه",
    descEn: "All similarity dimensions with visual bar charts",
    descAr: "جميع أبعاد التشابه مع أشرطة بيانية مرئية",
  },
  {
    key: "cloneDetection",
    icon: GitCompare,
    labelEn: "Clone Detection",
    labelAr: "كشف أنواع النسخ",
    descEn: "Full clone-type table with detected/not-detected status",
    descAr: "جدول كامل لأنواع النسخ مع حالة الكشف",
  },
  {
    key: "aiStructuredReport",
    icon: Sparkles,
    labelEn: "AI Structured Report",
    labelAr: "تقرير الذكاء المنظم",
    descEn: "Risk level, verdict, findings, refactoring suggestion",
    descAr: "مستوى الخطورة، الحكم، الاكتشافات، اقتراح إعادة الهيكلة",
  },
  {
    key: "aiAnalysisText",
    icon: FileText,
    labelEn: "AI Analysis Narrative",
    labelAr: "سرد التحليل الذكي",
    descEn: "Full prose AI analysis comparing the two sources",
    descAr: "التحليل النصي الكامل من الذكاء الاصطناعي للمصدرين",
  },
  {
    key: "codeQuality",
    icon: ShieldAlert,
    labelEn: "Code Quality Analysis",
    labelAr: "تحليل جودة الشيفرة",
    descEn: "Linter findings, severity breakdown, quality scores",
    descAr: "ملاحظات أداة الفحص، توزيع الخطورة، نقاط الجودة",
  },
  {
    key: "sourceCode",
    icon: Code2,
    labelEn: "Source Code Listing",
    labelAr: "الشيفرة المصدرية",
    descEn: "Full code for both sources (may add pages)",
    descAr: "الشيفرة الكاملة لكلا المصدرين (قد يضيف صفحات)",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: AnalysisResult;
}

export function PdfExportDialog({ open, onOpenChange, result }: Props) {
  const { language, isRTL } = useLanguage();
  const ar = language === "ar";

  const [sections, setSections] = useState<PdfSections>({ ...DEFAULT_SECTIONS });
  const [generating, setGenerating] = useState(false);

  const copy = {
    title: ar ? "تصدير تقرير PDF" : "Export PDF Report",
    subtitle: ar
      ? "اختر الأقسام التي تريد تضمينها في التقرير المنسّق"
      : "Choose which sections to include in the formatted report",
    selectAll: ar ? "تحديد الكل" : "Select All",
    deselectAll: ar ? "إلغاء الكل" : "Deselect All",
    sectionTitle: ar ? "أقسام التقرير" : "Report Sections",
    previewNote: ar
      ? "سيُفتح التقرير في نافذة جديدة — استخدم Ctrl+P أو زر «حفظ كـ PDF» لتصديره."
      : "The report opens in a new tab — use Ctrl+P or the «Save as PDF» button to export.",
    generate: ar ? "إنشاء التقرير" : "Generate Report",
    generating: ar ? "جاري الإنشاء..." : "Generating...",
    cancel: ar ? "إلغاء" : "Cancel",
    alwaysOn: ar ? "مضمون دائمًا" : "Always included",
    selected: ar ? "قسم محدد" : "sections selected",
  };

  const enabledCount = Object.values(sections).filter(Boolean).length;

  const toggleAll = (val: boolean) => {
    setSections(
      Object.fromEntries(
        SECTIONS.map((s) => [s.key, s.alwaysOn ? true : val]),
      ) as PdfSections,
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
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-sm">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {copy.subtitle}
          </DialogDescription>
        </DialogHeader>

        {/* Section picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{copy.sectionTitle}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {copy.selectAll}
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-[11px] font-medium text-muted-foreground hover:underline"
              >
                {copy.deselectAll}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-2">
            {SECTIONS.map((def, idx) => {
              const checked = sections[def.key];
              const Icon = def.icon;
              const label = ar ? def.labelAr : def.labelEn;
              const desc = ar ? def.descAr : def.descEn;
              return (
                <div key={def.key}>
                  <label
                    htmlFor={`sec-${def.key}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                      checked
                        ? "bg-primary/8 hover:bg-primary/12"
                        : "hover:bg-muted/60",
                      def.alwaysOn && "cursor-default",
                    )}
                    onClick={() => toggle(def.key)}
                  >
                    <Checkbox
                      id={`sec-${def.key}`}
                      checked={checked}
                      disabled={def.alwaysOn}
                      onCheckedChange={() => toggle(def.key)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", checked ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 bg-muted/40 text-muted-foreground")}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`sec-${def.key}`} className="cursor-pointer text-sm font-medium text-foreground">
                          {label}
                        </Label>
                        {def.alwaysOn && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            {copy.alwaysOn}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {desc}
                      </p>
                    </div>
                  </label>
                  {idx < SECTIONS.length - 1 && (
                    <Separator className="mx-3 bg-border/30" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Counter + note */}
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{enabledCount}</span>{" "}
              {copy.selected}
            </span>
            <span className="text-[10px] italic">{copy.previewNote}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {copy.cancel}
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
            {generating ? copy.generating : copy.generate}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
