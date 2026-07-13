import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Download,
  ExternalLink,
  Filter,
  History as HistoryIcon,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Masthead, Serial } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { downloadText } from "@/lib/download";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTranslation } from "react-i18next";
import type { AnalysisResult, HistoryResponse, HistorySummary } from "@/types/api";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { EmptyState } from "@/components/common/EmptyState";

function severityBadge(severity: HistorySummary["severity"]) {
  if (severity === "high") return "badge-error";
  if (severity === "moderate") return "badge-warning";
  return "badge-success";
}

// The calibrated similarity scale (DESIGN §2): green <50 / amber 50–79 / red ≥80.
// Used for the score BAR fill; the number itself stays neutral ink so small
// amber text never falls below AA on paper.
function scoreColor(score: number): string {
  if (score >= 80) return "hsl(var(--destructive))";
  if (score >= 50) return "hsl(var(--warning))";
  return "hsl(var(--success))";
}

const History = () => {
  const navigate = useNavigate();
  const { rerunById, loadById } = useAnalysis();
  const { isRTL, formatNumber, formatDate, localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("common");
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<HistorySummary | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistorySummary | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const severityLabel = (severity: HistorySummary["severity"]) =>
    t(`severity.${severity}`);

  const getDisplayDate = (summary: HistorySummary) =>
    summary.dateCreated
      ? formatDate(summary.dateCreated, { dateStyle: "medium", timeStyle: "short" })
      : summary.dateDisplay;

  const loadHistory = async () => {
    const result = await apiFetch<HistoryResponse>("/api/history");
    setHistoryData(result);
  };

  useEffect(() => {
    setIsInitialLoad(true);
    void loadHistory()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? localizeRuntimeMessage(loadError.message)
            : t("history.errors.loadHistory"),
        );
      })
      .finally(() => setIsInitialLoad(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = historyData?.items ?? [];
  const languages = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.language).filter(Boolean)))],
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return [...items]
      .filter((item) => {
        const matchesSearch =
          !normalizedSearch ||
          item.sourceA.toLowerCase().includes(normalizedSearch) ||
          item.sourceB.toLowerCase().includes(normalizedSearch) ||
          item.language.toLowerCase().includes(normalizedSearch) ||
          getProgrammingLanguageLabel(item.language).toLowerCase().includes(normalizedSearch);
        const matchesLanguage = filterLanguage === "all" || item.language === filterLanguage;
        const matchesSeverity = filterSeverity === "all" || item.severity === filterSeverity;
        return matchesSearch && matchesLanguage && matchesSeverity;
      })
      .sort((left, right) => {
        if (sortBy === "score") {
          return right.similarity - left.similarity;
        }
        return (right.dateCreated || "").localeCompare(left.dateCreated || "");
      });
  }, [items, search, filterLanguage, filterSeverity, sortBy, getProgrammingLanguageLabel]);

  const openPreview = async (summary: HistorySummary) => {
    setError("");
    setIsBusy(true);
    try {
      const detail = await apiFetch<AnalysisResult>(`/api/history/${summary.id}`);
      setSelectedSummary(summary);
      setSelectedAnalysis(detail);
      setIsDialogOpen(true);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? localizeRuntimeMessage(previewError.message)
          : t("history.errors.loadPreview"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const rerunAnalysis = async (summary: HistorySummary) => {
    setIsBusy(true);
    try {
      await rerunById(summary.id);
      navigate(`/results?analysisId=${summary.id}`);
    } catch (rerunError) {
      setError(
        rerunError instanceof Error
          ? localizeRuntimeMessage(rerunError.message)
          : t("history.errors.rerun"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openInResults = async (summary: HistorySummary) => {
    setIsBusy(true);
    try {
      await loadById(summary.id);
      navigate(`/results?analysisId=${summary.id}`);
    } catch (viewError) {
      setError(
        viewError instanceof Error
          ? localizeRuntimeMessage(viewError.message)
          : t("history.errors.open"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const exportAnalysis = async (summary: HistorySummary) => {
    setIsBusy(true);
    try {
      const detail = await apiFetch<AnalysisResult>(`/api/history/${summary.id}`);
      const payload = [
        `${t("history.exportSections.analysisId")}: ${summary.id}`,
        `${t("history.exportSections.language")}: ${summary.language}`,
        `${t("history.exportSections.similarity")}: ${summary.similarity}%`,
        `${t("history.exportSections.date")}: ${getDisplayDate(summary)}`,
        "",
        t("history.exportSections.sourceA"),
        detail.code1,
        "",
        t("history.exportSections.sourceB"),
        detail.code2,
        "",
        t("history.exportSections.interCodeAnalysis"),
        detail.analysis_text,
      ].join("\n");
      downloadText(`analysis-${summary.id}.txt`, payload);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? localizeRuntimeMessage(exportError.message)
          : t("history.errors.export"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const confirmDelete = (summary: HistorySummary) => {
    setDeleteTarget(summary);
    setIsDeleteDialogOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleteDialogOpen(false);
    setIsBusy(true);
    try {
      await apiFetch<{ success: boolean }>(`/api/history/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadHistory();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? localizeRuntimeMessage(deleteError.message)
          : t("history.errors.delete"),
      );
    } finally {
      setIsBusy(false);
    }
  };

  /* ---------- early-return states ---------- */

  if (isInitialLoad && !historyData) {
    return <PageLoader />;
  }

  if (error && !historyData) {
    return (
      <PageError
        message={error}
        onRetry={() => {
          setError("");
          setIsInitialLoad(true);
          void loadHistory()
            .catch((loadError) => {
              setError(
                loadError instanceof Error
                  ? localizeRuntimeMessage(loadError.message)
                  : t("history.errors.loadHistory"),
              );
            })
            .finally(() => setIsInitialLoad(false));
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Case-register masthead — stats fold into the live mono meta strip */}
      <Masthead
        kicker={t("history.eyebrow", { defaultValue: "Case register" })}
        title={t("history.pageTitle")}
        description={t("history.pageDescription")}
        meta={[
          { label: t("history.stats.totalAnalyses"), value: formatNumber(historyData?.stats.totalAnalyses ?? 0) },
          {
            label: t("history.stats.highSimilarity"),
            value: <span className="text-destructive">{formatNumber(historyData?.stats.highSimilarity ?? 0)}</span>,
          },
          { label: t("history.stats.languagesUsed"), value: formatNumber(historyData?.stats.languagesUsed ?? 0) },
          { label: t("history.stats.last7Days"), value: formatNumber(historyData?.stats.last7Days ?? 0) },
        ]}
        actions={
          <Button asChild size="lg" className="h-11 shrink-0 gap-2 px-5">
            <Link to="/analysis">
              <Plus className="h-4 w-4" />
              {t("buttons.newAnalysis")}
            </Link>
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Register controls — a compact mono filter strip, ruled not boxed */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
        <div className="relative min-w-48 flex-1">
          <Search className={cn("pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("history.searchPlaceholder")}
            className={cn(
              "h-9 w-full rounded-sm border border-border bg-card py-2 font-mono text-xs placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20",
              isRTL ? "pl-3 pr-9 text-right" : "pl-9 pr-3",
            )}
          />
        </div>

        <div className="flex h-9 items-center gap-2 rounded-sm border border-border bg-card px-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={filterLanguage}
            onChange={(event) => setFilterLanguage(event.target.value)}
            className="h-9 bg-transparent font-mono text-xs text-foreground focus:outline-none"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang} className="bg-card">
                {lang === "all" ? t("history.allLanguages") : getProgrammingLanguageLabel(lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex h-9 items-center rounded-sm border border-border bg-card px-3">
          <select
            value={filterSeverity}
            onChange={(event) => setFilterSeverity(event.target.value)}
            className="h-9 bg-transparent font-mono text-xs text-foreground focus:outline-none"
          >
            <option value="all" className="bg-card">{t("history.allSeverity")}</option>
            <option value="high" className="bg-card">{t("history.highSimilarity")}</option>
            <option value="moderate" className="bg-card">{t("history.moderateSimilarity")}</option>
            <option value="low" className="bg-card">{t("history.lowSimilarity")}</option>
          </select>
        </div>

        <div className="flex h-9 rounded-sm border border-border bg-card">
          {(["date", "score"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortBy(mode)}
              className={cn(
                "border-e border-border px-3 font-mono text-[11px] uppercase tracking-wide transition-colors last:border-e-0",
                sortBy === mode
                  ? "bg-primary/10 font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "date" ? t("history.byDate") : t("history.byScore")}
            </button>
          ))}
        </div>

        <span className={cn("font-mono text-xs tabular-nums text-muted-foreground", isRTL ? "mr-1" : "ml-1")}>
          {formatNumber(filteredItems.length)} / {formatNumber(items.length)}
        </span>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={t("history.noAnalysesFound")}
          description={items.length === 0 ? t("history.noAnalysesYet") : t("history.adjustFilters")}
          actionLabel={t("buttons.runAnalysis")}
          onAction={() => navigate("/analysis")}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr>
                  <th className={cn("w-12 border-b-2 border-foreground px-4 py-2.5 font-mono text-[11px] font-semibold text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    #
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.sourceA")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.sourceB")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.language")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.score")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.severity")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.date")}
                  </th>
                  <th className={cn("border-b-2 border-foreground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-left" : "text-right")}>
                    {t("history.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => {
                  const score = item.similarity;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 align-middle">
                        <Serial>{formatNumber(index + 1)}</Serial>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 align-middle">
                        <span className="truncate font-mono text-xs text-foreground">{item.sourceA}</span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 align-middle">
                        <span className="truncate font-mono text-xs text-foreground">{item.sourceB}</span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-flex items-center rounded-sm border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                          {getProgrammingLanguageLabel(item.language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-14 overflow-hidden rounded-sm"
                            style={{ background: "hsl(var(--muted))" }}
                          >
                            <span
                              className="block h-full"
                              style={{ width: `${score}%`, background: scoreColor(score) }}
                            />
                          </span>
                          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                            {score.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className={cn(severityBadge(item.severity), "capitalize")}>
                          {severityLabel(item.severity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                        {getDisplayDate(item)}
                      </td>
                      <td className="px-4 py-3">
                        <div className={cn("flex items-center gap-1", isRTL ? "justify-start" : "justify-end")}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void openPreview(item)}
                            disabled={isBusy}
                            aria-label={t("buttons.viewDetails")}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void openInResults(item)}
                            disabled={isBusy}
                            aria-label={t("buttons.viewResults")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void rerunAnalysis(item)}
                            disabled={isBusy}
                            aria-label={t("buttons.rerun")}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void exportAnalysis(item)}
                            disabled={isBusy}
                            aria-label={t("buttons.download")}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => confirmDelete(item)}
                            disabled={isBusy}
                            aria-label={t("buttons.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>{t("history.deleteTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("history.deleteDescription", { id: String(deleteTarget?.id ?? "") })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t("buttons.cancel")}</Button>
            <Button variant="destructive" onClick={() => void executeDelete()}>{t("buttons.delete")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl border-border bg-card p-0 text-foreground">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-lg font-semibold">
              {t("history.previewTitle", { id: String(selectedSummary?.id ?? "") })}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selectedSummary?.sourceA} ↔ {selectedSummary?.sourceB}
            </DialogDescription>
          </DialogHeader>

          {selectedAnalysis ? (
            <div className="space-y-5 p-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="border-b border-border bg-muted px-4 py-2.5 t-label text-foreground">
                    {t("history.table.sourceA")}
                  </div>
                  <pre className="code-surface m-4 max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs scrollbar-thin">
                    {selectedAnalysis.code1}
                  </pre>
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="border-b border-border bg-muted px-4 py-2.5 t-label text-foreground">
                    {t("history.table.sourceB")}
                  </div>
                  <pre className="code-surface m-4 max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs scrollbar-thin">
                    {selectedAnalysis.code2}
                  </pre>
                </div>
              </div>

              <div
                className="analysis-markdown max-h-72 overflow-auto rounded-lg border border-border bg-card px-5 py-4 scrollbar-thin"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedAnalysis.analysis_html ?? "") }}
              />

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("buttons.close")}
                </Button>
                <Button onClick={() => void openInResults(selectedSummary!)}>
                  {t("history.openFullResults")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">{t("history.loadingPreview")}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default History;
