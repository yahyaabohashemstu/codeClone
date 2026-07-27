import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  Code2,
  Cpu,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Diff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { GroundedThread } from "@/components/results/AnalysisChatPanel";
import { AnalysisReport } from "@/components/results/AnalysisReport";
import { AstGraphPanel } from "@/components/results/AstGraphPanel";
import { DiffViewer } from "@/components/results/DiffViewer";
import { MetricsComparison } from "@/components/results/MetricsComparison";
import { PdfExportDialog } from "@/components/results/PdfExportDialog";
import { SimilarityRadar } from "@/components/results/SimilarityRadar";
import { StructuredReport } from "@/components/results/StructuredReport";
import { FieldSheet, Field, Panel, Figure, Serial, SectionHead, OverprintMeter, PlatePair, RegMark, ScaleRuler, Stamp } from "@/components/dossier/Dossier";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import type { AnalysisResult, CloneItem, SimilarityItem } from "@/types/api";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";
import type { TFunction } from "i18next";

type ResultTab = "overview" | "diff" | "graphs" | "metrics" | "quality" | "report" | "chat";

function getTabs(t: TFunction): Array<{ id: ResultTab; label: string; icon: typeof BarChart3 }> {
  return [
    { id: "overview", label: t("results.tabs.overview"), icon: BarChart3 },
    { id: "diff", label: t("results.tabs.diff"), icon: Diff },
    { id: "graphs", label: t("results.tabs.graphs"), icon: Cpu },
    { id: "metrics", label: t("results.tabs.metrics"), icon: TrendingUp },
    { id: "quality", label: t("results.tabs.quality"), icon: ShieldAlert },
    { id: "report", label: t("results.tabs.report"), icon: FileText },
    { id: "chat", label: t("results.tabs.chat"), icon: MessageSquare },
  ];
}

const similarityNameKeyMap: Record<string, string> = {
  "Text Similarity": "results.similarity.textSimilarity",
  "Token-Based Similarity": "results.similarity.tokenBased",
  "Token Similarity (ordered)": "results.similarity.tokenOrdered",
  "Token Similarity (ordered, excluding comments and whitespace)": "results.similarity.tokenOrderedClean",
  "Token Similarity (unordered, with comments and whitespace)": "results.similarity.tokenUnorderedFull",
  "Token Similarity (unordered, excluding comments and whitespace)": "results.similarity.tokenUnorderedClean",
  "Renamed Clone Similarity": "results.similarity.renamedClone",
  "Graph-Based Similarity": "results.similarity.graphBased",
  "Combined Similarity": "results.similarity.combined",
  "AI Similarity": "results.similarity.aiSimilarity",
};

function translateSimilarityName(name: string, t: TFunction) {
  const key = similarityNameKeyMap[name];
  if (key) {
    return t(key);
  }
  return name;
}

const cloneNameKeyMap: Record<string, string> = {
  "Exact Clone": "results.cloneTypes.exactClone",
  "Near Miss Clone": "results.cloneTypes.nearMissClone",
  "Parameterized Clone": "results.cloneTypes.parameterizedClone",
  "Function Clone": "results.cloneTypes.functionClone",
  "Non-Contiguous Clone": "results.cloneTypes.nonContiguousClone",
  "Structural Clone": "results.cloneTypes.structuralClone",
  "Reordered Clone": "results.cloneTypes.reorderedClone",
  "Function Reordered Clone": "results.cloneTypes.functionReorderedClone",
  "Gapped Clone": "results.cloneTypes.gappedClone",
  "Intertwined Clone": "results.cloneTypes.intertwinedClone",
  "Semantic Clone": "results.cloneTypes.semanticClone",
};

function translateCloneName(name: string, t: TFunction) {
  const key = cloneNameKeyMap[name];
  if (key) {
    return t(key);
  }
  return name;
}

const cloneMetaKeyMap: Record<string, string> = {
  "Exact Clone": "exactClone",
  "Near Miss Clone": "nearMissClone",
  "Parameterized Clone": "parameterizedClone",
  "Function Clone": "functionClone",
  "Non-Contiguous Clone": "nonContiguousClone",
  "Structural Clone": "structuralClone",
  "Reordered Clone": "reorderedClone",
  "Function Reordered Clone": "functionReorderedClone",
  "Gapped Clone": "gappedClone",
  "Intertwined Clone": "intertwinedClone",
  "Semantic Clone": "semanticClone",
};

type CloneMeta = {
  summary: string;
  detectedMeaning: string;
  absentMeaning: string;
  family: string;
  whyItMatters: string;
};

function getCloneTypeMeta(name: string, t: TFunction): CloneMeta {
  const metaKey = cloneMetaKeyMap[name] ?? "fallback";
  return {
    summary: t(`results.cloneMeta.${metaKey}.summary`),
    detectedMeaning: t(`results.cloneMeta.${metaKey}.detectedMeaning`),
    absentMeaning: t(`results.cloneMeta.${metaKey}.absentMeaning`),
    family: t(`results.cloneMeta.${metaKey}.family`),
    whyItMatters: t(`results.cloneMeta.${metaKey}.whyItMatters`),
  };
}

function getCombinedScore(result: AnalysisResult) {
  const combined = result.similarity_items.find((item) => item.name === "Combined Similarity");
  return combined ? combined.value : 0;
}

function getScoreTone(score: number, t: TFunction) {
  if (score >= 80) return { color: "text-destructive", label: t("results.similarity.high"), badge: "badge-error" };
  if (score >= 50) return { color: "text-warning", label: t("results.similarity.moderate"), badge: "badge-warning" };
  return { color: "text-success", label: t("results.similarity.low"), badge: "badge-success" };
}

