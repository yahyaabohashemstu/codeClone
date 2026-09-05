import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageLoader } from "@/components/common/PageLoader";
import { BenchButton, Lamp, Tag } from "@/components/bench/Bench";
import { IconDownload, IconFilePlus, IconRerun, IconShare } from "@/components/bench/icons";
import { Field, FieldSheet, Panel, Serial } from "@/components/dossier/Dossier";
import { GroundedThread } from "@/components/results/AnalysisChatPanel";
import { AnalysisReport } from "@/components/results/AnalysisReport";
import { AstGraphPanel } from "@/components/results/AstGraphPanel";
import { Comparator } from "@/components/results/DiffViewer";
import { MetricsComparison } from "@/components/results/MetricsComparison";
import { PdfExportDialog } from "@/components/results/PdfExportDialog";
import { QualityPanel } from "@/components/results/QualityPanel";
import { SimilarityRadar } from "@/components/results/SimilarityRadar";
import { StructuredReport } from "@/components/results/StructuredReport";
import { VerdictBlock } from "@/components/results/VerdictBlock";
import { buildComparison, useAnalysisDiff } from "@/components/results/comparison";
import {
  buildSignalRows,
  buildWhyRows,
  clonePriority,
  exportAsJson,
  exportAsText,
  getCloneVerdict,
  getCombinedScore,
  getVerdictConfidence,
  getVerdictHeadline,
  ledgerDateTime,
  translateCloneName,
  type EvidenceTarget,
} from "@/components/results/verdict";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import type { CloneItem } from "@/types/api";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";

/**
 * Verdict — the reading, then the evidence behind it.
 *
 * The combined similarity and the weighted signals stand above the fold at all
 * times; everything that supports them is filed behind the tab strip, so a
 * reviewer can move between the comparator, the graphs, the metrics, the
 * quality pass and the analyst without losing the verdict from view.
 */

type ResultTab = "overview" | "diff" | "graphs" | "metrics" | "quality" | "report" | "chat";

const TAB_IDS: ResultTab[] = ["overview", "diff", "graphs", "metrics", "quality", "report", "chat"];

/** Section anchors used by the long-scroll layout still resolve to their tab. */
const SECTION_ALIASES: Record<string, ResultTab> = {
  verdict: "overview",
  why: "overview",
  checks: "overview",
  radar: "overview",
  comparator: "diff",
  structured: "report",
};

const SEMANTIC_MODEL = "unixcoder-base";

function tabForEvidence(target: EvidenceTarget): ResultTab {
  if (target === "graphs") return "graphs";
  if (target === "report") return "report";
  if (target === "checks") return "overview";
  return "diff";
}

