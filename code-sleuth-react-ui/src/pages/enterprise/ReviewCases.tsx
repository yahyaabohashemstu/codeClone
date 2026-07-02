import { useEffect, useState } from "react";
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
import { useLanguage } from "@/context/LanguageContext";
import { listWorkspaces, listCases } from "@/lib/enterpriseApi";
import type { EnterpriseCase, CaseStatus, EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<CaseStatus, string> = {
  open: "bg-accent/15 text-accent border-accent/30",
  in_review: "bg-warning/15 text-warning border-warning/30",
  confirmed_clone: "bg-destructive/15 text-destructive border-destructive/30",
  false_positive: "bg-muted text-muted-foreground border-border/60",
  dismissed: "bg-muted text-muted-foreground border-border/60",
  resolved: "bg-success/15 text-success border-success/30",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-warning/70",
  low: "bg-accent",
};

const ALL_STATUSES: Array<CaseStatus | "all"> = [
  "all", "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

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

  const scoreColor = (score: number): string => {
    if (score >= 80) return "hsl(var(--destructive))";
    if (score >= 60) return "hsl(14 85% 38%)";
    if (score >= 40) return "hsl(var(--warning))";
    return "hsl(var(--muted-foreground))";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header hero */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-56 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.28), transparent 70%)" }}
        />
        <div className="relative p-6">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <Scale className="h-3 w-3" />
            {t("enterprise.cases.eyebrow", { defaultValue: "Review queue" })}
          </div>
          <h1 className="mt-3 t-h2">{t("enterprise.cases.title")}</h1>
          <p className="mt-1 max-w-[60ch] t-body">{t("enterprise.cases.subtitle")}</p>
        </div>
      </section>

      {/* Content card with filters + table */}
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        {/* Filter bar */}
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3"
          style={{ background: "hsl(var(--surface-2))" }}
        >
          {/* Workspace picker */}
          <Select value={selectedWs} onValueChange={setSelectedWs}>
            <SelectTrigger className="h-9 w-52 bg-card">
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
            <SelectTrigger className="h-9 w-44 bg-card">
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
              className={cn("h-9 bg-card", isRTL ? "pr-9" : "pl-9")}
            />
          </div>
          <span
            className="text-xs tabular-nums text-muted-foreground"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {t("enterprise.cases.showing", { defaultValue: "Showing" })} {filtered.length} / {cases.length}
          </span>
        </div>

        {/* Content */}
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
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
            >
              <Scale className="h-6 w-6" />
            </div>
            <p className="t-body">{t("enterprise.cases.noCases")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--surface-2))" }}>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.colCase", { defaultValue: "Case" })}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.colPaths", { defaultValue: "Artifacts" })}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.colScore", { defaultValue: "Score" })}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.colType", { defaultValue: "Clone type" })}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.colStatus", { defaultValue: "Status" })}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}>
                    {t("enterprise.cases.workspace")}
                  </th>
                  <th className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-left" : "text-right")}>
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const wsName = workspaces.find((w) => w.id === c.workspaceId)?.name;
                  const pathA = c.match?.artifactA?.logicalPath ?? "\u2014";
                  const pathB = c.match?.artifactB?.logicalPath ?? "\u2014";
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
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              SEVERITY_DOT[c.severity] ?? "bg-muted",
                            )}
                          />
                          <span
                            className="font-medium text-muted-foreground"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            #C-{c.id}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 align-middle">
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 text-muted-foreground">A</span>
                            <span className="truncate font-mono text-foreground">{pathA}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="shrink-0 text-muted-foreground">B</span>
                            <span className="truncate font-mono text-foreground">{pathB}</span>
                          </div>
                        </div>
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
                            {score}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize"
                          style={{
                            fontFamily: "var(--font-mono)",
                            background: "hsl(var(--secondary))",
                            color: "hsl(var(--secondary-foreground))",
                            borderColor: "hsl(var(--border))",
                          }}
                        >
                          {c.cloneType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                            STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground border-border/60",
                          )}
                        >
                          {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                        </span>
                      </td>
                      <td className="max-w-[160px] px-4 py-3 align-middle text-xs text-muted-foreground">
                        <span className="truncate">{wsName ?? "\u2014"}</span>
                      </td>
                      <td className={cn("px-4 py-3 align-middle", isRTL ? "text-left" : "text-right")}>
                        <Link
                          to={`/enterprise/cases/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {t("enterprise.cases.viewCase")}
                          <ChevronRight className={cn("h-3 w-3", isRTL && "rotate-180")} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
