import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BenchButton, BenchSelect, Reading, Scale, Tag } from "@/components/bench/Bench";
import { CLONE_THRESHOLD, toneForScore } from "@/lib/bands";
import { IconChevronLeft, IconChevronRight, IconDownload, IconFilePlus, IconSearch } from "@/components/bench/icons";
import { apiFetch } from "@/lib/api";
import { downloadText } from "@/lib/download";
import { getBillingSummary, type BillingSummary } from "@/lib/billingApi";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { AnalysisResult, HistoryResponse, HistorySummary } from "@/types/api";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";

/**
 * History (design node 18:601): the archive. Four ruled readings, a filter
 * row, the hairline ledger of every comparison, and pagination.
 */

const PAGE_SIZE = 10;
type Range = "all" | "7d" | "30d" | "90d";
type Verdict = "all" | HistorySummary["severity"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 2026-09-04 14:22 — the ledger's timestamp, locale-independent. */
function ledgerDate(summary: HistorySummary) {
  if (!summary.dateCreated) return summary.dateDisplay;
  const d = new Date(summary.dateCreated);
  if (Number.isNaN(d.getTime())) return summary.dateDisplay;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function csvCell(value: string | number) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const History = () => {
  const navigate = useNavigate();
  const { rerunById, loadById } = useAnalysis();
  const { isAuthenticated } = useAuth();
  const { formatNumber, localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("common");
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [search, setSearch] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [filterVerdict, setFilterVerdict] = useState<Verdict>("all");
  const [filterRange, setFilterRange] = useState<Range>("all");
  const [sortBy, setSortBy] = useState<"date" | "score">("date");
  const [page, setPage] = useState(1);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<HistorySummary | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistorySummary | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadHistory = async () => {
    const result = await apiFetch<HistoryResponse>("/api/history");
    setHistoryData(result);
  };

  useEffect(() => {
    setIsInitialLoad(true);
    void loadHistory()
      .catch((loadError) => {
        setError(loadError instanceof Error ? localizeRuntimeMessage(loadError.message) : t("history.errors.loadHistory"));
      })
      .finally(() => setIsInitialLoad(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    getBillingSummary().then(setBilling).catch(() => undefined);
  }, [isAuthenticated]);

  const items = useMemo(() => historyData?.items ?? [], [historyData]);
  const languages = useMemo(
    () => Array.from(new Set(items.map((item) => item.language).filter(Boolean))),
    [items],
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    const now = Date.now();
    const rangeMs = filterRange === "7d" ? 7 : filterRange === "30d" ? 30 : filterRange === "90d" ? 90 : 0;
    const since = rangeMs ? now - rangeMs * 24 * 60 * 60 * 1000 : 0;
    return [...items]
      .filter((item) => {
        const matchesSearch =
          !normalizedSearch ||
          item.sourceA.toLowerCase().includes(normalizedSearch) ||
          item.sourceB.toLowerCase().includes(normalizedSearch) ||
          item.language.toLowerCase().includes(normalizedSearch) ||
          String(item.id).includes(normalizedSearch) ||
          getProgrammingLanguageLabel(item.language).toLowerCase().includes(normalizedSearch);
        const matchesLanguage = filterLanguage === "all" || item.language === filterLanguage;
        const matchesVerdict = filterVerdict === "all" || item.severity === filterVerdict;
        const created = item.dateCreated ? new Date(item.dateCreated).getTime() : 0;
        const matchesRange = !since || created >= since;
        return matchesSearch && matchesLanguage && matchesVerdict && matchesRange;
      })
      .sort((left, right) => {
        if (sortBy === "score") return right.similarity - left.similarity;
        return (right.dateCreated || "").localeCompare(left.dateCreated || "");
      });
  }, [items, search, filterLanguage, filterVerdict, filterRange, sortBy, getProgrammingLanguageLabel]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeFrom = filteredItems.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeTo = Math.min(currentPage * PAGE_SIZE, filteredItems.length);

  // Any filter change returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [search, filterLanguage, filterVerdict, filterRange, sortBy]);

  const hasFilters = search !== "" || filterLanguage !== "all" || filterVerdict !== "all" || filterRange !== "all";
  const clearFilters = () => {
    setSearch("");
    setFilterLanguage("all");
    setFilterVerdict("all");
    setFilterRange("all");
  };

  /* ---------- readings ---------- */

  const stats = historyData?.stats;
  const earliest = useMemo(() => {
    const dates = items.map((i) => i.dateCreated).filter((d): d is string => Boolean(d)).sort();
    return dates[0] ? dates[0].slice(0, 7) : null;
  }, [items]);
  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return items.filter((i) => {
      if (!i.dateCreated) return false;
      const d = new Date(i.dateCreated);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [items]);
  const medianReading = useMemo(() => median(items.map((i) => i.similarity)), [items]);
  const total = stats?.totalAnalyses ?? 0;
  const flagged = stats?.highSimilarity ?? 0;

  /* ---------- actions ---------- */

  const openPreview = async (summary: HistorySummary) => {
    setError("");
    setIsBusy(true);
    try {
      const detail = await apiFetch<AnalysisResult>(`/api/history/${summary.id}`);
      setSelectedSummary(summary);
      setSelectedAnalysis(detail);
      setIsDialogOpen(true);
    } catch (previewError) {
      setError(previewError instanceof Error ? localizeRuntimeMessage(previewError.message) : t("history.errors.loadPreview"));
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
      setError(rerunError instanceof Error ? localizeRuntimeMessage(rerunError.message) : t("history.errors.rerun"));
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
      setError(viewError instanceof Error ? localizeRuntimeMessage(viewError.message) : t("history.errors.open"));
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
        `${t("history.exportSections.date")}: ${ledgerDate(summary)}`,
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
      setError(exportError instanceof Error ? localizeRuntimeMessage(exportError.message) : t("history.errors.export"));
    } finally {
      setIsBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ["id", "date", "plate_a", "plate_b", "language", "reading", "verdict"];
    const rows = filteredItems.map((item) =>
      [item.id, ledgerDate(item), item.sourceA, item.sourceB, item.language, item.similarity.toFixed(1), item.severity]
        .map(csvCell)
        .join(","),
    );
    downloadText(t("history.csv.filename"), [header.join(","), ...rows].join("\n"));
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
      setError(deleteError instanceof Error ? localizeRuntimeMessage(deleteError.message) : t("history.errors.delete"));
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
              setError(loadError instanceof Error ? localizeRuntimeMessage(loadError.message) : t("history.errors.loadHistory"));
            })
            .finally(() => setIsInitialLoad(false));
        }}
      />
    );
  }

  const verdictLabel = (severity: HistorySummary["severity"]) => t(`history.verdicts.${severity}`);
  const sortHeader = (key: "date" | "score", label: string, className?: string) => (
    <button
      type="button"
      onClick={() => setSortBy(key)}
      className={cn("label flex items-center gap-1.5 text-txt-muted hover:text-txt-primary", sortBy === key && "text-txt-secondary", className)}
      aria-sort={sortBy === key ? "descending" : undefined}
    >
      {label}
      {sortBy === key && <span aria-hidden className="mono-meta-sm">↓</span>}
    </button>
  );

  return (
    <div className="pt-7">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-[22px]">
        <div className="flex flex-col gap-2.5">
          <span className="label text-txt-muted">{t("history.kicker")}</span>
          <h1 className="t-page text-txt-primary">{t("history.title")}</h1>
        </div>
        <BenchButton tone="secondary" leading={<IconDownload />} onClick={exportCsv} disabled={filteredItems.length === 0}>
          {t("history.exportCsv")}
        </BenchButton>
      </header>

      {/* Readings */}
      <div className="grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4">
        <Reading
          className="border-e border-bench-hair pe-4 lg:pe-6"
          label={t("history.readings.total")}
          value={formatNumber(total)}
          note={earliest ? t("history.readings.sinceDate", { date: earliest }) : t("history.readings.allTime")}
        />
        <Reading
          className="ps-4 lg:border-e lg:border-bench-hair lg:px-6"
          label={t("history.readings.thisMonth")}
          value={formatNumber(billing ? billing.used : thisMonthCount)}
          note={
            billing
              ? billing.unlimited
                ? t("history.readings.unlimitedOn", { plan: billing.planName })
                : t("history.readings.remainingOn", { count: billing.remaining ?? Math.max(0, billing.limit - billing.used), plan: billing.planName })
              : t("history.readings.last7", { count: stats?.last7Days ?? 0 })
          }
        />
        <Reading
          className="border-e border-bench-hair border-t pe-4 lg:border-t-0 lg:px-6"
          label={t("history.readings.flagged")}
          value={formatNumber(flagged)}
          note={t("history.readings.pctOf", { pct: total ? Math.round((flagged / total) * 100) : 0 })}
        />
        <Reading
          className="border-t ps-4 lg:border-t-0 lg:ps-6"
          label={t("history.readings.median")}
          value={medianReading == null ? "—" : medianReading.toFixed(1)}
          note={t("history.readings.threshold", { value: CLONE_THRESHOLD.toFixed(1) })}
        />
      </div>

      {error && (
        <div role="alert" className="mt-5 border border-signal px-4 py-3 text-[13px] text-signal-bench">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 pb-4 pt-[52px]">
        <label className="well w-full sm:w-[300px]">
          <IconSearch className="text-txt-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("history.filters.search")}
            aria-label={t("history.filters.search")}
          />
        </label>
        <BenchSelect
          label={t("history.filters.language")}
          value={filterLanguage}
          onChange={setFilterLanguage}
          options={[{ value: "all", label: t("history.filters.all") }, ...languages.map((lang) => ({ value: lang, label: getProgrammingLanguageLabel(lang) }))]}
        />
        <BenchSelect
          label={t("history.filters.verdict")}
          value={filterVerdict}
          onChange={(v) => setFilterVerdict(v as Verdict)}
          options={[
            { value: "all", label: t("history.filters.all") },
            { value: "high", label: t("history.verdicts.high") },
            { value: "moderate", label: t("history.verdicts.moderate") },
            { value: "low", label: t("history.verdicts.low") },
          ]}
        />
        <BenchSelect
          label={t("history.filters.range")}
          value={filterRange}
          onChange={(v) => setFilterRange(v as Range)}
          options={[
            { value: "all", label: t("history.filters.ranges.all") },
            { value: "7d", label: t("history.filters.ranges.7d") },
            { value: "30d", label: t("history.filters.ranges.30d") },
            { value: "90d", label: t("history.filters.ranges.90d") },
          ]}
        />
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-[12.5px] text-txt-secondary underline underline-offset-2 hover:text-txt-primary">
            {t("history.filters.clear")}
          </button>
        )}
        <span className="ms-auto text-[12.5px] text-txt-secondary">{t("history.filters.results", { count: filteredItems.length })}</span>
      </div>

      {/* Ledger */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border-y border-bench-hair px-6 py-20 text-center">
          <IconFilePlus className="text-txt-muted" />
          <p className="text-[15px] text-txt-primary">{t("history.noAnalysesFound")}</p>
          <p className="mono-meta text-txt-muted">{items.length === 0 ? t("history.noAnalysesYet") : t("history.adjustFilters")}</p>
          <BenchButton tone="primary" className="mt-2" onClick={() => navigate("/analysis")}>
            {t("buttons.newAnalysis")}
          </BenchButton>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1040px] border-collapse px-2">
            <thead>
              <tr className="h-9 border-b border-bench-hair text-start">
                <th className="label w-14 ps-2 text-start font-semibold text-txt-muted">{t("history.columns.id")}</th>
                <th className="w-[150px] ps-3 text-start">{sortHeader("date", t("history.columns.date"))}</th>
                <th className="label ps-3 text-start font-semibold text-txt-muted">{t("history.columns.plateA")}</th>
                <th className="label ps-3 text-start font-semibold text-txt-muted">{t("history.columns.plateB")}</th>
                <th className="label w-24 ps-3 text-start font-semibold text-txt-muted">{t("history.columns.lang")}</th>
                <th className="w-[200px] ps-3 text-start">{sortHeader("score", t("history.columns.reading"))}</th>
                <th className="label w-[168px] ps-3 text-start font-semibold text-txt-muted">{t("history.columns.verdict")}</th>
                <th className="w-[132px] pe-2">
                  <span className="sr-only">{t("history.table.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => {
                const score = item.similarity;
                return (
                  <tr key={item.id} className="h-[46px] border-t border-bench-hair first:border-t-0 hover:bg-bench-raised/60">
                    <td className="ps-2 align-middle">
                      <span className="mono-filename text-txt-muted" dir="ltr">{item.id}</span>
                    </td>
                    <td className="ps-3 align-middle">
                      <span className="mono-filename whitespace-nowrap text-txt-secondary" dir="ltr">{ledgerDate(item)}</span>
                    </td>
                    <td className="max-w-[240px] ps-3 align-middle">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="label-tag text-[9.5px] text-txt-muted">A</span>
                        <span className="mono-filename truncate text-txt-primary" dir="auto">{item.sourceA}</span>
                      </span>
                    </td>
                    <td className="max-w-[240px] ps-3 align-middle">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="label-tag text-[9.5px] text-txt-muted">B</span>
                        <span className="mono-filename truncate text-txt-primary" dir="auto">{item.sourceB}</span>
                      </span>
                    </td>
                    <td className="ps-3 align-middle">
                      <span className="text-[12.5px] text-txt-secondary" dir="ltr">{item.language}</span>
                    </td>
                    <td className="ps-3 align-middle">
                      <span className="flex items-center gap-3">
                        <Scale value={score} quiet={score < 50} className="w-[110px]" />
                        <span className="mono-value text-txt-primary" dir="ltr">{score.toFixed(1)}</span>
                        <span className="sr-only">{t("history.table.score")}: {score.toFixed(1)} / 100</span>
                      </span>
                    </td>
                    <td className="ps-3 align-middle">
                      <Tag tone={toneForScore(score)}>{verdictLabel(item.severity)}</Tag>
                    </td>
                    <td className="pe-2 align-middle">
                      <span className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => void openInResults(item)}
                          disabled={isBusy}
                          className="text-[12.5px] text-txt-primary underline underline-offset-2 hover:text-signal-bench disabled:opacity-50"
                        >
                          {t("history.actions.open")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void rerunAnalysis(item)}
                          disabled={isBusy}
                          className="text-[12.5px] text-txt-secondary underline underline-offset-2 hover:text-txt-primary disabled:opacity-50"
                        >
                          {t("history.actions.rerun")}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center text-txt-muted hover:text-txt-primary"
                              aria-label={t("history.table.actions")}
                              disabled={isBusy}
                            >
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 border-bench-strong bg-bench-raised text-txt-primary">
                            <DropdownMenuItem className="cursor-pointer text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => void openPreview(item)}>
                              {t("history.actions.preview")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => void exportAnalysis(item)}>
                              {t("history.actions.export")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-[13px] text-signal-bench focus:bg-bench-hair focus:text-signal-bench" onSelect={() => confirmDelete(item)}>
                              {t("history.actions.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredItems.length > 0 && (
        <div className="flex h-12 items-center justify-between border-t border-bench-hair">
          <span className="mono-filename text-txt-secondary" dir="ltr">
            {t("history.pagination.range", { from: rangeFrom, to: rangeTo, total: filteredItems.length })}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex h-8 w-8 items-center justify-center border border-bench-strong text-txt-primary hover:border-txt-muted disabled:opacity-40"
              aria-label={t("history.pagination.previous")}
            >
              <IconChevronLeft className="rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="flex h-8 w-8 items-center justify-center border border-bench-strong text-txt-primary hover:border-txt-muted disabled:opacity-40"
              aria-label={t("history.pagination.next")}
            >
              <IconChevronRight className="rtl:-scale-x-100" />
            </button>
          </span>
        </div>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md border-bench-strong bg-bench-raised text-txt-primary">
          <DialogHeader>
            <DialogTitle className="t-h4">{t("history.deleteTitle")}</DialogTitle>
            <DialogDescription className="text-[13px] text-txt-secondary">
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
        <DialogContent className="max-w-5xl border-bench-strong bg-bench-raised p-0 text-txt-primary">
          <DialogHeader className="border-b border-bench-hair px-6 py-5">
            <DialogTitle className="t-h4">{t("history.previewTitle", { id: String(selectedSummary?.id ?? "") })}</DialogTitle>
            <DialogDescription className="mono-meta text-txt-muted" dir="auto">
              {selectedSummary?.sourceA} ↔ {selectedSummary?.sourceB}
            </DialogDescription>
          </DialogHeader>

          {selectedAnalysis ? (
            <div className="space-y-5 p-6">
              <div className="grid gap-5 lg:grid-cols-2">
                {([["A", selectedAnalysis.code1], ["B", selectedAnalysis.code2]] as const).map(([plate, code]) => (
                  <div key={plate} className="plate">
                    <div className="plate-strip">
                      <span className="label text-plate-ink">{t(`history.columns.plate${plate}`)}</span>
                    </div>
                    <pre className="plate-code m-0 max-h-72 overflow-auto whitespace-pre-wrap p-4 scrollbar-thin" dir="ltr">
                      {code}
                    </pre>
                  </div>
                ))}
              </div>

              <div
                className="analysis-markdown max-h-72 overflow-auto border border-bench-hair px-5 py-4 scrollbar-thin"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedAnalysis.analysis_html ?? "") }}
              />

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("buttons.close")}
                </Button>
                <Button onClick={() => void openInResults(selectedSummary!)}>{t("history.openFullResults")}</Button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-txt-secondary">{t("history.loadingPreview")}</div>
          )}
        </DialogContent>
      </Dialog>

      <p className="sr-only">
        <Link to="/analysis">{t("buttons.newAnalysis")}</Link>
      </p>
    </div>
  );
};

export default History;
