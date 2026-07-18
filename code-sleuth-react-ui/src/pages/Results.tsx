import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  Code2,
  Download,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { AnalysisReport } from "@/components/results/AnalysisReport";
import { AstGraphPanel } from "@/components/results/AstGraphPanel";
import { DiffViewer } from "@/components/results/DiffViewer";
import { MetricsComparison } from "@/components/results/MetricsComparison";
import { PdfExportDialog } from "@/components/results/PdfExportDialog";
import { SimilarityRadar } from "@/components/results/SimilarityRadar";
import { StructuredReport } from "@/components/results/StructuredReport";
import {
  Masthead,
  Field,
  Panel,
  Serial,
  Tag,
  Register,
  Notice,
  DocFrame,
  RailNav,
  RailReadings,
  DocSection,
  ReadoutGrid,
  ReadoutRow,
  StatusTag,
} from "@/components/dossier/Dossier";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import type { AnalysisResult, CloneItem, SimilarityItem } from "@/types/api";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";
import type { TFunction } from "i18next";

type ResultTab = "overview" | "diff" | "graphs" | "metrics" | "quality" | "report" | "chat";

// The section index. RailNav renders label text only — no icons.
function getTabs(t: TFunction): Array<{ id: ResultTab; label: string }> {
  return [
    { id: "overview", label: t("results.tabs.overview") },
    { id: "diff", label: t("results.tabs.diff") },
    { id: "graphs", label: t("results.tabs.graphs") },
    { id: "metrics", label: t("results.tabs.metrics") },
    { id: "quality", label: t("results.tabs.quality") },
    { id: "report", label: t("results.tabs.report") },
    { id: "chat", label: t("results.tabs.chat") },
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


function SimilaritySignals({ items, n }: { items: SimilarityItem[]; n: string }) {
  const { t } = useTranslation("results");
  const strongest = items.reduce<SimilarityItem | null>(
    (max, item) => (max === null || item.value > max.value ? item : max),
    null,
  );

  // The raw measurement table read as a dense two-column instrument readout —
  // each signal carries its own band-coloured meter; the value stays mono/tabular.
  return (
    <DocSection
      n={n}
      title={t("results.similarity.title")}
      // The note names the strongest signal rather than showing a bare number, so
      // the reading is legible without the old header — and translatable.
      note={
        strongest
          ? t("results.similarity.sectionNote", {
              defaultValue: "{{total}} signals · strongest {{name}} {{value}}%",
              total: items.length,
              name: translateSimilarityName(strongest.name, t),
              value: Math.round(strongest.value),
            })
          : t("results.similarity.sectionNoteEmpty", {
              defaultValue: "{{total}} signals · no reading",
              total: items.length,
            })
      }
    >
      <ReadoutGrid cols={2} className="border-t border-border/60">
        {items.map((item) => (
          <ReadoutRow
            key={item.name}
            label={translateSimilarityName(item.name, t)}
            value={formatSimilarityValue(item)}
            meterValue={item.value}
            tone="auto"
          />
        ))}
      </ReadoutGrid>
    </DocSection>
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

function CloneDetection({ items, n }: { items: CloneItem[]; n: string }) {
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
    <DocSection
      n={n}
      title={t("results.cloneTypes.cloneTypeDetection")}
      actions={
        <>
          <StatusTag tone={detectedCount > 0 ? "warning" : "success"}>
            {detectedCount} {t("results.cloneTypes.detectedCount")}
          </StatusTag>
          <StatusTag tone="muted">
            {undetectedCount} {t("results.cloneTypes.notDetectedCount")}
          </StatusTag>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        {summarizeCloneProfile(items, t)}
      </p>

      {/* Case attributes — margin-label fields */}
      <div className="mt-4 border-t border-border">
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
      <div className="mt-2 divide-y divide-border border-t border-border">
        {sortedItems.map((item, index) => {
          const meta = getCloneTypeMeta(item.name, t);

          return (
            <div
              key={item.name}
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4"
            >
              <Serial tone={item.detected ? "primary" : "muted"}>{String(index + 1).padStart(2, "0")}</Serial>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h4 className={cn("text-sm font-semibold", item.detected ? "text-warning" : "text-foreground")}>
                    {translateCloneName(item.name, t)}
                  </h4>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
                    {meta.family}
                  </span>
                  <span
                    className={cn(
                      "ms-auto inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em]",
                      item.detected ? "text-warning" : "text-muted-foreground/60",
                    )}
                  >
                    {item.detected ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    {item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.summary}</p>

                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/85">
                  <span className={cn("font-semibold", item.detected ? "text-warning" : "text-foreground/85")}>
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
    </DocSection>
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
    { serial: "A", title: result.source_labels.code1, code: result.code1 },
    { serial: "B", title: result.source_labels.code2, code: result.code2 },
  ] as const;

  return (
    <div className="space-y-4 p-5">
      <p className="text-xs leading-relaxed text-muted-foreground">{resolvedDescription}</p>

      {/* Two numbered exhibits — ruled headers with serial markers, code kept LTR */}
      <div className="grid gap-5 xl:grid-cols-2">
        {exhibits.map((source) => (
          <section key={source.serial} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <Serial>{source.serial}</Serial>
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

/** Severity → kit tones. `tag` colours the StatusTag stamp; `notice` colours the
    Notice inline-start accent edge. Colour encodes severity, never decoration. */
// `primary` is reserved for action / focus / current-state, so the non-actionable
// style + info severities take the neutral muted stamp instead of the indigo one.
const qualitySeverityTone: Record<
  QualitySeverity,
  { tag: "danger" | "warning" | "muted"; notice: "danger" | "warning" | "info" }
> = {
  critical: { tag: "danger", notice: "danger" },
  warning: { tag: "warning", notice: "warning" },
  style: { tag: "muted", notice: "info" },
  info: { tag: "muted", notice: "info" },
};

/** The status-stamp tone for a source's overall quality disposition. */
function qualityStatusTone(
  statusTone: QualityReport["statusTone"],
): "success" | "warning" | "danger" | "primary" {
  if (statusTone === "excellent" || statusTone === "healthy") return "success";
  if (statusTone === "watch") return "warning";
  if (statusTone === "critical") return "danger";
  return "primary";
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

/** The translated stamp label for a source's overall quality disposition.
    Colour is carried by `qualityStatusTone` + StatusTag, not by this helper. */
function getQualityToneLabel(statusTone: QualityReport["statusTone"], t: TFunction): string {
  if (statusTone === "excellent") return t("results.quality.statusTone.excellent");
  if (statusTone === "healthy") return t("results.quality.statusTone.healthy");
  if (statusTone === "watch") return t("results.quality.statusTone.needsReview");
  if (statusTone === "critical") return t("results.quality.statusTone.highRisk");
  return t("results.quality.statusTone.diagnosticView");
}

function QualitySourceCard({
  n,
  id,
  title,
  report,
}: {
  n: string;
  id: string;
  title: string;
  report: QualityReport;
}) {
  const { t } = useTranslation("results");
  const totalFindings = report.issues.length;
  const toneLabel = getQualityToneLabel(report.statusTone, t);
  const topIssues = report.issues.slice(0, 8);
  const warningCount = report.counts.warning + report.counts.style;
  const severityLabels: Record<QualitySeverity, string> = {
    critical: t("results.quality.severityLabels.critical"),
    warning: t("results.quality.severityLabels.warning"),
    style: t("results.quality.severityLabels.style"),
    info: t("results.quality.severityLabels.info"),
  };
  // Higher score is healthier \u2014 the inverse of similarity, so the band is set
  // explicitly rather than via the similarity-calibrated scoreBand().
  const scoreTone =
    report.score === null ? "primary"
    : report.score >= 7 ? "success"
    : report.score >= 5 ? "warning"
    : "danger";
  const scoreClass =
    report.score === null ? "text-foreground"
    : report.score >= 7 ? "text-success"
    : report.score >= 5 ? "text-warning"
    : "text-destructive";

  return (
    <DocSection
      n={n}
      title={
        <span className="flex items-center gap-2">
          <Serial>{id}</Serial>
          {title}
        </span>
      }
      note={report.score !== null ? `${report.score.toFixed(1)}/10` : "\u2014"}
      actions={<StatusTag tone={qualityStatusTone(report.statusTone)}>{toneLabel}</StatusTag>}
    >
      <p className="text-sm font-medium text-foreground">{report.headline}</p>
      <p className="mt-1 t-body">{report.summary}</p>

      {/* Quality score \u2014 a dense band-coloured readout, not a big-number tile */}
      <ReadoutGrid cols={1} className="mt-4 border-t border-border/60">
        <ReadoutRow
          label={t("results.quality.qualityScore")}
          value={
            <span className={scoreClass}>
              {report.score !== null ? `${report.score.toFixed(1)}/10` : "\u2014"}
            </span>
          }
          meterValue={report.score !== null ? report.score * 10 : undefined}
          tone={scoreTone}
        />
      </ReadoutGrid>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {report.ratingLine ? t("results.quality.derivedFromPylint") : t("results.quality.basedOnTextual")}
      </p>

      {/* Finding tallies \u2014 margin-label fields, severity carried in the value colour */}
      <div className="mt-4 border-t border-border">
        <Field label={t("results.quality.findings")}>
          <div className="font-mono text-lg font-bold tabular-nums text-foreground">{totalFindings}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("results.quality.findingsDesc")}</p>
        </Field>
        <Field label={t("results.quality.critical")}>
          <div className={cn("font-mono text-lg font-bold tabular-nums", report.counts.critical > 0 ? "text-destructive" : "text-foreground")}>
            {report.counts.critical}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("results.quality.criticalDesc")}</p>
        </Field>
        <Field label={t("results.quality.warnings")}>
          <div className={cn("font-mono text-lg font-bold tabular-nums", warningCount > 0 ? "text-warning" : "text-foreground")}>
            {warningCount}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("results.quality.warningsDesc")}</p>
        </Field>
        <Field label={t("results.quality.dominantSignals")}>
          <p className="text-sm font-semibold text-foreground">
            {report.dominantSymbols.length ? report.dominantSymbols.join(" \u2022 ") : t("results.quality.noRepeatedRule")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("results.quality.dominantSignalsDesc")}</p>
        </Field>
      </div>

      {/* Priority findings \u2014 flat ruled notices; the accent edge encodes severity */}
      {topIssues.length > 0 ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h3 className="t-label text-foreground">{t("results.quality.priorityFindings")}</h3>
          </div>
          <div className="space-y-2">
            {topIssues.map((issue, index) => {
              const tone = qualitySeverityTone[issue.severity];
              return (
                <Notice
                  key={`${issue.symbol ?? issue.message}-${index}`}
                  tone={tone.notice}
                  label={
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusTag tone={tone.tag}>{severityLabels[issue.severity]}</StatusTag>
                      {issue.symbol && <Tag tone="neutral">{issue.symbol}</Tag>}
                      {(issue.line !== null || issue.column !== null) && (
                        <Tag tone="neutral">
                          {issue.line !== null ? t("results.quality.line", { line: issue.line }) : t("results.quality.lineEmpty")}
                          {issue.column !== null ? t("results.quality.column", { column: issue.column }) : ""}
                        </Tag>
                      )}
                    </div>
                  }
                >
                  <p className="text-sm font-medium leading-relaxed text-foreground">{issue.message}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                    {t("results.quality.reportedByLinter")}{" "}
                    <span className="font-semibold text-foreground/85">{issue.rawType}</span>.
                  </p>
                </Notice>
              );
            })}
          </div>
        </div>
      ) : (
        <Notice tone="success" label={t("results.quality.noStructuredFindings")} className="mt-5">
          {report.generalNotes[0] || t("results.quality.noStructuredFindingsDesc")}
        </Notice>
      )}

      {/* Raw diagnostic report \u2014 folded, flat hairline container */}
      {(report.generalNotes.length > 0 || report.text) && (
        <details className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
            {t("results.quality.rawDiagnosticReport")}
          </summary>
          <div className="border-t border-border px-4 py-4">
            {report.generalNotes.length > 0 && (
              <div className="mb-3 divide-y divide-border border-t border-border">
                {report.generalNotes.map((note, index) => (
                  <p key={`${note}-${index}`} className="py-2 text-xs leading-relaxed text-muted-foreground">
                    {note}
                  </p>
                ))}
              </div>
            )}
            <pre className="code-surface max-h-[320px] overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed scrollbar-thin">
              {report.text}
            </pre>
          </div>
        </details>
      )}
    </DocSection>
  );
}

function QualityPanel({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation("results");
  const sourceReports = [
    {
      id: "A",
      title: t("results.quality.sourceAReview"),
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
  const averageScoreTone =
    averageScore === null ? "primary"
    : averageScore >= 7 ? "success"
    : averageScore >= 5 ? "warning"
    : "danger";
  const averageScoreClass =
    averageScore === null ? "text-foreground"
    : averageScore >= 7 ? "text-success"
    : averageScore >= 5 ? "text-warning"
    : "text-destructive";

  return (
    <div>
      {/* \u00a701 \u2014 diagnostic overview, a ruled section instead of a premium card */}
      <DocSection
        n="01"
        title={t("results.quality.headline")}
        note={averageScore !== null ? `${averageScore.toFixed(1)}/10` : "\u2014"}
      >
        <div className="flex flex-wrap gap-2">
          <Tag tone="primary">{t("results.quality.intelligence")}</Tag>
          <Tag tone="neutral">{t("results.quality.linterDriven")}</Tag>
        </div>
        <p className="mt-3 max-w-3xl t-body">{t("results.quality.description")}</p>

        {/* Average score \u2014 dense band-coloured readout */}
        <ReadoutGrid cols={1} className="mt-4 border-t border-border/60">
          <ReadoutRow
            label={t("results.quality.averageScore")}
            value={
              <span className={averageScoreClass}>
                {averageScore !== null ? averageScore.toFixed(1) : "\u2014"}
              </span>
            }
            meterValue={averageScore !== null ? averageScore * 10 : undefined}
            tone={averageScoreTone}
          />
        </ReadoutGrid>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t("results.quality.averageScoreDesc")}
        </p>

        {/* Aggregate readings \u2014 margin-label fields */}
        <div className="mt-4 border-t border-border">
          <Field label={t("results.quality.totalFindings")}>
            <div className="font-mono text-lg font-bold tabular-nums text-foreground">{totalFindings}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("results.quality.totalFindingsDesc")}</p>
          </Field>
          <Field label={t("results.quality.healthierSource")}>
            <p className="text-sm font-semibold text-foreground">{healthierSource.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {healthierSource.report.score !== null
                ? t("results.quality.healthierScoreDesc", { score: healthierSource.report.score.toFixed(1) })
                : t("results.quality.healthierIssueDesc")}
            </p>
          </Field>
        </div>
      </DocSection>

      {sourceReports.map((source, index) => (
        <QualitySourceCard
          key={source.id}
          n={String(index + 2).padStart(2, "0")}
          id={source.id}
          title={source.title}
          report={source.report}
        />
      ))}
    </div>
  );
}

function PanelErrorFallback() {
  const { t } = useTranslation("results");
  return (
    <div role="alert">
      <Notice tone="danger">{t("results.panelError")}</Notice>
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
      <Panel label={emptyStateTitle} className="max-w-2xl">
        <p className="t-body">{emptyStateDescription}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="h-10 gap-2">
            <Link to="/analysis">{t("results.startAnalysis")}</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link to="/history">{t("results.openHistory")}</Link>
          </Button>
        </div>
      </Panel>
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

      {/* CASE FILE — score ring as the exhibit, verdict readout as a mono meta strip */}
      <section className="space-y-5">
        <div className="flex flex-col gap-6 border-b border-border pb-6 lg:flex-row lg:items-start">
          {/* Score dial — the dominant instrument, seated in a lightly gridded bezel */}
          <div className="relative h-40 w-40 shrink-0 self-center lg:self-start">
            <div className="paper-grid-fine pointer-events-none absolute inset-0 rounded-full opacity-40" aria-hidden="true" />
            <svg
              className="relative h-full w-full -rotate-90"
              viewBox="0 0 128 128"
              role="img"
              aria-label={t("results.ring.aria", { score: overallScoreLabel, band: scoreTone.label })}
            >
              <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke={scoreRingColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (1 - overallScore / 100)}
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("t-stat text-[2.75rem]", scoreTone.color)}>
                {overallScoreLabel}
              </span>
              <span
                className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground"
                style={{ letterSpacing: "0.04em" }}
              >
                {t("results.percentSimilar")}
              </span>
            </div>
          </div>

          {/* Masthead — the verdict readout lives in the mono meta strip */}
          <Masthead
            className="min-w-0 flex-1 border-b-0 pb-0"
            kicker={t("results.title")}
            title={
              <span className="block truncate">
                {result.source_labels.code1} × {result.source_labels.code2}
              </span>
            }
            description={
              <>
                {t(`results.verdictMeaning.${band}`)}
                {confidence.advisory ? ` ${t("results.verdictMeaning.advisoryNote")}` : ""}
              </>
            }
            meta={[
              { label: "SIMILARITY", value: <span className={scoreTone.color}>{overallScoreLabel}%</span> },
              { label: "VERDICT", value: <span className={scoreTone.color}>{scoreTone.label}</span> },
              {
                label: "CONFIDENCE",
                value: (
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={t("results.confidence.tooltip", {
                      corroborating: confidence.corroborating,
                      total: confidence.deterministicTotal,
                    })}
                  >
                    {confidenceLabel}
                    {confidence.advisory && (
                      <span className="text-warning">· {t("results.confidence.advisoryTag")}</span>
                    )}
                  </span>
                ),
              },
              { label: "LANG", value: getProgrammingLanguageLabel(result.language) },
              ...(result.saved_analysis_id
                ? [{ label: "ID", value: `#${result.saved_analysis_id}` }]
                : []),
            ]}
            actions={
              <>
                <Button size="sm" className="h-9 gap-2" onClick={() => setPdfOpen(true)}>
                  <Download className="h-4 w-4" />
                  {t("results.export.pdf")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2"
                  onClick={() => setActiveTab("chat")}
                >
                  <ScrollText className="h-4 w-4" />
                  {t("results.askAnalyst", { defaultValue: "Ask analyst" })}
                </Button>
              </>
            }
          />
        </div>

        {/* Calibrated scale — the instrument face the verdict is read against, with a
            live ticker at the current reading. The 0–100 axis stays LTR inside RTL,
            like code and data. */}
        <div className="space-y-3">
          <div dir="ltr" className="select-none">
            <div className="relative">
              <div className="flex h-2.5 w-full overflow-hidden rounded-sm">
                <span className="bg-success" style={{ width: "50%" }} />
                <span className="bg-warning" style={{ width: "30%" }} />
                <span className="bg-destructive" style={{ width: "20%" }} />
              </div>
              {/* current reading ticker */}
              <span
                className="absolute -top-1.5 h-[1.375rem] w-[3px] -translate-x-1/2 rounded-[1px] bg-foreground shadow-[0_0_0_2px_hsl(var(--card))]"
                style={{ left: `${Math.max(0, Math.min(100, overallScore))}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="relative mt-1.5 h-3 font-mono text-[10px] tabular-nums text-muted-foreground">
              <span className="absolute left-0">0</span>
              <span className="absolute left-1/2 -translate-x-1/2">50</span>
              <span className="absolute left-[80%] -translate-x-1/2">80</span>
              <span className="absolute right-0">100</span>
            </div>
          </div>

          {/* Localized band legend + the CI-gate note */}
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t("results.legend.aria")}
          >
            {(
              [
                { key: "low", range: "< 50", token: "success" },
                { key: "moderate", range: "50–79", token: "warning" },
                { key: "high", range: "≥ 80", token: "destructive" },
              ] as const
            ).map((seg) => {
              const isActive = band === seg.key;
              return (
                <span
                  key={seg.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
                    isActive ? "border-current font-semibold" : "border-border text-muted-foreground",
                  )}
                  style={isActive ? { color: `hsl(var(--${seg.token}))` } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: `hsl(var(--${seg.token}))` }} />
                  {t(`results.legend.${seg.key}`)}
                  <span className="tabular-nums opacity-80">{seg.range}</span>
                </span>
              );
            })}
            <span className="text-[11px] text-muted-foreground">{t("results.legend.gateNote")}</span>
          </div>
        </div>

        {/* Utility strip — case handling actions, read as a mono row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
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
            className={cn(
              "h-8 gap-1.5 text-xs",
              result.saved_analysis_id ? "text-success" : "text-muted-foreground",
            )}
            disabled
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

      {/* Document body — the report's sections live in the margin rail as a
          numbered contents index plus a live readings block; the wide main
          column renders the active section. The rail replaces the tab strip. */}
      <DocFrame
        rail={
          <>
            <RailNav
              label={t("results.rail.sections", { defaultValue: "Sections" })}
              ariaLabel={t("results.rail.sections", { defaultValue: "Sections" })}
              items={tabs.map((tab, index) => ({
                n: String(index + 1).padStart(2, "0"),
                label: tab.label,
                active: activeTab === tab.id,
                onClick: () => setActiveTab(tab.id),
              }))}
            />
            <RailReadings
              label={t("results.rail.readings", { defaultValue: "Readings" })}
              items={[
                {
                  label: t("results.rail.combined", { defaultValue: "Combined" }),
                  value: `${overallScoreLabel}%`,
                  tone: band === "high" ? "danger" : band === "moderate" ? "warning" : "success",
                },
                {
                  label: t("results.rail.confidence", { defaultValue: "Confidence" }),
                  value: confidenceLabel,
                  tone: confidence.advisory ? "warning" : "default",
                },
                {
                  label: t("results.rail.corroborating", { defaultValue: "Corroborating" }),
                  value: `${confidence.corroborating}/${confidence.deterministicTotal}`,
                },
                {
                  label: t("results.language"),
                  value: getProgrammingLanguageLabel(result.language),
                },
              ]}
            />
          </>
        }
      >
        {/* RailNav is the section switcher, so there is no tab strip and no
            tabpanel to label — the active section is rendered straight into the
            main column. Only the selected section mounts, as before; the choice
            still lives in the URL via activeTab. */}
        <div key={activeTab}>

        {/* §01 Overview — the exact signal values + clone evidence lead; the
            redundant radar and the raw source view fold behind disclosure. */}
        {activeTab === "overview" && (
        <>
          {/* §01 — verdict → evidence chain, read as a ruled document section */}
          <DocSection n="01" title={t("results.drivers.label")} note={`→ ${overallScoreLabel}%`}>
            <p className="t-body">
              {t("results.drivers.combinedDrivenBy", { score: overallScoreLabel })}
            </p>
            <Register
              className="mt-3"
              items={drivers.map((driver) => ({
                value: driver.name,
                label: `${translateSimilarityName(driver.name, t)} ${Math.round(driver.value)}%`,
              }))}
              onSelect={(value) => setActiveTab(signalToTab(value))}
            />
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-3">
              <span className="t-label">{t("results.drivers.families")}</span>
              <span className="text-sm text-foreground/90">{getCloneFocus(result.clone_items, t)}</span>
            </div>
          </DocSection>

          {/* §02 — similarity signal readout */}
          <SimilaritySignals items={result.similarity_items} n="02" />

          {/* §03 — clone-type detection */}
          <CloneDetection items={result.clone_items} n="03" />

          {/* Supplementary exhibits — folded until called for */}
          <div className="mt-6 space-y-4">
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
          </div>
        </>
        )}

        {activeTab === "diff" && (
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <DiffViewer
              analysisId={result.saved_analysis_id}
              labelA={result.source_labels.code1}
              labelB={result.source_labels.code2}
            />
          </ErrorBoundary>
        )}

        {activeTab === "graphs" && (
          <div className="grid gap-5 xl:grid-cols-2">
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph1")} color="primary" elements={result.graph_json1} />
            </ErrorBoundary>
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph2")} color="accent" elements={result.graph_json2} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === "metrics" && (
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <MetricsComparison metricsA={result.metrics1} metricsB={result.metrics2} />
          </ErrorBoundary>
        )}

        {activeTab === "quality" && <QualityPanel result={result} />}

        {activeTab === "report" && (
          <div className="space-y-6">
            {result.analysis_structured && <StructuredReport data={result.analysis_structured} />}
            <AnalysisReport html={result.analysis_html} />
          </div>
        )}

        {activeTab === "chat" && (
          <AnalysisChatPanel
            analysisId={result.saved_analysis_id}
            contextLabel={`${result.source_labels.code1} \u2194 ${result.source_labels.code2}`}
          />
        )}
        </div>
      </DocFrame>

      <PdfExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={result}
      />
    </div>
  );
};

export default Results;