function formatSimilarityValue(item: SimilarityItem) {
  return `${item.value.toFixed(2)}%`;
}

// The deterministic (non-AI) signals. When these corroborate the verdict we can
// call it high-confidence; when the score rests mainly on the AI/semantic signal
// the engine itself treats it as advisory (Type-4 / cross-language), and so do we.
const DETERMINISTIC_SIGNAL_NAMES = [
  "Text Similarity",
  "Token-Based Similarity",
  "Renamed Clone Similarity",
  "Graph-Based Similarity",
];

function findSignalValue(result: AnalysisResult, name: string): number | null {
  const item = result.similarity_items.find((entry) => entry.name === name);
  return item && Number.isFinite(item.value) ? item.value : null;
}

type ConfidenceLevel = "high" | "moderate" | "advisory";

function getVerdictConfidence(result: AnalysisResult): {
  level: ConfidenceLevel;
  advisory: boolean;
  corroborating: number;
  deterministicTotal: number;
} {
  const deterministic = DETERMINISTIC_SIGNAL_NAMES
    .map((name) => findSignalValue(result, name))
    .filter((value): value is number => typeof value === "number");
  const deterministicMax = deterministic.length ? Math.max(...deterministic) : 0;
  const corroborating = deterministic.filter((value) => value >= 50).length;
  const exactDetected = result.clone_items.some((clone) => clone.name === "Exact Clone" && clone.detected);

  let level: ConfidenceLevel;
  if (exactDetected || deterministicMax >= 70) {
    level = "high";
  } else if (deterministicMax >= 50) {
    level = "moderate";
  } else {
    level = "advisory";
  }

  return { level, advisory: level === "advisory", corroborating, deterministicTotal: deterministic.length };
}

function getScoreBand(score: number): "high" | "moderate" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "moderate";
  return "low";
}

// Deep-link each driver chip to the tab that best explains it.
function signalToTab(name: string): ResultTab {
  if (name.includes("Graph")) return "graphs";
  if (name.includes("AI")) return "report";
  return "diff";
}

const TAB_IDS: ResultTab[] = ["overview", "diff", "graphs", "metrics", "quality", "report", "chat"];


function exportAsJson(result: AnalysisResult) {
  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.json`, JSON.stringify(result, null, 2), "application/json");
}

function exportAsText(result: AnalysisResult, t: TFunction) {
  const lines = [
    `${t("results.analysisId")}: ${result.saved_analysis_id ?? t("results.current")}`,
    `${t("results.language")}: ${result.language}`,
    `${t("results.sourceA")}: ${result.source_labels.code1}`,
    `${t("results.sourceB")}: ${result.source_labels.code2}`,
    "",
    `${t("results.similarityMetrics")}:`,
    ...result.similarity_items.map((item) => `- ${translateSimilarityName(item.name, t)}: ${formatSimilarityValue(item)}`),
    "",
    `${t("results.cloneDetection")}:`,
    ...result.clone_items.map((item) => `- ${translateCloneName(item.name, t)}: ${item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}`),
    "",
    `${t("results.interCodeAnalysis")}:`,
    result.analysis_text,
  ];

  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.txt`, lines.join("\n"));
}


function SimilarityBars({ items }: { items: SimilarityItem[] }) {
  const { t } = useTranslation("results");
  const strongest = items.reduce<SimilarityItem | null>(
    (max, item) => (max === null || item.value > max.value ? item : max),
    null,
  );

  return (
    <Figure n={1} label={t("results.similarity.title")}>
      {/* Mono reading — signal count and the peak measurement */}
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
        <span className="tabular-nums text-foreground">{items.length}</span> ·{" "}
        {strongest ? (
          <>
            {translateSimilarityName(strongest.name, t)}{" "}
            <span className="tabular-nums text-foreground">{Math.round(strongest.value)}%</span>
          </>
        ) : (
          "—"
        )}
      </p>
      <div className="divide-y divide-border">
        {items.map((item) => {
          const barTone = item.value >= 80 ? "bg-destructive" : item.value >= 50 ? "bg-warning" : "bg-success";
          return (
            <div key={item.name} className="flex items-center gap-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{translateSimilarityName(item.name, t)}</span>
              {/* Density track with the calibrated 50/80 threshold ticks drawn on */}
              <div className="metric-bar-track relative hidden w-28 shrink-0 sm:block lg:w-48">
                <div className={cn("h-full transition-all duration-700", barTone)} style={{ width: `${item.value}%` }} />
                <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/30" style={{ insetInlineStart: "50%" }} />
                <span aria-hidden className="absolute inset-y-0 w-px bg-foreground/30" style={{ insetInlineStart: "80%" }} />
              </div>
              <span className="w-16 shrink-0 text-end font-display text-sm font-bold tabular-nums text-foreground" style={{ fontStretch: "108%" }}>
                {formatSimilarityValue(item)}
              </span>
            </div>
          );
        })}
      </div>
    </Figure>
  );
}

const clonePriority: Record<string, number> = {
  "Exact Clone": 100,
  "Semantic Clone": 95,
  "Structural Clone": 90,
  "Near Miss Clone": 85,
  "Parameterized Clone": 80,
  "Function Clone": 75,
  "Non-Contiguous Clone": 70,
  "Reordered Clone": 65,
  "Function Reordered Clone": 60,
  "Gapped Clone": 55,
  "Intertwined Clone": 50,
};

