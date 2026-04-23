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
  open: "bg-blue-500/15 text-blue-600",
  in_review: "bg-yellow-500/15 text-yellow-600",
  confirmed_clone: "bg-destructive/15 text-destructive",
  false_positive: "bg-muted text-muted-foreground",
  dismissed: "bg-muted text-muted-foreground",
  resolved: "bg-green-500/15 text-green-600",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-400",
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
    return pathA.includes(q) || pathB.includes(q);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Scale className="h-6 w-6 text-primary" />
          {t("enterprise.cases.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("enterprise.cases.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Workspace picker */}
        <Select value={selectedWs} onValueChange={setSelectedWs}>
          <SelectTrigger className="w-52">
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
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("enterprise.cases.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`enterprise.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("enterprise.cases.searchPlaceholder")}
            className={isRTL ? "pr-9" : "pl-9"}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("enterprise.common.loading")}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 justify-center py-16 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium flex flex-col items-center gap-3 py-16 text-center">
          <Scale className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">{t("enterprise.cases.noCases")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const wsName = workspaces.find((w) => w.id === c.workspaceId)?.name;
            const pathA = c.match?.artifactA?.logicalPath ?? "\u2014";
            const pathB = c.match?.artifactB?.logicalPath ?? "\u2014";
            return (
              <Link key={c.id} to={`/enterprise/cases/${c.id}`} className="block group">
                <div className="card-premium flex items-start gap-4 p-4 transition-all duration-150 hover:border-primary/40 hover:shadow-glow-sm">
                  {/* Severity dot */}
                  <div className="mt-1 shrink-0">
                    <span
                      className={cn(
                        "block h-2.5 w-2.5 rounded-full",
                        SEVERITY_DOT[c.severity] ?? "bg-muted",
                      )}
                    />
                  </div>

                  {/* Main content */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          STATUS_BADGE[c.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("enterprise.cases.cloneType")}: <span className="text-foreground font-medium">{c.cloneType}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("enterprise.cases.confidence")}: <span className="text-foreground font-medium">{Math.round(c.confidenceScore)}%</span>
                      </span>
                      {wsName && (
                        <span className="text-xs text-muted-foreground">
                          {t("enterprise.cases.workspace")}: <span className="text-foreground font-medium">{wsName}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground">{pathA}</span>
                      {" \u2194 "}
                      <span className="font-medium text-foreground">{pathB}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
