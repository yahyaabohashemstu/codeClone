import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Download,
  ExternalLink,
  Info,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Masthead,
  Serial,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
  ScoreMeter,
  StatusTag,
  Tag,
  DocFrame,
  RailReadings,
} from "@/components/dossier/Dossier";
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

// Severity → shared StatusTag tone (colour encodes state only).
function severityTone(severity: HistorySummary["severity"]): "danger" | "warning" | "success" {
  if (severity === "high") return "danger";
  if (severity === "moderate") return "warning";
  return "success";
}

const History = () => {
  const navigate = useNavigate();
  const { rerunById, loadById } = useAnalysis();
  const { formatNumber, formatDate, localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
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
        kicker={t("history.eyebrow", { defaultValue: "Past analyses" })}
        title={t("history.pageTitle")}
        description={t("history.pageDescription")}
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

      {/* Document layout — the register readings sit in the margin rail, the
          filters + ruled ledger form the main column (asymmetric, not a stack). */}
      <DocFrame
        // The rail + gap-x-10 are charged to the main column, and the register is
        // an 8-track ledger. RailReadings only needs room for a mono label and a
        // tabular value, so this page runs a 12rem rail (vs the 14rem default) and
        // hands the reclaimed 2rem back to the ledger's source-path tracks.
        railWidth="12rem"
        rail={
          <RailReadings
            label={t("history.stats.registerLabel", { defaultValue: "Register" })}
            items={[
              { label: t("history.stats.totalAnalyses"), value: formatNumber(historyData?.stats.totalAnalyses ?? 0) },
              { label: t("history.stats.highSimilarity"), value: formatNumber(historyData?.stats.highSimilarity ?? 0), tone: "danger" },
              { label: t("history.stats.languagesUsed"), value: formatNumber(historyData?.stats.languagesUsed ?? 0) },
              { label: t("history.stats.last7Days"), value: formatNumber(historyData?.stats.last7Days ?? 0) },
            ]}
          />
        }
      >
        {/* filter strip */}
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("history.searchPlaceholder")}
            aria-label={t("history.searchPlaceholder")}
            className="h-9 w-full rounded-sm border border-border bg-card ps-9 pe-3 py-2 text-start font-mono text-xs placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex h-9 items-center gap-2 rounded-sm border border-border bg-card px-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">{t("history.table.language")}</span>
          <select
            value={filterLanguage}
            onChange={(event) => setFilterLanguage(event.target.value)}
            aria-label={t("history.table.language", { defaultValue: "Language" })}
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
            aria-label={t("history.table.severity", { defaultValue: "Severity" })}
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
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "date" ? t("history.byDate") : t("history.byScore")}
            </button>
          ))}
        </div>
      </div>

      {/* Exhibit ledger — one ruled register; Serial flags flagged rows, ScoreMeter carries the band.
          The template is budgeted for the *narrowed* main column (page width − 12rem rail − 2.5rem
          gap). The two source tracks carry a 7rem floor so they degrade to truncation instead of
          collapsing to zero, and every fixed track is trimmed to its real content width:
          #=Serial, lang=one Tag, score=meter+3-char readout, severity=one StatusTag,
          date=2 mono lines, actions=5 × 32px icon buttons + gap-1. Head and rows share this one
          string via LedgerCtx, so they cannot drift. */}
      <Ledger columns="2.5rem minmax(7rem,1fr) minmax(7rem,1fr) 5.5rem 7rem 4.75rem 6.5rem 11rem">
        <LedgerHead
          cells={[
            "#",
            t("history.table.sourceA"),
            t("history.table.sourceB"),
            t("history.table.language"),
            t("history.table.score"),
            t("history.table.severity"),
            t("history.table.date"),
            t("history.table.actions"),
          ]}
          aligns={["start", "start", "start", "start", "start", "start", "start", "end"]}
        />
        {filteredItems.length === 0 ? (
          <LedgerEmpty>{items.length === 0 ? t("history.noAnalysesYet") : t("history.adjustFilters")}</LedgerEmpty>
        ) : (
          filteredItems.map((item, index) => {
            const flagged = item.severity === "high" || item.similarity >= 80;
            return (
              <LedgerRow key={item.id}>
                <LedgerCell>
                  <Serial tone={flagged ? "primary" : "muted"}>{formatNumber(index + 1)}</Serial>
                </LedgerCell>
                <LedgerCell>
                  <span className="block truncate font-mono text-xs text-foreground">{item.sourceA}</span>
                </LedgerCell>
                <LedgerCell>
                  <span className="block truncate font-mono text-xs text-foreground">{item.sourceB}</span>
                </LedgerCell>
                <LedgerCell>
                  <Tag tone="neutral">{getProgrammingLanguageLabel(item.language)}</Tag>
                </LedgerCell>
                <LedgerCell>
                  <ScoreMeter value={item.similarity} />
                </LedgerCell>
                <LedgerCell>
                  <StatusTag tone={severityTone(item.severity)}>{severityLabel(item.severity)}</StatusTag>
                </LedgerCell>
                <LedgerCell mono className="text-xs text-muted-foreground">
                  {getDisplayDate(item)}
                </LedgerCell>
                <LedgerCell align="end">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => void openPreview(item)}
                      disabled={isBusy}
                      aria-label={t("history.actions.viewDetails")}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => void openInResults(item)}
                      disabled={isBusy}
                      aria-label={t("history.actions.openResults")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => void rerunAnalysis(item)}
                      disabled={isBusy}
                      aria-label={t("history.actions.rerun")}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => void exportAnalysis(item)}
                      disabled={isBusy}
                      aria-label={t("history.actions.download")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => confirmDelete(item)}
                      disabled={isBusy}
                      aria-label={t("history.actions.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </LedgerCell>
              </LedgerRow>
            );
          })
        )}
        <LedgerFooter
          left={t("history.showing", { defaultValue: "Showing" })}
          right={`${formatNumber(filteredItems.length)} / ${formatNumber(items.length)}`}
        />
        </Ledger>
      </DocFrame>

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