function summarizeCloneProfile(items: CloneItem[], t: TFunction) {
  const detectedCount = items.filter((item) => item.detected).length;
  const exactDetected = items.some((item) => item.name === "Exact Clone" && item.detected);
  const semanticDetected = items.some((item) => item.name === "Semantic Clone" && item.detected);

  if (detectedCount === 0) {
    return t("results.cloneProfile.summaryNone");
  }

  if (exactDetected) {
    return t("results.cloneProfile.summaryExact");
  }

  if (semanticDetected && detectedCount >= 4) {
    return t("results.cloneProfile.summarySemanticMulti");
  }

  if (detectedCount >= 4) {
    return t("results.cloneProfile.summaryMulti");
  }

  return t("results.cloneProfile.summarySmall");
}

function getCloneProfileLabel(items: CloneItem[], t: TFunction) {
  const detectedCount = items.filter((item) => item.detected).length;

  if (detectedCount === 0) return t("results.cloneProfile.noActive");
  if (items.some((item) => item.name === "Exact Clone" && item.detected)) return t("results.cloneProfile.directDuplication");
  if (items.some((item) => item.name === "Semantic Clone" && item.detected)) return t("results.cloneProfile.transformedEquivalent");
  if (detectedCount >= 4) return t("results.cloneProfile.multiPattern");
  return t("results.cloneProfile.selectiveReuse");
}

function getCloneFocus(items: CloneItem[], t: TFunction) {
  const detectedItems = items
    .filter((item) => item.detected)
    .sort((left, right) => (clonePriority[right.name] ?? 0) - (clonePriority[left.name] ?? 0));

  if (!detectedItems.length) {
    return t("results.cloneProfile.noFamiliesActivated");
  }

  return detectedItems.slice(0, 3).map((item) => translateCloneName(item.name, t)).join(" \u2022 ");
}