function PanelErrorFallback() {
  const { t } = useTranslation("results");
  return (
    <div className="border border-signal px-4 py-3 text-[13px] text-signal-bench" role="alert">
      {t("results.panelError")}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Clone profile — the interpretation ledger behind the lamps
   ──────────────────────────────────────────────────────────────────────── */

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

function getCloneTypeMeta(name: string, t: TFunction) {
  const metaKey = cloneMetaKeyMap[name] ?? "fallback";
  return {
    summary: t(`results.cloneMeta.${metaKey}.summary`),
    detectedMeaning: t(`results.cloneMeta.${metaKey}.detectedMeaning`),
    absentMeaning: t(`results.cloneMeta.${metaKey}.absentMeaning`),
    family: t(`results.cloneMeta.${metaKey}.family`),
    whyItMatters: t(`results.cloneMeta.${metaKey}.whyItMatters`),
  };
}

function summarizeCloneProfile(items: CloneItem[], t: TFunction) {
  const detectedCount = items.filter((item) => item.detected).length;
  const exactDetected = items.some((item) => item.name === "Exact Clone" && item.detected);
  const semanticDetected = items.some((item) => item.name === "Semantic Clone" && item.detected);
  if (detectedCount === 0) return t("results.cloneProfile.summaryNone");
  if (exactDetected) return t("results.cloneProfile.summaryExact");
  if (semanticDetected && detectedCount >= 4) return t("results.cloneProfile.summarySemanticMulti");
  if (detectedCount >= 4) return t("results.cloneProfile.summaryMulti");
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
  if (!detectedItems.length) return t("results.cloneProfile.noFamiliesActivated");
  return detectedItems.slice(0, 3).map((item) => translateCloneName(item.name, t)).join(" • ");
}

function CloneProfile({ items }: { items: CloneItem[] }) {
  const { t } = useTranslation("results");
  const detectedCount = items.filter((item) => item.detected).length;
  const coverage = items.length ? Math.round((detectedCount / items.length) * 100) : 0;
  const sortedItems = [...items].sort((left, right) => {
    const detectedDelta = Number(right.detected) - Number(left.detected);
    if (detectedDelta !== 0) return detectedDelta;
    return (clonePriority[right.name] ?? 0) - (clonePriority[left.name] ?? 0);
  });

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-[14px] leading-[1.5] text-txt-secondary">{summarizeCloneProfile(items, t)}</p>

      <FieldSheet>
        <Field label={t("results.cloneTypes.cloneProfile")}>
          <p className="text-[14px] font-semibold text-txt-primary">{getCloneProfileLabel(items, t)}</p>
          <p className="mt-1 text-[12.5px] leading-normal text-txt-muted">{t("results.cloneTypes.dominantInterpretation")}</p>
        </Field>
        <Field label={t("results.cloneTypes.detectionCoverage")}>
          <div className="flex items-center gap-3">
            <span className="metric-bar-track w-40 max-w-full shrink-0">
              <span className="metric-bar-fill block" style={{ width: `${coverage}%` }} />
            </span>
            <span className="mono-value text-txt-primary" dir="ltr">{coverage}%</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-normal text-txt-muted">
            {t("results.cloneTypes.cloneFamiliesActivated", { detected: detectedCount, total: items.length })}
          </p>
        </Field>
        <Field label={t("results.cloneTypes.strongestSignals")}>
          <p className="text-[14px] text-txt-primary">{getCloneFocus(items, t)}</p>
          <p className="mt-1 text-[12.5px] leading-normal text-txt-muted">{t("results.cloneTypes.meaningfulCategoriesSurfaced")}</p>
        </Field>
      </FieldSheet>

      <div className="divide-y divide-bench-hair border-y border-bench-hair">
        {sortedItems.map((item, index) => {
          const meta = getCloneTypeMeta(item.name, t);
          return (
            <div key={item.name} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4">
              <Serial tone={item.detected ? "primary" : "muted"}>{String(index + 1).padStart(2, "0")}</Serial>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h4 className="text-[14px] font-semibold text-txt-primary">{translateCloneName(item.name, t)}</h4>
                  <span className="label text-txt-muted">{meta.family}</span>
                  <Tag tone={item.detected ? "hot" : "neutral"} className="ms-auto">
                    {item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}
                  </Tag>
                </div>
                <p className="mt-2 text-[12.5px] leading-normal text-txt-secondary">{meta.summary}</p>
                <p className="mt-2 text-[12.5px] leading-normal text-txt-muted">
                  <span className="font-semibold text-txt-secondary">
                    {item.detected ? t("results.cloneTypes.interpretation") : t("results.cloneTypes.reading")}
                  </span>{" "}
                  {item.detected ? meta.detectedMeaning : meta.absentMeaning}
                </p>
                <p className="mt-2 border-s-2 border-bench-strong ps-3 text-[12.5px] leading-normal text-txt-muted">
                  <span className="font-semibold text-txt-secondary">{t("results.cloneTypes.whyItMatters")}:</span> {meta.whyItMatters}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────── */

const Results = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentResult, loadCurrent, loadById, rerunById, clearCurrentResult } = useAnalysis();
  const { localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("results");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);

  const requestedId = searchParams.get("analysisId");
  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: ResultTab = TAB_IDS.includes(tabParam as ResultTab)
    ? (tabParam as ResultTab)
    : SECTION_ALIASES[tabParam] ?? "overview";

  const setActiveTab = useCallback(
    (id: ResultTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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

  /* ---------- derivations (pure, from the loaded result) ---------- */

  const signalRows = useMemo(() => (result ? buildSignalRows(result.similarity_items, t) : []), [result, t]);
  const score = result ? getCombinedScore(result, signalRows) : 0;
  const confidence = useMemo(() => getVerdictConfidence(signalRows, result?.clone_items ?? []), [signalRows, result]);
  const clone = useMemo(() => getCloneVerdict(result?.clone_items ?? []), [result]);
  const headline = useMemo(() => getVerdictHeadline(score, clone, t), [score, clone, t]);

  const diff = useAnalysisDiff(result?.saved_analysis_id ?? null, Boolean(result));
  const diffData = diff.status === "ready" ? diff.data : null;
  const comparison = useMemo(
    () => (result ? buildComparison(result.code1, result.code2, result.language, diffData) : null),
    [result, diffData],
  );
  const whyRows = useMemo(
    () =>
      result
        ? buildWhyRows(
            signalRows,
            result.clone_items,
            confidence,
            comparison && diffData
              ? { matchedA: comparison.matchedA, totalA: comparison.a.length, matchedB: comparison.matchedB, totalB: comparison.b.length }
              : null,
            t,
          )
        : [],
    [result, signalRows, confidence, comparison, diffData, t],
  );

  /* ---------- actions ---------- */

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

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("results.share.copied"));
    } catch {
      toast.error(t("results.share.failed"));
    }
  };

  /* ---------- states ---------- */

  if (isLoading && !result) {
    return <PageLoader />;
  }

  if (!result) {
    const noSavedOrActive = t("results.noSavedOrActive");
    const emptyStateTitle = error && !error.startsWith(noSavedOrActive) ? t("results.unableToLoadTitle") : t("results.emptyTitle");
    const emptyStateDescription = error || t("results.emptyDescription");
    return (
      <div className="flex flex-col items-center gap-4 px-6 pb-16 pt-24 text-center">
        <IconFilePlus className="text-txt-muted" />
        <p className="text-[15px] text-txt-primary">{emptyStateTitle}</p>
        <p className="mono-meta max-w-[60ch] leading-[1.6] text-txt-muted">{emptyStateDescription}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <BenchButton tone="primary" onClick={() => navigate("/analysis")}>
            {t("results.empty.cta")}
          </BenchButton>
          <BenchButton tone="secondary" onClick={() => navigate("/history")}>
            {t("results.openHistory")}
          </BenchButton>
        </div>
      </div>
    );
  }

  const saved = ledgerDateTime(result.summary?.dateCreated);
  const savedLine = result.saved_analysis_id
    ? saved
      ? t("results.savedAt", { time: saved.time })
      : t("results.savedNoTime")
    : t("results.unsaved");
  const languageLabel = getProgrammingLanguageLabel(result.language);
  const labelA = result.source_labels.code1;
  const labelB = result.source_labels.code2;

  const tabs: Array<{ id: ResultTab; label: string }> = [
    { id: "overview", label: t("results.tabs.overview") },
    { id: "diff", label: t("results.tabs.diff") },
    { id: "graphs", label: t("results.tabs.graphs") },
    { id: "metrics", label: t("results.tabs.metrics") },
    { id: "quality", label: t("results.tabs.quality") },
    { id: "report", label: t("results.tabs.report") },
    { id: "chat", label: t("results.tabs.chat") },
  ];

  return (
    <div className="animate-fade-in">
      {/* Case bar — where this reading sits and what can be done with it */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-bench-hair py-[18px]">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-3 text-[12.5px]">
          <Link to="/analysis" className="text-txt-secondary hover:text-txt-primary">
            {t("results.crumbs.compare")}
          </Link>
          <span aria-hidden className="text-txt-faint">/</span>
          <span className="font-semibold text-txt-primary">{t("results.crumbs.verdict")}</span>
          {result.saved_analysis_id != null && (
            <span className="mono-filename text-txt-muted" dir="ltr">
              #{result.saved_analysis_id}
            </span>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-meta text-txt-muted" dir="ltr">
            {savedLine}
          </span>
          <BenchButton tone="secondary" className="h-9" leading={<IconRerun />} onClick={() => void handleRerun()} disabled={isLoading}>
            {t("results.rerun")}
          </BenchButton>
          <BenchButton tone="secondary" className="h-9" leading={<IconShare />} onClick={() => void handleShare()}>
            {t("results.share.button")}
          </BenchButton>
          <BenchButton tone="secondary" className="h-9" leading={<IconDownload />} onClick={() => setPdfOpen(true)}>
            {t("results.export.pdf")}
          </BenchButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center border border-bench-strong text-txt-secondary hover:border-txt-muted hover:text-txt-primary"
                aria-label={t("results.more")}
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-bench-strong bg-bench-raised text-txt-primary">
              <DropdownMenuItem className="cursor-pointer text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => exportAsJson(result)}>
                {t("results.export.json")}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => exportAsText(result, t)}>
                {t("results.export.text")}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => navigate("/analysis")}>
                {t("results.newAnalysis")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-5 border border-signal px-4 py-3 text-[13px] text-signal-bench">
          {error}
        </div>
      )}

      {/* The reading — always above the fold, whichever tab is open */}
      <VerdictBlock score={score} rows={signalRows} headline={headline} confidence={confidence} />

      {/* The evidence, filed. Radix gives role=tab/tablist, aria-selected and
          arrow-key roving focus; the value is mirrored to ?tab= so a refresh or
          a shared link lands on the same file. */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResultTab)}>
        <TabsList className="segment-group h-auto w-full justify-start overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="segment focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview — why the verdict reads as it does, and which checks fired */}
        <TabsContent value="overview" className="mt-8 space-y-10">
          <Panel bare label={t("results.why.label")}>
            <ol>
              {whyRows.map((row, index) => (
                <li
                  key={index}
                  className={cn("flex min-h-14 items-center gap-6 border-t border-bench-hair py-3", index === whyRows.length - 1 && "border-b")}
                >
                  <span className="mono-meta w-12 shrink-0 text-txt-muted" dir="ltr">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tabForEvidence(row.target))}
                    className="min-w-0 flex-1 text-start text-[15px] leading-[1.4] text-txt-primary hover:underline hover:underline-offset-2"
                  >
                    {row.statement}
                  </button>
                  <span className="mono-meta hidden w-[340px] shrink-0 text-end leading-[1.6] text-txt-secondary md:block" dir="ltr">
                    {row.evidence}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel bare label={t("results.checks.label", { count: result.clone_items.length })}>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {result.clone_items.map((item) => (
                <Lamp
                  key={item.name}
                  on={item.detected}
                  label={translateCloneName(item.name, t)}
                  value={item.detected ? t("results.checks.on") : t("results.checks.off")}
                />
              ))}
            </div>
            <details className="mt-6">
              <summary className="label cursor-pointer list-none text-txt-secondary hover:text-txt-primary">{t("results.checks.detail")}</summary>
              <div className="pt-5">
                <CloneProfile items={result.clone_items} />
              </div>
            </details>
          </Panel>

          <Panel label={t("results.sections.radar")}>
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <SimilarityRadar items={result.similarity_items} />
            </ErrorBoundary>
          </Panel>
        </TabsContent>

        {/* Diff — the comparator plates */}
        <TabsContent value="diff" className="mt-8">
          {comparison && (
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <Comparator comparison={comparison} diff={diff} languageLabel={languageLabel} labelA={labelA} labelB={labelB} />
            </ErrorBoundary>
          )}
        </TabsContent>

        {/* Graphs */}
        <TabsContent value="graphs" className="mt-8">
          <div className="grid gap-5 xl:grid-cols-2">
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph1")} color="primary" elements={result.graph_json1} />
            </ErrorBoundary>
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <AstGraphPanel title={t("results.graph2")} color="accent" elements={result.graph_json2} />
            </ErrorBoundary>
          </div>
        </TabsContent>

        {/* Metrics */}
        <TabsContent value="metrics" className="mt-8">
          <Panel label={t("results.metrics.label")}>
            <ErrorBoundary fallback={<PanelErrorFallback />}>
              <MetricsComparison metricsA={result.metrics1} metricsB={result.metrics2} />
            </ErrorBoundary>
          </Panel>
        </TabsContent>

        {/* Quality */}
        <TabsContent value="quality" className="mt-8">
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <QualityPanel result={result} />
          </ErrorBoundary>
        </TabsContent>

        {/* Report — the structured verdict and the analyst's narrative */}
        <TabsContent value="report" className="mt-8 space-y-10">
          {result.analysis_structured && (
            <Panel label={t("results.sections.structured")} bodyClassName="p-0">
              <ErrorBoundary fallback={<PanelErrorFallback />}>
                <StructuredReport data={result.analysis_structured} />
              </ErrorBoundary>
            </Panel>
          )}
          <Panel label={t("results.note.label")}>
            <AnalysisReport html={result.analysis_html} hideLabel />
          </Panel>
        </TabsContent>

        {/* The analyst thread */}
        <TabsContent value="chat" className="mt-8">
          <ErrorBoundary fallback={<PanelErrorFallback />}>
            <GroundedThread analysisId={result.saved_analysis_id} contextLabel={`${labelA} ↔ ${labelB}`} />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>

      {/* Footer strip */}
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-bench-hair pb-2 pt-[18px]">
        <span className="mono-meta leading-[1.6] text-txt-muted" dir="ltr">
          {[
            result.saved_analysis_id != null ? t("results.footer.analysis", { id: result.saved_analysis_id }) : t("results.footer.current"),
            saved ? `${saved.date} ${saved.time}` : null,
            result.language,
            diffData ? t("results.footer.matchRatio", { value: `${diffData.match_ratio.toFixed(1)}%` }) : null,
            t("results.footer.semantic", { model: SEMANTIC_MODEL }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="flex items-center gap-5 text-[12.5px] text-txt-secondary">
          <Link to="/history" className="underline underline-offset-2 hover:text-txt-primary">
            {t("results.footer.openHistory")}
          </Link>
          <button type="button" onClick={() => setActiveTab("chat")} className="underline underline-offset-2 hover:text-txt-primary">
            {t("results.footer.askAnalyst")}
          </button>
        </span>
      </footer>

      <PdfExportDialog open={pdfOpen} onOpenChange={setPdfOpen} result={result} />
    </div>
  );
};

export default Results;
