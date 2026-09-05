import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Masthead, Panel, PlatePair, SpecList } from "@/components/dossier/Dossier";
import { BenchSelect, Reading, Scale, Tag, type TagTone } from "@/components/bench/Bench";
import { IconChevronRight, IconFilePlus, IconSearch } from "@/components/bench/icons";
import { PageError } from "@/components/common/PageError";
import { PageLoader } from "@/components/common/PageLoader";
import { useLanguage } from "@/context/LanguageContext";
import { listWorkspaces, listCases } from "@/lib/enterpriseApi";
import type { EnterpriseCase, CaseStatus, EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

/** Dispositions take the three tag tones: a confirmed clone is hot, a case still open is advisory. */
const STATUS_TONE: Record<CaseStatus, TagTone> = {
  open: "advisory",
  in_review: "advisory",
  confirmed_clone: "hot",
  false_positive: "neutral",
  dismissed: "neutral",
  resolved: "neutral",
};

const SEVERITY_TONE: Record<string, TagTone> = {
  critical: "hot",
  high: "hot",
  medium: "advisory",
  low: "neutral",
};

const ALL_STATUSES: Array<CaseStatus | "all"> = [
  "all", "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

// The six real dispositions, in reading order (excludes the "all" filter token).
const DOCKET_STATUSES: CaseStatus[] = [
  "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

const TH = "label text-start font-semibold text-txt-muted";

export default function ReviewCases() {
  const { isRTL } = useLanguage();
  const { t } = useTranslation("enterprise");

  const [workspaces, setWorkspaces] = useState<EnterpriseWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>("all");
  const [cases, setCases] = useState<EnterpriseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Load workspaces first, then cases
  useEffect(() => {
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const wsIds =
      selectedWs === "all"
        ? workspaces.map((w) => w.id)
        : [Number(selectedWs)];

    if (wsIds.length === 0) {
      setCases([]);
      setLoading(false);
      return;
    }

    const statusArg = statusFilter === "all" ? undefined : statusFilter;

    Promise.all(wsIds.map((id) => listCases(id, statusArg)))
      .then((results) => setCases(results.flat()))
      .catch((e) => {
        setError(e?.message ?? t("enterprise.cases.errorMsg"));
        toast.error(t("enterprise.cases.errorMsg"), { description: e?.message });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWs, statusFilter, workspaces, t]);

  const filtered = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const pathA = c.match?.artifactA?.logicalPath?.toLowerCase() ?? "";
    const pathB = c.match?.artifactB?.logicalPath?.toLowerCase() ?? "";
    return pathA.includes(q) || pathB.includes(q) || String(c.id).includes(q);
  });

  const confirmedCount = useMemo(
    () => cases.filter((c) => c.status === "confirmed_clone").length,
    [cases],
  );
  const scopeLabel =
    selectedWs === "all"
      ? t("enterprise.cases.allWorkspaces")
      : workspaces.find((w) => String(w.id) === selectedWs)?.name ?? selectedWs;

  // Disposition tally across the loaded docket.
  const statusReadings = useMemo(() => {
    const counts = new Map<CaseStatus, number>();
    for (const c of cases) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    return DOCKET_STATUSES.map((s) => ({
      label: t(`enterprise.status.${s}`, { defaultValue: s }),
      value: (
        <span className={cn((counts.get(s) ?? 0) === 0 && "text-txt-faint")} dir="ltr">
          {counts.get(s) ?? 0}
        </span>
      ),
    }));
  }, [cases, t]);
  const readingsMid = Math.ceil(statusReadings.length / 2);

  const hasFilters = search !== "" || selectedWs !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setSelectedWs("all");
    setStatusFilter("all");
  };

  return (
    <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
      <Masthead
        kicker={t("enterprise.cases.eyebrow", { defaultValue: "Review queue" })}
        title={t("enterprise.cases.title")}
        description={t("enterprise.cases.subtitle")}
      />

      {/* Readings */}
      <div className={READINGS_ROW}>
        <Reading label={t("enterprise.cases.colCase", { defaultValue: "Case" })} value={cases.length} note={scopeLabel} />
        <Reading label={t("enterprise.cases.showing", { defaultValue: "Showing" })} value={filtered.length} note={`/ ${cases.length}`} />
        <Reading
          label={t("enterprise.status.confirmed_clone")}
          value={<span className={cn(confirmedCount > 0 && "text-signal-bench")}>{confirmedCount}</span>}
        />
        <Reading label={t("enterprise.cases.workspace")} value={selectedWs === "all" ? workspaces.length : 1} />
      </div>

      <div className="mt-8 space-y-5">
        {/* Dispositions */}
        {!loading && !error && cases.length > 0 && (
          <Panel
            label={t("enterprise.cases.readingsTitle", { defaultValue: "Dispositions" })}
            actions={<span className="text-[12.5px] text-txt-secondary">{scopeLabel}</span>}
          >
            <div className="grid sm:grid-cols-2">
              <SpecList rows={statusReadings.slice(0, readingsMid)} className="sm:pe-12" />
              <SpecList rows={statusReadings.slice(readingsMid)} className="sm:border-s sm:border-bench-hair sm:ps-12" />
            </div>
          </Panel>
        )}

        {/* Ledger */}
        <Panel label={t("enterprise.cases.ledgerTitle", { defaultValue: "Case ledger" })} bodyClassName="p-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5">
            <label className="well w-full sm:w-[300px]">
              <IconSearch className="text-txt-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("enterprise.cases.searchPlaceholder")}
                aria-label={t("enterprise.cases.searchPlaceholder")}
              />
            </label>
            <BenchSelect
              label={t("enterprise.cases.workspace")}
              value={selectedWs}
              onChange={setSelectedWs}
              options={[{ value: "all", label: t("enterprise.cases.allWorkspaces") }, ...workspaces.map((ws) => ({ value: String(ws.id), label: ws.name }))]}
            />
            <BenchSelect
              label={t("enterprise.cases.colStatus", { defaultValue: "Status" })}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as CaseStatus | "all")}
              options={ALL_STATUSES.map((s) => ({ value: s, label: t(`enterprise.status.${s}`) }))}
            />
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-[12.5px] text-txt-secondary underline underline-offset-2 hover:text-txt-primary">
                {t("history.filters.clear", { ns: "common" })}
              </button>
            )}
            {!loading && !error && (
              <span className="ms-auto text-[12.5px] text-txt-secondary" dir="ltr">
                {filtered.length} / {cases.length}
              </span>
            )}
          </div>

          {loading ? (
            <PageLoader message={t("enterprise.common.loading")} />
          ) : error ? (
            <PageError message={error} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-4 border-y border-bench-hair px-6 py-20 text-center">
              <IconFilePlus className="text-txt-muted" />
              <p className="text-[15px] text-txt-primary">{t("enterprise.cases.noCases")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1000px] border-collapse border-y border-bench-hair">
                <thead>
                  <tr className="h-9 border-b border-bench-hair">
                    <th className={cn(TH, "w-[150px] ps-5")}>{t("enterprise.cases.colCase", { defaultValue: "Case" })}</th>
                    <th className={cn(TH, "ps-3")}>{t("enterprise.cases.colPaths", { defaultValue: "Artifacts" })}</th>
                    <th className={cn(TH, "w-[190px] ps-3")}>{t("enterprise.cases.colScore", { defaultValue: "Score" })}</th>
                    <th className={cn(TH, "w-32 ps-3")}>{t("enterprise.cases.colType", { defaultValue: "Clone type" })}</th>
                    <th className={cn(TH, "w-[150px] ps-3")}>{t("enterprise.cases.colStatus", { defaultValue: "Status" })}</th>
                    <th className={cn(TH, "w-36 ps-3")}>{t("enterprise.cases.workspace")}</th>
                    <th className="w-28 pe-5">
                      <span className="sr-only">{t("enterprise.cases.viewCase")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const wsName = workspaces.find((w) => w.id === c.workspaceId)?.name;
                    const pathA = c.match?.artifactA?.logicalPath ?? "—";
                    const pathB = c.match?.artifactB?.logicalPath ?? "—";
                    const score = Math.round(c.confidenceScore);
                    return (
                      <tr key={c.id} className="h-[46px] border-b border-bench-hair last:border-b-0 hover:bg-bench-raised/60">
                        <td className="ps-5 align-middle">
                          <span className="flex items-center gap-2.5">
                            <span className="mono-filename text-txt-muted" dir="ltr">C-{c.id}</span>
                            <Tag tone={SEVERITY_TONE[c.severity] ?? "neutral"}>{t(`enterprise.severity.${c.severity}`, { defaultValue: c.severity })}</Tag>
                          </span>
                        </td>
                        <td className="max-w-[280px] ps-3 py-2 align-middle">
                          <PlatePair mono a={pathA} b={pathB} />
                        </td>
                        <td className="ps-3 align-middle">
                          <span className="flex items-center gap-3">
                            <Scale value={score} quiet={score < 50} className="w-[110px]" />
                            <span className="mono-value text-txt-primary" dir="ltr">{score}</span>
                          </span>
                        </td>
                        <td className="mono-filename ps-3 align-middle text-txt-secondary" dir="ltr">
                          {c.cloneType.replace(/_/g, " ")}
                        </td>
                        <td className="ps-3 align-middle">
                          <Tag tone={STATUS_TONE[c.status] ?? "neutral"}>{t(`enterprise.status.${c.status}`, { defaultValue: c.status })}</Tag>
                        </td>
                        <td className="max-w-[160px] ps-3 align-middle">
                          <span className="mono-filename block truncate text-txt-muted" dir="auto">{wsName ?? "—"}</span>
                        </td>
                        <td className="pe-5 align-middle text-end">
                          <Link to={`/enterprise/cases/${c.id}`} className="link inline-flex items-center gap-1 text-[12.5px]">
                            {t("enterprise.cases.viewCase")}
                            <IconChevronRight className="rtl:-scale-x-100" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tally line */}
          {!loading && !error && filtered.length > 0 && (
            <div className="flex h-12 items-center justify-between px-5">
              <span className="label text-txt-muted">{t("enterprise.cases.showing", { defaultValue: "Showing" })}</span>
              <span className="mono-filename text-txt-secondary" dir="ltr">
                {filtered.length} / {cases.length}
              </span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