function CloneDetection({ items }: { items: CloneItem[] }) {
  const { t } = useTranslation("results");
  const detectedItems = items.filter((item) => item.detected);
  const detectedCount = detectedItems.length;
  const undetectedCount = items.length - detectedCount;
  const coverage = items.length ? Math.round((detectedCount / items.length) * 100) : 0;
  const sortedItems = [...items].sort((left, right) => {
    const detectedDelta = Number(right.detected) - Number(left.detected);
    if (detectedDelta !== 0) return detectedDelta;
    return (clonePriority[right.name] ?? 0) - (clonePriority[left.name] ?? 0);
  });

  return (
    <Panel
      label={t("results.cloneTypes.cloneTypeDetection")}
      actions={
        <>
          <span className={detectedCount > 0 ? "badge-warning" : "badge-success"}>
            {detectedCount} {t("results.cloneTypes.detectedCount")}
          </span>
          <span className="badge-info">{undetectedCount} {t("results.cloneTypes.notDetectedCount")}</span>
        </>
      }
      bodyClassName="p-0"
    >
      <p className="border-b border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        {summarizeCloneProfile(items, t)}
      </p>

      {/* Case attributes — margin-label fields */}
      <div className="border-b border-border px-5 sm:px-6">
        <Field label={t("results.cloneTypes.cloneProfile")}>
          <p className="text-sm font-semibold text-foreground">{getCloneProfileLabel(items, t)}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.dominantInterpretation")}
          </p>
        </Field>
        <Field label={t("results.cloneTypes.detectionCoverage")}>
          <div className="flex items-center gap-3">
            <div className="metric-bar-track w-40 max-w-full shrink-0">
              <div
                className={cn("h-full rounded-full", detectedCount > 0 ? "bg-warning" : "bg-success")}
                style={{ width: `${coverage}%` }}
              />
            </div>
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">{coverage}%</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.cloneFamiliesActivated", { detected: detectedCount, total: items.length })}
          </p>
        </Field>
        <Field label={t("results.cloneTypes.strongestSignals")}>
          <p className="text-sm font-medium text-foreground">{getCloneFocus(items, t)}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.meaningfulCategoriesSurfaced")}
          </p>
        </Field>
      </div>

      {/* The clone matrix — one ruled ledger with mono serials and status, not a card grid */}
      <div className="divide-y divide-border">
        {sortedItems.map((item, index) => {
          const meta = getCloneTypeMeta(item.name, t);

          return (
            <div
              key={item.name}
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 sm:px-6"
            >
              <Serial tone={item.detected ? "primary" : "muted"}>{String(index + 1).padStart(2, "0")}</Serial>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    {translateCloneName(item.name, t)}
                  </h4>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {meta.family}
                  </span>
                  <span
                    className={cn(
                      "ms-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]",
                      item.detected ? "bg-warning/20 text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.detected ? <AlertTriangle className="h-3 w-3 text-warning" /> : <CheckCircle2 className="h-3 w-3 text-success" />}
                    {item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.summary}</p>

                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {item.detected ? t("results.cloneTypes.interpretation") : t("results.cloneTypes.reading")}
                  </span>{" "}
                  {item.detected ? meta.detectedMeaning : meta.absentMeaning}
                </p>

                <p className="mt-2 border-s-2 border-border ps-3 text-[11px] leading-relaxed text-muted-foreground/85">
                  <span className="font-semibold text-foreground/90">{t("results.cloneTypes.whyItMatters")}:</span>{" "}
                  {meta.whyItMatters}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CodeComparisonPanel({
  result,
  description,
}: {
  result: AnalysisResult;
  description?: string;
}) {
  const { t } = useTranslation("results");
  const resolvedDescription = description || t("results.defaultComparisonDescription");
  const exhibits = [
    { serial: "A", tone: "plate-a", title: result.source_labels.code1, code: result.code1 },
    { serial: "B", tone: "plate-b", title: result.source_labels.code2, code: result.code2 },
  ] as const;

  return (
    <div className="space-y-4 p-5">
      <p className="text-xs leading-relaxed text-muted-foreground">{resolvedDescription}</p>

      {/* The two plates — ruled headers with plate identities, code kept LTR */}
      <div className="grid gap-5 xl:grid-cols-2">
        {exhibits.map((source) => (
          <section key={source.serial} className="overflow-hidden border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <Serial tone={source.tone}>{source.serial}</Serial>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{source.title}</span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums text-muted-foreground/60">
                {source.code ? source.code.split("\n").length : 0} LN
              </span>
            </div>
            <pre className="code-surface m-4 max-h-[680px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed scrollbar-thin" dir="ltr">
              <code>{source.code}</code>
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}

function formatQualityAnalysis(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value.trim() ? value : fallback;
  }

  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return `Unable to generate quality report: ${(value as { error: string }).error}`;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

type QualitySeverity = "critical" | "warning" | "style" | "info";

type QualityIssue = {
  rawType: string;
  severity: QualitySeverity;
  symbol: string | null;
  message: string;
  line: number | null;
  column: number | null;
};

type QualityReport = {
  text: string;
  issues: QualityIssue[];
  score: number | null;
  ratingLine: string | null;
  generalNotes: string[];
  counts: Record<QualitySeverity, number>;
  dominantSymbols: string[];
  statusTone: "excellent" | "healthy" | "watch" | "critical" | "neutral";
  headline: string;
  summary: string;
};

const qualitySeverityMeta: Record<
  QualitySeverity,
  {
    label: string;
    icon: typeof AlertTriangle;
    badgeClass: string;
    iconClass: string;
    cardClass: string;
  }
> = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    badgeClass: "badge-error",
    iconClass: "border-destructive/30 bg-destructive/10 text-destructive",
    cardClass: "border-destructive/18 bg-destructive/[0.04]",
  },
  warning: {
    label: "Warning",
    icon: ShieldAlert,
    badgeClass: "badge-warning",
    iconClass: "border-warning/30 bg-warning/10 text-warning",
    cardClass: "border-warning/18 bg-warning/[0.04]",
  },
  style: {
    label: "Style",
    icon: FileText,
    badgeClass: "badge-info",
    iconClass: "border-primary/25 bg-primary/10 text-primary",
    cardClass: "border-primary/16 bg-primary/[0.04]",
  },
  info: {
    label: "Info",
    icon: TrendingUp,
    badgeClass: "badge-info",
    iconClass: "border-accent/25 bg-accent/10 text-accent",
    cardClass: "border-accent/16 bg-accent/[0.04]",
  },
};

// Amber/red/ink tint for the small severity glyph on a finding row. Colour lives
// on the icon (allowed) — never on the paper text, which stays ink.
const severityIconClass: Record<QualitySeverity, string> = {
  critical: "text-destructive",
  warning: "text-warning",
  style: "text-primary",
  info: "text-muted-foreground",
};

// A ruled ledger row: mono label + optional note in the main column, a bold ink
// (or tone-coloured) figure in the value column. Replaces the stat-card grids.
function QualityLedgerRow({
  label,
  value,
  note,
  valueClass,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-3">
      <div className="min-w-0">
        <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
        {note != null && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/80">{note}</p>}
      </div>
      <dd className={cn("shrink-0 text-end font-mono text-lg font-bold tabular-nums text-foreground", valueClass)}>
        {value}
      </dd>
    </div>
  );
}

function getQualitySeverity(rawType: string): QualitySeverity {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "fatal" || normalized === "error") {
    return "critical";
  }
  if (normalized === "warning" || normalized === "refactor") {
    return "warning";
  }
  if (normalized === "convention") {
    return "style";
  }
  return "info";
}

function buildQualityHeadline(statusTone: QualityReport["statusTone"], totalFindings: number, sourceName: string, t: TFunction) {
  if (totalFindings === 0) {
    if (statusTone === "healthy" || statusTone === "excellent") {
      return t("results.quality.buildHeadline.cleanExcellent", { source: sourceName });
    }
    return t("results.quality.buildHeadline.cleanNeutral", { source: sourceName });
  }

  if (statusTone === "critical") {
    return t("results.quality.buildHeadline.critical", { source: sourceName });
  }
  if (statusTone === "watch") {
    return t("results.quality.buildHeadline.watch", { source: sourceName });
  }
  if (statusTone === "excellent") {
    return t("results.quality.buildHeadline.excellent", { source: sourceName });
  }
  return t("results.quality.buildHeadline.default", { source: sourceName });
}

function parseQualityReport(rawValue: unknown, sourceName: string, fallback: string, t: TFunction): QualityReport {
  const text = formatQualityAnalysis(rawValue, fallback);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts: Record<QualitySeverity, number> = {
    critical: 0,
    warning: 0,
    style: 0,
    info: 0,
  };
  const issues: QualityIssue[] = [];
  const generalNotes: string[] = [];
  let score: number | null = null;
  let ratingLine: string | null = null;

  for (const line of lines) {
    const scoreMatch = line.match(/Your code has been rated at\s+(-?\d+(?:\.\d+)?)\/10/i);
    if (scoreMatch) {
      score = Number.parseFloat(scoreMatch[1]);
      ratingLine = line;
      continue;
    }

    const issueMatch = line.match(/^([A-Za-z]+)\s+\[([^\]]+)\]:\s+(.*?)(?:\s+\(Line\s+(\d+)(?:,\s+Column\s+(\d+))?\))?$/);
    if (issueMatch) {
      const [, rawType, symbol, message, lineNumber, columnNumber] = issueMatch;
      const severity = getQualitySeverity(rawType);
      counts[severity] += 1;
      issues.push({
        rawType,
        severity,
        symbol: symbol || null,
        message,
        line: lineNumber ? Number.parseInt(lineNumber, 10) : null,
        column: columnNumber ? Number.parseInt(columnNumber, 10) : null,
      });
      continue;
    }

    generalNotes.push(line);
  }

  const totalFindings = issues.length;
  const dominantSymbols = Array.from(
    issues.reduce((map, issue) => {
      if (!issue.symbol) return map;
      map.set(issue.symbol, (map.get(issue.symbol) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([symbol]) => symbol);

  let statusTone: QualityReport["statusTone"] = "neutral";
  if (score !== null) {
    if (score >= 8.5) statusTone = "excellent";
    else if (score >= 7) statusTone = "healthy";
    else if (score >= 5) statusTone = "watch";
    else statusTone = "critical";
  } else if (counts.critical > 0) {
    statusTone = "critical";
  } else if (counts.warning > 0) {
    statusTone = "watch";
  } else if (totalFindings === 0 && generalNotes.length === 0) {
    statusTone = "healthy";
  } else if (totalFindings > 0) {
    statusTone = "healthy";
  }

  const summary =
    totalFindings > 0
      ? t("results.quality.findingsSummary", {
          critical: counts.critical,
          warning: counts.warning,
          style: counts.style,
          info: counts.info,
        })
      : generalNotes[0] || t("results.quality.noStructuredReported");

  return {
    text,
    issues,
    score,
    ratingLine,
    generalNotes,
    counts,
    dominantSymbols,
    statusTone,
    headline: buildQualityHeadline(statusTone, totalFindings, sourceName, t),
    summary,
  };
}

function getQualityToneMeta(statusTone: QualityReport["statusTone"], t: TFunction) {
  if (statusTone === "excellent") {
    return {
      badgeClass: "badge-success",
      containerClass: "border-success/20 bg-success/[0.04]",
      scoreClass: "text-success",
      label: t("results.quality.statusTone.excellent"),
      icon: ShieldCheck,
    };
  }
  if (statusTone === "healthy") {
    return {
      badgeClass: "badge-success",
      containerClass: "border-success/14 bg-success/[0.03]",
      scoreClass: "text-success",
      label: t("results.quality.statusTone.healthy"),
      icon: CheckCircle2,
    };
  }
  if (statusTone === "watch") {
    return {
      badgeClass: "badge-warning",
      containerClass: "border-warning/18 bg-warning/[0.04]",
      scoreClass: "text-warning",
      label: t("results.quality.statusTone.needsReview"),
      icon: ShieldAlert,
    };
  }
  if (statusTone === "critical") {
    return {
      badgeClass: "badge-error",
      containerClass: "border-destructive/18 bg-destructive/[0.04]",
      scoreClass: "text-destructive",
      label: t("results.quality.statusTone.highRisk"),
      icon: AlertTriangle,
    };
  }
  return {
    badgeClass: "badge-info",
    containerClass: "border-border/60 bg-card",
    scoreClass: "text-foreground",
    label: t("results.quality.statusTone.diagnosticView"),
    icon: FileText,
  };
}

function QualitySourceCard({
  title,
  accentClass,
  report,
}: {
  title: string;
  accentClass: string;
  report: QualityReport;
}) {
  const { t } = useTranslation("results");
  const totalFindings = report.issues.length;
  const toneMeta = getQualityToneMeta(report.statusTone, t);
  const ToneIcon = toneMeta.icon;
  const topIssues = report.issues.slice(0, 8);
  const severityLabels: Record<QualitySeverity, string> = {
    critical: t("results.quality.severityLabels.critical"),
    warning: t("results.quality.severityLabels.warning"),
    style: t("results.quality.severityLabels.style"),
    info: t("results.quality.severityLabels.info"),
  };

  return (
    <Panel
      bodyClassName="p-0"
      label={
        <span className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5", accentClass)} />
          {title}
        </span>
      }
      actions={<span className={toneMeta.badgeClass}>{toneMeta.label}</span>}
    >
      {/* Verdict readout + the score as the exhibit figure */}
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{report.headline}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1 sm:text-end">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
            <ToneIcon className={cn("h-3.5 w-3.5", toneMeta.scoreClass)} />
            {t("results.quality.qualityScore")}
          </span>
          <span className="font-mono text-4xl font-bold leading-none tabular-nums text-foreground">
            {report.score !== null ? report.score.toFixed(1) : "\u2014"}
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {report.ratingLine
              ? t("results.quality.derivedFromPylint")
              : t("results.quality.basedOnTextual")}
          </p>
        </div>
      </div>

      {/* Severity ledger \u2014 ruled mono rows instead of a stat-card grid */}
      <dl className="divide-y divide-border border-b border-border px-5">
        <QualityLedgerRow
          label={t("results.quality.findings")}
          note={t("results.quality.findingsDesc")}
          value={totalFindings}
        />
        <QualityLedgerRow
          label={t("results.quality.critical")}
          note={t("results.quality.criticalDesc")}
          value={report.counts.critical}
          valueClass={report.counts.critical > 0 ? "text-destructive" : undefined}
        />
        <QualityLedgerRow
          label={t("results.quality.warnings")}
          note={t("results.quality.warningsDesc")}
          value={report.counts.warning + report.counts.style}
        />
        <QualityLedgerRow
          label={t("results.quality.dominantSignals")}
          note={t("results.quality.dominantSignalsDesc")}
          value={
            <span className="text-sm font-semibold text-foreground">
              {report.dominantSymbols.length
                ? report.dominantSymbols.join(" \u2022 ")
                : t("results.quality.noRepeatedRule")}
            </span>
          }
        />
      </dl>

      <div className="px-5 py-5">
        {topIssues.length > 0 ? (
          <>
            <SectionHead
              marker="§"
              title={t("results.quality.priorityFindings")}
              aside={<span className="tabular-nums">{`${topIssues.length}/${totalFindings}`}</span>}
              className="mb-4"
            />
            <ol className="divide-y divide-border">
              {topIssues.map((issue, index) => {
                const meta = qualitySeverityMeta[issue.severity];
                const IssueIcon = meta.icon;
                return (
                  <li
                    key={`${issue.symbol ?? issue.message}-${index}`}
                    className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4 first:pt-0"
                  >
                    <Serial tone={issue.severity === "critical" ? "primary" : "muted"}>
                      {String(index + 1).padStart(2, "0")}
                    </Serial>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <IssueIcon className={cn("h-3.5 w-3.5", severityIconClass[issue.severity])} />
                        <span className={meta.badgeClass}>{severityLabels[issue.severity]}</span>
                        {issue.symbol && <span className="badge-info">{issue.symbol}</span>}
                        {(issue.line !== null || issue.column !== null) && (
                          <span className="rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {issue.line !== null ? t("results.quality.line", { line: issue.line }) : t("results.quality.lineEmpty")}
                            {issue.column !== null ? t("results.quality.column", { column: issue.column }) : ""}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">{issue.message}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                        {t("results.quality.reportedByLinter")}{" "}
                        <span className="font-semibold text-foreground/85">{issue.rawType}</span>.
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className="border-s-2 border-success ps-4">
            <p className="text-sm font-semibold text-foreground">{t("results.quality.noStructuredFindings")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {report.generalNotes[0] || t("results.quality.noStructuredFindingsDesc")}
            </p>
          </div>
        )}

        {(report.generalNotes.length > 0 || report.text) && (
          <details className="mt-4 overflow-hidden rounded-sm border border-border bg-background">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
              {t("results.quality.rawDiagnosticReport")}
            </summary>
            <div className="border-t border-border px-4 py-4">
              {report.generalNotes.length > 0 && (
                <div className="mb-3 space-y-2">
                  {report.generalNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="rounded-sm border border-border bg-muted/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {note}
                    </div>
                  ))}
                </div>
              )}
              <pre className="code-surface max-h-[320px] overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed scrollbar-thin">
                {report.text}
              </pre>
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

function QualityPanel({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation("results");
  const sourceReports = [
    {
      id: "A",
      title: t("results.quality.sourceAReview"),
      accentClass: "bg-plate-a text-plate-a-deep",
      report: parseQualityReport(
        result.code_smell.code1_analysis,
        t("results.sourceA"),
        t("results.quality.sourceAFallback"),
        t,
      ),
    },
    {
      id: "B",
      title: t("results.quality.sourceBReview"),
      accentClass: "bg-plate-b text-plate-b-deep",
      report: parseQualityReport(
        result.code_smell.code2_analysis,
        t("results.sourceB"),
        t("results.quality.sourceBFallback"),
        t,
      ),
    },
  ] as const;

  const totalFindings = sourceReports.reduce((sum, source) => sum + source.report.issues.length, 0);
  const averageScore =
    sourceReports.every((source) => source.report.score !== null)
      ? sourceReports.reduce((sum, source) => sum + (source.report.score ?? 0), 0) / sourceReports.length
      : null;
  const healthierSource = [...sourceReports].sort((left, right) => {
    const leftScore = left.report.score ?? -1;
    const rightScore = right.report.score ?? -1;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.report.issues.length - right.report.issues.length;
  })[0];

  return (
    <div className="space-y-10">
      {/* Intelligence brief \u2014 a ruled \u00a7-section, not a tinted card; the three
          aggregates read as a mono spec ledger. */}
      <Panel
        bare
        marker="§"
        label={t("results.quality.intelligence")}
        actions={
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("results.quality.linterDriven")}
          </span>
        }
      >
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("results.quality.description")}
        </p>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          <QualityLedgerRow
            label={t("results.quality.totalFindings")}
            note={t("results.quality.totalFindingsDesc")}
            value={totalFindings}
          />
          <QualityLedgerRow
            label={t("results.quality.averageScore")}
            note={t("results.quality.averageScoreDesc")}
            value={averageScore !== null ? averageScore.toFixed(1) : "\u2014"}
            valueClass={
              averageScore !== null && averageScore >= 7
                ? "text-success"
                : averageScore !== null && averageScore < 5
                  ? "text-destructive"
                  : undefined
            }
          />
          <QualityLedgerRow
            label={t("results.quality.healthierSource")}
            note={
              healthierSource.report.score !== null
                ? t("results.quality.healthierScoreDesc", { score: healthierSource.report.score.toFixed(1) })
                : t("results.quality.healthierIssueDesc")
            }
            value={<span className="text-sm font-semibold text-foreground">{healthierSource.title}</span>}
          />
        </dl>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        {sourceReports.map((source) => (
          <QualitySourceCard
            key={source.id}
            title={source.title}
            accentClass={source.accentClass}
            report={source.report}
          />
        ))}
      </div>
    </div>
  );
}

function PanelErrorFallback() {
  const { t } = useTranslation("results");
  return (
    <div className="card-premium p-8 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">{t("results.panelError")}</p>
    </div>
  );
}

const Results = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentResult, loadCurrent, loadById, rerunById, clearCurrentResult } = useAnalysis();
  const { localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("results");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const tabs = useMemo(() => getTabs(t), [t]);

  const requestedId = searchParams.get("analysisId");

  // The active tab lives in the URL (?tab=…) so a refresh, a shared link, or a
  // re-run all preserve the reviewer's place instead of snapping back to Overview.
  const tabParam = searchParams.get("tab");
  const activeTab: ResultTab = TAB_IDS.includes((tabParam ?? "") as ResultTab)
    ? (tabParam as ResultTab)
    : "overview";
  const setActiveTab = (id: ResultTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      setError("");
      setIsLoading(true);
      try {
        if (requestedId) {
          const numericId = Number(requestedId);
          if (Number.isNaN(numericId) || numericId <= 0) {
            throw new Error(t("results.invalidId"));
          }

          if (currentResult?.saved_analysis_id !== numericId) {
            await loadById(numericId);
          }
          return;
        }

        if (!currentResult) {
          const loaded = await loadCurrent();
          if (!loaded && isMounted) {
            setError(t("results.noSavedOrActive"));
          }
        }
      } catch (loadError) {
        if (isMounted) {
          clearCurrentResult();
          setError(loadError instanceof Error ? localizeRuntimeMessage(loadError.message) : t("results.unableToLoad"));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [requestedId, currentResult, loadById, loadCurrent, clearCurrentResult, t, localizeRuntimeMessage]);

  const requestedAnalysisId = requestedId ? Number(requestedId) : null;
  const result = requestedId
    ? Number.isFinite(requestedAnalysisId) && currentResult?.saved_analysis_id === requestedAnalysisId
      ? currentResult
      : null
    : currentResult;
  const overallScore = result ? getCombinedScore(result) : 0;
  const scoreTone = getScoreTone(overallScore, t);
  // Whole-number score — the sub-percent precision the engine reports is not
  // meaningful confidence, and "87%" is more honest to a reviewer than "87.3%".
  const overallScoreLabel = String(Math.round(overallScore));

  const handleRerun = async () => {
    if (!result?.saved_analysis_id) {
      navigate("/analysis");
      return;
    }

    setIsLoading(true);
    try {
      await rerunById(result.saved_analysis_id);
      setActiveTab("overview");
    } catch (rerunError) {
      setError(rerunError instanceof Error ? localizeRuntimeMessage(rerunError.message) : t("results.unableToRerun"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          {t("results.loading")}
        </div>
      </div>
    );
  }

  if (!result) {
    const noSavedOrActive = t("results.noSavedOrActive");
    const emptyStateTitle = error && !error.startsWith(noSavedOrActive) ? t("results.unableToLoadTitle") : t("results.emptyTitle");
    const emptyStateDescription = error || t("results.emptyDescription");

    return (
      <div
        className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-10 text-center"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <h2 className="t-h3">{emptyStateTitle}</h2>
        <p className="mx-auto mt-3 max-w-md t-body">{emptyStateDescription}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild className="h-10 gap-2">
            <Link to="/analysis">{t("results.startAnalysis")}</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link to="/history">{t("results.openHistory")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Score ring colors
  const scoreRingColor =
    overallScore >= 80
      ? "hsl(var(--destructive))"
      : overallScore >= 50
        ? "hsl(var(--warning))"
        : "hsl(var(--success))";

  const band = getScoreBand(overallScore);
  const confidence = getVerdictConfidence(result);
  const confidenceLabel = t(`results.confidence.${confidence.level}`);
  // The verdict → evidence chain: which signals actually drove the combined score.
  const drivers = [...result.similarity_items]
    .filter((item) => item.name !== "Combined Similarity")
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);

  return (
    <div className="space-y-5 animate-fade-in" ref={resultRef}>
      {error && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "hsl(var(--destructive) / 0.25)",
            background: "hsl(var(--destructive) / 0.06)",
            color: "hsl(var(--destructive))",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      {/* THE PROOF BLOCK — one instrument band: readout ▸ pair & reading ▸ disposition,
          closed by the graded scale the verdict is read against. */}
      <section className="border border-border bg-card">
        {/* Case slug along the sheet edge */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2">
          <span className="press-slug flex items-center gap-2 text-foreground">
            <RegMark className="h-3 w-3 text-primary" />
            {t("results.title")}
            {result.saved_analysis_id ? <span className="text-muted-foreground">· #{result.saved_analysis_id}</span> : null}
          </span>
          <span className="press-slug">{getProgrammingLanguageLabel(result.language)}</span>
        </div>

        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)_auto]">
          {/* 1 · Registration readout */}
          <div
            className="border-b border-border p-5 lg:border-b-0 lg:border-e"
            role="img"
            aria-label={t("results.ring.aria", { score: overallScoreLabel, band: scoreTone.label })}
          >
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-display text-[3.4rem] font-extrabold leading-none tabular-nums"
                style={{ fontStretch: "120%", color: scoreRingColor }}
              >
                {overallScoreLabel}
              </span>
              <span className="font-display text-xl font-bold text-muted-foreground">%</span>
            </div>
            <span className="press-slug mt-1 block">{t("results.percentSimilar")}</span>
            <OverprintMeter value={overallScore} className="mt-4" />
            <div className="press-slug mt-2 flex items-center justify-between text-[9px]">
              <span className="text-plate-a-deep">A</span>
              <span aria-hidden>⊕</span>
              <span className="text-plate-b-deep">B</span>
            </div>
          </div>

          {/* 2 · The pair under comparison + the reading */}
          <div className="min-w-0 border-b border-border p-5 lg:border-b-0 lg:border-e">
            <PlatePair mono a={result.source_labels.code1} b={result.source_labels.code2} />
            <p className="mt-3.5 max-w-[62ch] text-sm leading-relaxed text-foreground">
              {t(`results.verdictMeaning.${band}`)}
              {confidence.advisory ? ` ${t("results.verdictMeaning.advisoryNote")}` : ""}
            </p>
            <p
              className="press-slug mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 normal-case tracking-normal"
              title={t("results.confidence.tooltip", {
                corroborating: confidence.corroborating,
                total: confidence.deterministicTotal,
              })}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {confidenceLabel}
              {confidence.advisory && (
                <span className="bg-warning/20 px-1.5 py-0.5 uppercase tracking-[0.1em] text-foreground">
                  {t("results.confidence.advisoryTag")}
                </span>
              )}
            </p>
          </div>

          {/* 3 · Disposition — the stamp and the case actions */}
          <div className="flex flex-row items-center gap-4 p-5 lg:flex-col lg:items-end lg:justify-between">
            <Stamp band={band === "high" ? "flag" : band === "moderate" ? "review" : "pass"}>
              {scoreTone.label}
            </Stamp>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" className="h-9 gap-2" onClick={() => setPdfOpen(true)}>
                <Download className="h-4 w-4" />
                {t("results.export.pdf")}
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setActiveTab("chat")}>
                <MessageSquare className="h-4 w-4" />
                {t("results.askAnalyst", { defaultValue: "Ask analyst" })}
              </Button>
            </div>
          </div>
        </div>

        {/* The graded scale — the needle sits where this pair printed */}
        <div className="border-t border-border px-5 pb-2 pt-4" role="group" aria-label={t("results.legend.aria")}>
          <ScaleRuler
            value={overallScore}
            label={t("results.ring.aria", { score: overallScoreLabel, band: scoreTone.label })}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-1.5">
            <span className="press-slug text-[9px]">
              {t("results.legend.low")} &lt; 50 · {t("results.legend.moderate")} 50–79 · {t("results.legend.high")} ≥ 80
            </span>
            <span className="press-slug text-[9px]">{t("results.legend.gateNote")}</span>
          </div>
        </div>

        {/* Utility edge — case handling */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <Link to="/analysis">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {t("buttons.backToAnalysis", { defaultValue: "Back" })}
            </Button>
          </Link>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled
            style={{ color: "hsl(var(--success))" }}
          >
            <Bookmark className="h-3.5 w-3.5" />
            {result.saved_analysis_id ? t("results.saved") : t("results.autoSaveUnavailable")}
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                {t("results.export.button")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAsJson(result)}>
                {t("results.export.json")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAsText(result, t)}>
                {t("results.export.text")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleRerun()}
            disabled={isLoading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("results.rerun")}
          </Button>
        </div>
      </section>

      {/* Accessible tablist (Radix): role=tab/tablist, aria-selected, and
          arrow-key roving focus come for free; value is mirrored to the URL. */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResultTab)}>
        <TabsList className="press-tabs-list h-auto w-full justify-start overflow-x-auto rounded-none text-muted-foreground">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="press-tab whitespace-nowrap rounded-none shadow-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0 data-[state=active]:bg-card data-[state=active]:shadow-none"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Overview leads with the exact signal values and the clone evidence;
            the redundant radar and the raw source view fold behind disclosure. */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* Verdict → evidence chain, read as ruled margin-label fields */}
          <FieldSheet>
            <Field label={t("results.drivers.label")}>
              <p className="text-sm text-muted-foreground">
                {t("results.drivers.combinedDrivenBy", { score: overallScoreLabel })}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {drivers.map((driver) => {
                  const driverColor =
                    driver.value >= 80
                      ? "hsl(var(--destructive))"
                      : driver.value >= 50
                        ? "hsl(var(--warning))"
                        : "hsl(var(--success))";
                  return (
                    <button
                      key={driver.name}
                      type="button"
                      onClick={() => setActiveTab(signalToTab(driver.name))}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: driverColor }} />
                      {translateSimilarityName(driver.name, t)}
                      <span className="font-mono tabular-nums text-muted-foreground">{Math.round(driver.value)}%</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={t("results.drivers.families")}>
              <p className="text-sm text-foreground/90">{getCloneFocus(result.clone_items, t)}</p>
            </Field>
          </FieldSheet>

          <SimilarityBars items={result.similarity_items} />
          <CloneDetection items={result.clone_items} />

          <details className="overflow-hidden rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              {t("results.disclosure.radar")}
            </summary>
            <div className="border-t border-border p-2">
              <ErrorBoundary fallback={<PanelErrorFallback />}>
                <SimilarityRadar items={result.similarity_items} />
              </ErrorBoundary>
            </div>
          </details>
          <details className="overflow-hidden rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
              <Code2 className="h-4 w-4 text-primary" />
              {t("results.disclosure.code")}
            </summary>
            <div className="border-t border-border">
              <CodeComparisonPanel result={result} description={t("results.overviewDescription")} />
            </div>
          </details>
        </TabsContent>

        <TabsContent value="diff" className="mt-5">
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <DiffViewer
              analysisId={result.saved_analysis_id}
              labelA={result.source_labels.code1}
              labelB={result.source_labels.code2}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="graphs" className="mt-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph1")} color="primary" elements={result.graph_json1} />
            </ErrorBoundary>
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph2")} color="accent" elements={result.graph_json2} />
            </ErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="mt-5">
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <MetricsComparison metricsA={result.metrics1} metricsB={result.metrics2} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="quality" className="mt-5">
          <QualityPanel result={result} />
        </TabsContent>

        <TabsContent value="report" className="mt-5">
          <div className="space-y-6">
            {result.analysis_structured && <StructuredReport data={result.analysis_structured} />}
            <AnalysisReport html={result.analysis_html} />
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-5">
          <GroundedThread
            analysisId={result.saved_analysis_id}
            contextLabel={`${result.source_labels.code1} \u2194 ${result.source_labels.code2}`}
          />
        </TabsContent>
      </Tabs>

      <PdfExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={result}
      />
    </div>
  );
};

export default Results;
