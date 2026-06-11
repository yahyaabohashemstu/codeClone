import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  Code2,
  Cpu,
  Download,
  FileText,
  GitCompare,
  MessageSquare,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Diff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { AnalysisReport } from "@/components/results/AnalysisReport";
import { AstGraphPanel } from "@/components/results/AstGraphPanel";
import { DiffViewer } from "@/components/results/DiffViewer";
import { MetricsComparison } from "@/components/results/MetricsComparison";
import { PdfExportDialog } from "@/components/results/PdfExportDialog";
import { SimilarityRadar } from "@/components/results/SimilarityRadar";
import { StructuredReport } from "@/components/results/StructuredReport";
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
  return (
    <div className="card-premium p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="h-4 w-4 text-primary" />
        {t("results.similarity.title")}
      </h3>
      <div className="space-y-4">
        {items.map((item) => {
          const barTone = item.value >= 80 ? "from-destructive to-destructive/70" : item.value >= 50 ? "from-warning to-warning/70" : "from-success to-success/70";
          return (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{translateSimilarityName(item.name, t)}</span>
                <span className={cn("font-bold tabular-nums", item.value >= 80 ? "text-destructive" : item.value >= 50 ? "text-warning" : "text-success")}>
                  {formatSimilarityValue(item)}
                </span>
              </div>
              <div className="metric-bar-track w-full">
                <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", barTone)} style={{ width: `${item.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitCompare className="h-4 w-4 text-primary" />
              {t("results.cloneTypes.cloneTypeDetection")}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {summarizeCloneProfile(items, t)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={detectedCount > 0 ? "badge-warning" : "badge-success"}>
              {detectedCount} {t("results.cloneTypes.detectedCount")}
            </span>
            <span className="badge-info">{undetectedCount} {t("results.cloneTypes.notDetectedCount")}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border/50 p-5 xl:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            {t("results.cloneTypes.cloneProfile")}
          </p>
          <p className="mt-3 text-base font-semibold text-foreground">
            {getCloneProfileLabel(items, t)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.dominantInterpretation")}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
              {t("results.cloneTypes.detectionCoverage")}
            </p>
            <span className={detectedCount > 0 ? "badge-warning" : "badge-success"}>
              {coverage}%
            </span>
          </div>
          <div className="metric-bar-track mt-3 w-full">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                detectedCount > 0 ? "bg-gradient-to-r from-warning to-warning/70" : "bg-gradient-to-r from-success to-success/70",
              )}
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.cloneFamiliesActivated", { detected: detectedCount, total: items.length })}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            {t("results.cloneTypes.strongestSignals")}
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {getCloneFocus(items, t)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("results.cloneTypes.meaningfulCategoriesSurfaced")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {sortedItems.map((item) => {
          const meta = getCloneTypeMeta(item.name, t);

          return (
            <div
              key={item.name}
              className={cn(
                "rounded-xl border p-4 transition-all duration-200",
                item.detected
                  ? "border-warning/30 bg-warning/5"
                  : "border-border/40 bg-muted/10",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                    item.detected
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border/50 bg-muted/30 text-muted-foreground/60",
                  )}
                >
                  {item.detected ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-info">{meta.family}</span>
                    <h4 className={cn("text-sm font-semibold", item.detected ? "text-warning" : "text-foreground")}>{translateCloneName(item.name, t)}</h4>
                    <span className={item.detected ? "badge-warning" : "badge-info"}>
                      {item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.summary}</p>

                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/85">
                    <span className={cn("font-semibold", item.detected ? "text-warning" : "text-foreground/85")}>
                      {item.detected ? t("results.cloneTypes.interpretation") : t("results.cloneTypes.reading")}
                    </span>{" "}
                    {item.detected ? meta.detectedMeaning : meta.absentMeaning}
                  </p>

                  <div className="mt-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                    <p className="text-[11px] font-semibold text-foreground/90">{t("results.cloneTypes.whyItMatters")}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                      {meta.whyItMatters}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Code2 className="h-4 w-4 text-primary" />
          {t("results.sourceCodeComparison")}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-2">
        {[
          { title: result.source_labels.code1, code: result.code1, tone: "primary" },
          { title: result.source_labels.code2, code: result.code2, tone: "accent" },
        ].map((source, index) => (
          <div key={source.title + index} className="overflow-hidden rounded-xl border border-border/50 bg-muted/10">
            <div className="border-b border-border/50 bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", source.tone === "primary" ? "bg-primary" : "bg-accent")} />
                <span className="text-xs font-medium text-foreground">{source.title}</span>
              </div>
            </div>
            <pre className="code-surface m-4 max-h-[680px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed scrollbar-thin">
              <code>{source.code}</code>
            </pre>
          </div>
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
      containerClass: "border-success/20 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.16),transparent_45%),linear-gradient(180deg,rgba(22,163,74,0.04),rgba(10,14,25,0.22))]",
      scoreClass: "text-success",
      label: t("results.quality.statusTone.excellent"),
      icon: ShieldCheck,
    };
  }
  if (statusTone === "healthy") {
    return {
      badgeClass: "badge-success",
      containerClass: "border-success/14 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_45%),linear-gradient(180deg,rgba(34,197,94,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-success",
      label: t("results.quality.statusTone.healthy"),
      icon: CheckCircle2,
    };
  }
  if (statusTone === "watch") {
    return {
      badgeClass: "badge-warning",
      containerClass: "border-warning/18 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_45%),linear-gradient(180deg,rgba(245,158,11,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-warning",
      label: t("results.quality.statusTone.needsReview"),
      icon: ShieldAlert,
    };
  }
  if (statusTone === "critical") {
    return {
      badgeClass: "badge-error",
      containerClass: "border-destructive/18 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.12),transparent_45%),linear-gradient(180deg,rgba(239,68,68,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-destructive",
      label: t("results.quality.statusTone.highRisk"),
      icon: AlertTriangle,
    };
  }
  return {
    badgeClass: "badge-info",
    containerClass: "border-border/60 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_45%),linear-gradient(180deg,rgba(99,102,241,0.03),rgba(10,14,25,0.22))]",
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
    <div className={cn("card-premium overflow-hidden border", toneMeta.containerClass)}>
      <div className="border-b border-border/50 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]", accentClass)} />
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <span className={toneMeta.badgeClass}>{toneMeta.label}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{report.headline}</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
            </div>
          </div>

          <div className="min-w-[168px] rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-right shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/75">
                {t("results.quality.qualityScore")}
              </span>
              <ToneIcon className={cn("h-4 w-4", toneMeta.scoreClass)} />
            </div>
            <div className={cn("mt-3 text-4xl font-bold tracking-tight", toneMeta.scoreClass)}>
              {report.score !== null ? report.score.toFixed(1) : "\u2014"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {report.ratingLine
                ? t("results.quality.derivedFromPylint")
                : t("results.quality.basedOnTextual")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border/50 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.findings")}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{totalFindings}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.findingsDesc")}</p>
        </div>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.04] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.critical")}</p>
          <p className="mt-3 text-2xl font-semibold text-destructive">{report.counts.critical}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.criticalDesc")}</p>
        </div>
        <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.warnings")}</p>
          <p className="mt-3 text-2xl font-semibold text-warning">{report.counts.warning + report.counts.style}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.warningsDesc")}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.dominantSignals")}</p>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {report.dominantSymbols.length ? report.dominantSymbols.join(" \u2022 ") : t("results.quality.noRepeatedRule")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.dominantSignalsDesc")}</p>
        </div>
      </div>

      <div className="p-5">
        {topIssues.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">{t("results.quality.priorityFindings")}</h4>
            </div>
            <div className="space-y-3">
              {topIssues.map((issue, index) => {
                const meta = qualitySeverityMeta[issue.severity];
                const IssueIcon = meta.icon;
                return (
                  <div key={`${issue.symbol ?? issue.message}-${index}`} className={cn("rounded-2xl border p-4 transition-all duration-200", meta.cardClass)}>
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", meta.iconClass)}>
                        <IssueIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={meta.badgeClass}>{severityLabels[issue.severity]}</span>
                          {issue.symbol && <span className="badge-info">{issue.symbol}</span>}
                          {(issue.line !== null || issue.column !== null) && (
                            <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-0.5 text-[11px] text-muted-foreground">
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-success/18 bg-success/[0.05] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("results.quality.noStructuredFindings")}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {report.generalNotes[0] || t("results.quality.noStructuredFindingsDesc")}
                </p>
              </div>
            </div>
          </div>
        )}

        {(report.generalNotes.length > 0 || report.text) && (
          <details className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-background/35">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
              {t("results.quality.rawDiagnosticReport")}
            </summary>
            <div className="border-t border-border/40 px-4 py-4">
              {report.generalNotes.length > 0 && (
                <div className="mb-3 space-y-2">
                  {report.generalNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
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
    </div>
  );
}

function QualityPanel({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation("results");
  const sourceReports = [
    {
      id: "A",
      title: t("results.quality.sourceAReview"),
      accentClass: "bg-primary text-primary",
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
      accentClass: "bg-accent text-accent",
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
    <div className="space-y-5">
      <div className="card-premium overflow-hidden border-primary/16 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.10),transparent_36%),linear-gradient(180deg,rgba(99,102,241,0.04),rgba(10,14,25,0.18))]">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-info">{t("results.quality.intelligence")}</span>
              <span className="badge-info">{t("results.quality.linterDriven")}</span>
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{t("results.quality.headline")}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {t("results.quality.description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.totalFindings")}</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{totalFindings}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.totalFindingsDesc")}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.averageScore")}</p>
              <p className={cn("mt-3 text-3xl font-semibold", averageScore !== null && averageScore >= 7 ? "text-success" : averageScore !== null && averageScore >= 5 ? "text-warning" : averageScore !== null ? "text-destructive" : "text-foreground")}>
                {averageScore !== null ? averageScore.toFixed(1) : "\u2014"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{t("results.quality.averageScoreDesc")}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{t("results.quality.healthierSource")}</p>
              <p className="mt-3 text-sm font-semibold text-foreground">{healthierSource.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {healthierSource.report.score !== null
                  ? t("results.quality.healthierScoreDesc", { score: healthierSource.report.score.toFixed(1) })
                  : t("results.quality.healthierIssueDesc")}
              </p>
            </div>
          </div>
        </div>
      </div>

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

const Results = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentResult, loadCurrent, loadById, rerunById, clearCurrentResult } = useAnalysis();
  const { localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("results");
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const tabs = useMemo(() => getTabs(t), [t]);

  const requestedId = searchParams.get("analysisId");

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
  const overallScoreLabel = overallScore.toFixed(1);
  const isCompactOverallScore = overallScoreLabel.length >= 5;

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
        className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <h2 className="h-3">{emptyStateTitle}</h2>
        <p className="mx-auto mt-3 max-w-md t-body">{emptyStateDescription}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            asChild
            className="h-10 gap-2 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
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

      {/* Main result header — score ring + title + actions */}
      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="flex flex-wrap items-center gap-6 p-6">
          {/* Score ring */}
          <div className="relative h-32 w-32 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
              <defs>
                <linearGradient id="score-gr" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={scoreRingColor} />
                  <stop offset="100%" stopColor={scoreRingColor} stopOpacity="0.7" />
                </linearGradient>
              </defs>
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="10"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="url(#score-gr)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (1 - overallScore / 100)}
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn(
                  "font-mono font-bold leading-none tabular-nums",
                  scoreTone.color,
                  isCompactOverallScore ? "text-[1.75rem]" : "text-[2.125rem]",
                )}
                style={{ letterSpacing: "-0.04em" }}
              >
                {overallScoreLabel}
              </span>
              <span
                className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground"
                style={{ letterSpacing: "0.04em" }}
              >
                % {t("results.match", { defaultValue: "match" }).toLowerCase()}
              </span>
            </div>
          </div>

          {/* Title + source labels */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {result.saved_analysis_id && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold"
                  style={{
                    background: "hsl(var(--secondary))",
                    color: "hsl(var(--secondary-foreground))",
                  }}
                >
                  #{result.saved_analysis_id}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  scoreTone.badge,
                )}
              >
                {scoreTone.label}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  background: "hsl(var(--secondary))",
                  color: "hsl(var(--secondary-foreground))",
                }}
              >
                {getProgrammingLanguageLabel(result.language)}
              </span>
            </div>
            <h1 className="h-3 truncate">
              {result.source_labels.code1} × {result.source_labels.code2}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("results.summaryDescription")}
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-col gap-2">
            <Button
              size="sm"
              className="h-9 gap-2 text-white"
              style={{
                background: "var(--gradient-brand)",
                boxShadow: "var(--glow-shadow-sm)",
              }}
              onClick={() => setPdfOpen(true)}
            >
              <Download className="h-4 w-4" />
              {t("results.export.pdf")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={() => setActiveTab("chat")}
            >
              <Sparkles className="h-4 w-4" />
              {t("results.askAnalyst", { defaultValue: "Ask analyst" })}
            </Button>
          </div>
        </div>

        {/* Top engines row */}
        <div
          className="grid grid-cols-2 gap-3 border-t border-border p-6 sm:grid-cols-4"
          style={{ background: "hsl(var(--surface-2) / 0.5)" }}
        >
          {result.similarity_items.slice(0, 4).map((item) => {
            const color =
              item.value >= 80
                ? "hsl(var(--destructive))"
                : item.value >= 50
                  ? "hsl(var(--warning))"
                  : "hsl(var(--success))";
            return (
              <div
                key={item.name}
                className="rounded-md p-3"
                style={{ background: "hsl(var(--surface-2))" }}
              >
                <div className="t-label truncate">{translateSimilarityName(item.name, t)}</div>
                <div
                  className="mt-1 font-mono text-xl font-bold tabular-nums"
                  style={{ color, letterSpacing: "-0.01em" }}
                >
                  {item.value.toFixed(1)}%
                </div>
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full"
                  style={{ background: "hsl(var(--muted))" }}
                >
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${Math.min(100, item.value)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Secondary actions strip */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-3">
          <Link to="/analysis">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />
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

      {/* Tabs — underline style */}
      <div className="flex flex-wrap gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-all",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              style={active ? { fontWeight: 600 } : undefined}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in-fast">
        {activeTab === "overview" && (
          <div className="space-y-5">
            <CodeComparisonPanel
              result={result}
              description={t("results.overviewDescription")}
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SimilarityBars items={result.similarity_items} />
              <SimilarityRadar items={result.similarity_items} />
            </div>
            <CloneDetection items={result.clone_items} />
          </div>
        )}

        {activeTab === "diff" && (
          <DiffViewer
            analysisId={result.saved_analysis_id}
            labelA={result.source_labels.code1}
            labelB={result.source_labels.code2}
          />
        )}

        {activeTab === "graphs" && (
          <div className="grid gap-5 xl:grid-cols-2">
            <AstGraphPanel title={t("results.graph1")} color="primary" elements={result.graph_json1} />
            <AstGraphPanel title={t("results.graph2")} color="accent" elements={result.graph_json2} />
          </div>
        )}

        {activeTab === "metrics" && <MetricsComparison metricsA={result.metrics1} metricsB={result.metrics2} />}

        {activeTab === "quality" && <QualityPanel result={result} />}

        {activeTab === "report" && (
          <div className="space-y-6">
            {result.analysis_structured && (
              <StructuredReport data={result.analysis_structured} />
            )}
            <AnalysisReport html={result.analysis_html} />
          </div>
        )}

        {activeTab === "chat" && (
          <AnalysisChatPanel contextLabel={`${result.source_labels.code1} \u2194 ${result.source_labels.code2}`} />
        )}
      </div>

      <PdfExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={result}
      />
    </div>
  );
};

export default Results;
