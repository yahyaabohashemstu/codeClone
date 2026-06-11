import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Download,
  ExternalLink,
  Filter,
  GitCompare,
  History as HistoryIcon,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  if (severity === "high") return "bg-destructive/15 text-destructive border-destructive/30";
  if (severity === "moderate") return "bg-warning/15 text-warning border-warning/30";
  return "bg-success/15 text-success border-success/30";
}

function scoreColor(score: number): string {
  if (score >= 75) return "hsl(var(--destructive))";
  if (score >= 50) return "hsl(14 85% 38%)";
  if (score >= 25) return "hsl(var(--warning))";
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
      {/* Hero header card */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-56 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.28), transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <HistoryIcon className="h-3 w-3" />
              {t("history.eyebrow", { defaultValue: "Recent analyses" })}
            </div>
            <h1 className="mt-3 h-2">{t("history.pageTitle")}</h1>
            <p className="mt-1 max-w-[60ch] t-body">{t("history.pageDescription")}</p>
          </div>
          <Button
            asChild
            size="lg"
            className="h-11 shrink-0 gap-2 px-5 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            <Link to="/analysis">
              <Plus className="h-4 w-4" />
              {t("buttons.newAnalysis")}
            </Link>
          </Button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: t("history.stats.totalAnalyses"), value: historyData?.stats.totalAnalyses ?? 0, icon: BarChart3, color: "text-muted-foreground/70" },
          { label: t("history.stats.highSimilarity"), value: historyData?.stats.highSimilarity ?? 0, icon: AlertTriangle, color: "text-destructive" },
          { label: t("history.stats.languagesUsed"), value: historyData?.stats.languagesUsed ?? 0, icon: GitCompare, color: "text-primary" },
          { label: t("history.stats.last7Days"), value: historyData?.stats.last7Days ?? 0, icon: Clock, color: "text-accent" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5"
              style={{ boxShadow: "var(--card-shadow-rest)" }}
            >
              <div className="flex items-center justify-between">
                <span className="t-label">{stat.label}</span>
                <Icon className={cn("h-4 w-4", stat.color)} />
              </div>
              <div
                className="mt-3 text-3xl font-bold tracking-tight text-foreground"
                style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)" }}
              >
                {formatNumber(stat.value)}
              </div>
            </div>
          );
        })}
      </section>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3"
        style={{ background: "hsl(var(--surface-2))", boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="relative min-w-48 flex-1">
          <Search className={cn("pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("history.searchPlaceholder")}
            className={cn(
              "h-9 w-full rounded-lg border border-border bg-card py-2 pr-4 text-sm placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20",
              isRTL ? "pl-4 pr-9 text-right" : "pl-9",
            )}
          />
        </div>

        <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={filterLanguage}
            onChange={(event) => setFilterLanguage(event.target.value)}
            className="h-9 bg-transparent text-sm text-foreground focus:outline-none"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang} className="bg-card">
                {lang === "all" ? t("history.allLanguages") : getProgrammingLanguageLabel(lang)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3">
          <select
            value={filterSeverity}
            onChange={(event) => setFilterSeverity(event.target.value)}
            className="h-9 bg-transparent text-sm text-foreground focus:outline-none"
          >
            <option value="all" className="bg-card">{t("history.allSeverity")}</option>
            <option value="high" className="bg-card">{t("history.highSimilarity")}</option>
            <option value="moderate" className="bg-card">{t("history.moderateSimilarity")}</option>
            <option value="low" className="bg-card">{t("history.lowSimilarity")}</option>
          </select>
        </div>

        <div className="flex h-9 gap-0.5 rounded-lg border border-border bg-card p-1">
          {(["date", "score"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortBy(mode)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all",
                sortBy === mode
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={sortBy === mode ? { background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" } : undefined}
            >
              {mode === "date" ? t("history.byDate") : t("history.byScore")}
            </button>
          ))}
        </div>

        <span
          className="text-xs tabular-nums text-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
        >
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
        <div
          className="overflow-hidden rounded-2xl border border-border bg-card"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--surface-2))" }}>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.sourceA")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.sourceB")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.language")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.score")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.severity")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("history.table.date")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-left" : "text-right")}>
                    {t("history.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const score = item.similarity;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="max-w-[200px] px-4 py-3 align-middle">
                        <span className="truncate font-mono text-xs text-foreground">{item.sourceA}</span>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 align-middle">
                        <span className="truncate font-mono text-xs text-foreground">{item.sourceB}</span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            fontFamily: "var(--font-mono)",
                            background: "hsl(var(--primary) / 0.1)",
                            color: "hsl(var(--primary))",
                            borderColor: "hsl(var(--primary) / 0.25)",
                          }}
                        >
                          {getProgrammingLanguageLabel(item.language)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-14 overflow-hidden rounded-full"
                            style={{ background: "hsl(var(--muted))" }}
                          >
                            <span
                              className="block h-full"
                              style={{ width: `${score}%`, background: scoreColor(score) }}
                            />
                          </span>
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ fontFamily: "var(--font-mono)", color: scoreColor(score) }}
                          >
                            {score.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                            severityBadge(item.severity),
                          )}
                        >
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
                            aria-label="View details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void openInResults(item)}
                            disabled={isBusy}
                            aria-label="Open results"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void rerunAnalysis(item)}
                            disabled={isBusy}
                            aria-label="Rerun analysis"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => void exportAnalysis(item)}
                            disabled={isBusy}
                            aria-label="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => confirmDelete(item)}
                            disabled={isBusy}
                            aria-label="Delete"
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
                <div
                  className="overflow-hidden rounded-xl border border-border bg-card"
                  style={{ boxShadow: "var(--card-shadow-rest)" }}
                >
                  <div
                    className="border-b border-border px-4 py-2.5 t-label text-foreground"
                    style={{ background: "hsl(var(--surface-2))" }}
                  >
                    {t("history.table.sourceA")}
                  </div>
                  <pre className="code-surface m-4 max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs scrollbar-thin">
                    {selectedAnalysis.code1}
                  </pre>
                </div>
                <div
                  className="overflow-hidden rounded-xl border border-border bg-card"
                  style={{ boxShadow: "var(--card-shadow-rest)" }}
                >
                  <div
                    className="border-b border-border px-4 py-2.5 t-label text-foreground"
                    style={{ background: "hsl(var(--surface-2))" }}
                  >
                    {t("history.table.sourceB")}
                  </div>
                  <pre className="code-surface m-4 max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs scrollbar-thin">
                    {selectedAnalysis.code2}
                  </pre>
                </div>
              </div>

              <div
                className="analysis-markdown max-h-72 overflow-auto rounded-xl border border-border bg-card px-5 py-4 scrollbar-thin"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedAnalysis.analysis_html ?? "") }}
              />

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("buttons.close")}
                </Button>
                <Button
                  onClick={() => void openInResults(selectedSummary!)}
                  className="text-white"
                  style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
                >
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
