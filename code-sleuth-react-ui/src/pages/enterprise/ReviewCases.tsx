import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Scale,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Masthead, Serial } from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import { listWorkspaces, listCases } from "@/lib/enterpriseApi";
import type { EnterpriseCase, CaseStatus, EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<CaseStatus, string> = {
  open: "bg-primary/10 text-primary border-primary/30",
  in_review: "bg-warning/15 text-warning border-warning/30",
  confirmed_clone: "bg-destructive/15 text-destructive border-destructive/30",
  false_positive: "bg-muted text-muted-foreground border-border",
  dismissed: "bg-muted text-muted-foreground border-border",
  resolved: "bg-success/15 text-success border-success/30",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-warning/70",
  low: "bg-primary",
};

const ALL_STATUSES: Array<CaseStatus | "all"> = [
  "all", "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

const TH_CLASS =
  "border-b border-border px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

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

  // Live docket readings for the masthead meta strip and status ledger footer
  const confirmedCount = useMemo(
    () => cases.filter((c) => c.status === "confirmed_clone").length,
    [cases],
  );
  const scopeLabel =
    selectedWs === "all"
      ? t("enterprise.cases.allWorkspaces")
      : workspaces.find((w) => String(w.id) === selectedWs)?.name ?? selectedWs;

  const scoreColor = (score: number): string => {
    if (score >= 80) return "hsl(var(--destructive))";
    if (score >= 60) return "hsl(14 85% 38%)";
    if (score >= 40) return "hsl(var(--warning))";
    return "hsl(var(--muted-foreground))";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Docket masthead — ruled header + live mono readings */}
      <Masthead
        kicker={t("enterprise.cases.eyebrow", { defaultValue: "Review queue" })}
        title={t("enterprise.cases.title")}
        description={t("enterprise.cases.subtitle")}
        meta={[
          { label: "SCOPE", value: scopeLabel },
          { label: "CASES", value: cases.length },
          {
            label: "SHOWN",
            value: (
              <span className="tabular-nums">
                {filtered.length}
                <span className="text-muted-foreground/60"> / {cases.length}</span>
              </span>
            ),
          },
          {
            label: "CONFIRMED",
            value:
              confirmedCount > 0 ? (
                <span className="text-destructive">{confirmedCount}</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              ),
          },
        ]}
      />

      {/* Case docket — one ruled ledger: filter row + table, never a grid of cards */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Compact filter row */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
          <span className="t-label me-1 hidden text-muted-foreground/70 sm:inline">
            {t("enterprise.cases.colStatus", { defaultValue: "Filter" })}
          </span>
          {/* Workspace picker */}
          <Select value={selectedWs} onValueChange={setSelectedWs}>
            <SelectTrigger className="h-9 w-52 bg-card font-mono text-xs">
              <SelectValue placeholder={t("enterprise.cases.allWorkspaces")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("enterprise.cases.allWorkspaces")}</SelectItem>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={String(ws.id)}>{ws.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status picker */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CaseStatus | "all")}>
            <SelectTrigger className="h-9 w-44 bg-card font-mono text-xs">
              <SelectValue placeholder={t("enterprise.cases.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`enterprise.status.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative min-w-48 flex-1">
            <Search className={cn("pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("enterprise.cases.searchPlaceholder")}
              className={cn("h-9 bg-card font-mono text-xs", isRTL ? "pr-9" : "pl-9")}
            />
          </div>
        </div>

        {/* Ledger body */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("enterprise.common.loading")}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Scale className="h-5 w-5 text-muted-foreground" />
            <p className="t-body">{t("enterprise.cases.noCases")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-sm" dir="ltr">
              <thead>
                <tr className="bg-muted/40">
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.colCase", { defaultValue: "Case" })}
                  </th>
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.colPaths", { defaultValue: "Artifacts" })}
                  </th>
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.colScore", { defaultValue: "Score" })}
                  </th>
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.colType", { defaultValue: "Clone type" })}
                  </th>
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.colStatus", { defaultValue: "Status" })}
                  </th>
                  <th className={cn(TH_CLASS, "text-left")}>
                    {t("enterprise.cases.workspace")}
                  </th>
                  <th className={cn(TH_CLASS, "text-right")}>
                    &nbsp;
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
                    <tr
                      key={c.id}
                      className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            title={c.severity}
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              SEVERITY_DOT[c.severity] ?? "bg-muted",
                            )}
                          />
                          <Serial tone={c.status === "confirmed_clone" ? "primary" : "muted"}>
                            C-{c.id}
                          </Serial>
                        </div>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 align-middle">
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 font-mono text-muted-foreground/60">A</span>
                            <span className="truncate font-mono text-foreground">{pathA}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 font-mono text-muted-foreground/60">B</span>
                            <span className="truncate font-mono text-foreground">{pathB}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-14 overflow-hidden rounded-sm bg-muted">
                            <span
                              className="block h-full"
                              style={{ width: `${score}%`, background: scoreColor(score) }}
                            />
                          </span>
                          <span
                            className="font-mono text-sm font-semibold tabular-nums"
                            style={{ color: scoreColor(score) }}
                          >
                            {score}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-flex items-center rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium capitalize text-muted-foreground">
                          {c.cloneType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold capitalize",
                            STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                        </span>
                      </td>
                      <td className="max-w-[160px] px-4 py-3 align-middle text-xs text-muted-foreground">
                        <span className="truncate font-mono">{wsName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <Link
                          to={`/enterprise/cases/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {t("enterprise.cases.viewCase")}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ledger footer — mono tally line */}
        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-2.5 font-mono text-[11px] text-muted-foreground">
            <span className="uppercase tracking-[0.14em] text-muted-foreground/70">
              {t("enterprise.cases.showing", { defaultValue: "Showing" })}
            </span>
            <span className="tabular-nums">
              {filtered.length} / {cases.length}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
