import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Copy,
  FileCode2,
  GitBranch,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Scan,
  Search,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import {
  addMember,
  createRepository,
  getScanJob,
  listCases,
  listMembers,
  listRepositories,
  listWorkspaces,
  probeGitUrl,
  triggerScan,
} from "@/lib/enterpriseApi";
import type {
  EnterpriseCase,
  EnterpriseRepository,
  EnterpriseWorkspace,
  RepositorySecrets,
  WorkspaceMembership,
} from "@/types/enterprise";
import { cn } from "@/lib/utils";

type Tab = "repositories" | "cases" | "members";

const STATUS_META: Record<string, { cls: string }> = {
  open:            { cls: "bg-accent/15 text-accent border-accent/30" },
  in_review:       { cls: "bg-warning/15 text-warning border-warning/30" },
  confirmed_clone: { cls: "bg-destructive/15 text-destructive border-destructive/30" },
  false_positive:  { cls: "bg-muted text-muted-foreground border-border/60" },
  resolved:        { cls: "bg-success/15 text-success border-success/30" },
  dismissed:       { cls: "bg-muted text-muted-foreground border-border/60" },
};

const SEV_META: Record<string, { cls: string }> = {
  critical: { cls: "bg-destructive/15 text-destructive border-destructive/30" },
  high:     { cls: "bg-warning/15 text-warning border-warning/30" },
  medium:   { cls: "bg-warning/12 text-warning border-warning/25" },
  low:      { cls: "bg-accent/15 text-accent border-accent/30" },
};

const ROLE_CLS: Record<string, string> = {
  owner:    "bg-primary/15 text-primary border-primary/25",
  admin:    "bg-destructive/15 text-destructive border-destructive/25",
  manager:  "bg-warning/15 text-warning border-warning/25",
  reviewer: "bg-accent/15 text-accent border-accent/25",
  student:  "bg-muted text-muted-foreground border-border/60",
};

const PROVIDER_ICON: Record<string, string> = {
  github: "GH",
  gitlab: "GL",
  local:  "LO",
};

export default function WorkspaceDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const wsId = Number(workspaceId);
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const { t } = useTranslation("enterprise");

  const [workspace, setWorkspace] = useState<EnterpriseWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("repositories");

  const [repos, setRepos] = useState<EnterpriseRepository[]>([]);
  const [cases, setCases] = useState<EnterpriseCase[]>([]);
  const [members, setMembers] = useState<WorkspaceMembership[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const [scanning, setScanningId] = useState<number | null>(null);
  const [caseSearch, setCaseSearch] = useState("");

  // Create repo dialog
  const [repoOpen, setRepoOpen] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [repoProvider, setRepoProvider] = useState("local");
  const [repoPath, setRepoPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probedBranches, setProbedBranches] = useState<string[]>([]);
  const [probeError, setProbeError] = useState("");
  // Webhook credentials returned once by createRepository — held until the user
  // dismisses the dialog, since they cannot be fetched again.
  const [repoSecrets, setRepoSecrets] = useState<RepositorySecrets | null>(null);

  // Add member dialog
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("student");
  const [addingMember, setAddingMember] = useState(false);

  // Load workspace info
  useEffect(() => {
    listWorkspaces().then((list) => {
      const ws = list.find((w) => w.id === wsId);
      if (ws) setWorkspace(ws);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // Load active tab data
  useEffect(() => {
    if (!wsId) return;
    setLoadingTab(true);
    setTabError(null);

    const loaders: Record<Tab, () => Promise<void>> = {
      repositories: async () => setRepos(await listRepositories(wsId)),
      cases:        async () => setCases(await listCases(wsId)),
      members:      async () => setMembers(await listMembers(wsId)),
    };
    loaders[activeTab]()
      .catch((e) => setTabError(e?.message ?? "Error"))
      .finally(() => setLoadingTab(false));
  }, [wsId, activeTab]);

  const handleTriggerScan = async (repoId: number) => {
    setScanningId(repoId);
    try {
      const repo = repos.find((r) => r.id === repoId);
      const job = await triggerScan(repoId, { branch: repo?.defaultBranch || "main" });
      toast.success(t("enterprise.workspaceDetail.scanQueued"), { description: t("enterprise.workspaceDetail.scanQueuedDesc") });
      // Follow the job to a terminal state so the user learns the outcome
      // without refreshing (poll every 3s, give up after ~3 minutes).
      void pollScanJob(job.id);
    } catch (e: unknown) {
      toast.error(t("enterprise.workspaceDetail.failed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setScanningId(null);
    }
  };

  const pollScanJob = async (jobId: number) => {
    const POLL_MS = 3000;
    const MAX_ATTEMPTS = 60;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      let job;
      try {
        job = await getScanJob(jobId);
      } catch {
        return; // navigated away / lost access — stop quietly
      }
      if (job.status === "completed") {
        toast.success(
          t("enterprise.workspaceDetail.scanCompleted", { defaultValue: "Scan completed" }),
        );
        // Surface freshly created cases if the user is on that tab.
        if (activeTab === "cases") {
          listCases(wsId).then(setCases).catch(() => undefined);
        }
        return;
      }
      if (job.status === "failed") {
        toast.error(
          t("enterprise.workspaceDetail.scanFailed", { defaultValue: "Scan failed" }),
          job.errorMessage ? { description: job.errorMessage } : undefined,
        );
        return;
      }
    }
  };

  const handleProbeUrl = async () => {
    const url = repoUrl.trim();
    if (!url) return;
    setProbing(true);
    setProbeError("");
    setProbedBranches([]);
    try {
      const result = await probeGitUrl(url);
      setProbedBranches(result.branches);
      setRepoBranch(result.defaultBranch);
      toast.success(
        t("enterprise.workspaceDetail.probeSuccess"),
        { description: `${result.totalBranches} branches` },
      );
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      setProbeError(msg);
      toast.error(t("enterprise.workspaceDetail.probeFailed"), { description: msg });
    } finally {
      setProbing(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("enterprise.workspaceDetail.copied"));
    } catch {
      toast.error(t("enterprise.workspaceDetail.copyFailed"));
    }
  };

  const handleCreateRepo = async () => {
    if (!repoName.trim()) return;
    const isLocal = repoProvider === "local";
    setCreatingRepo(true);
    try {
      // Send only the location field the selected provider uses; the backend
      // rejects requests that carry both localPath and cloneUrl.
      const { item, secrets } = await createRepository(wsId, {
        name: repoName.trim(),
        provider: repoProvider,
        localPath: isLocal ? repoPath.trim() || undefined : undefined,
        cloneUrl: isLocal ? undefined : repoUrl.trim() || undefined,
        defaultBranch: repoBranch.trim() || "main",
      });
      setRepos((prev) => [item, ...prev]);
      setRepoOpen(false);
      setRepoName(""); setRepoPath(""); setRepoUrl(""); setRepoBranch("main");
      setProbedBranches([]); setProbeError("");
      toast.success(t("enterprise.workspaceDetail.repoAdded"));
      // Webhook credentials are returned exactly once; surface them for remote
      // repositories so the admin can wire up the provider webhook.
      if (item.provider !== "local" && secrets?.webhookSecret) {
        setRepoSecrets(secrets);
      }
    } catch (e: unknown) {
      toast.error(t("enterprise.workspaceDetail.failed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setCreatingRepo(false);
    }
  };

  const handleAddMember = async () => {
    const uid = parseInt(memberUserId, 10);
    if (!uid || isNaN(uid)) return;
    setAddingMember(true);
    try {
      const added = await addMember(wsId, {
        legacyUserId: uid,
        role: memberRole,
      });
      setMembers((prev) => {
        const filtered = prev.filter((m) => m.legacyUserId !== uid);
        return [added, ...filtered];
      });
      setMemberOpen(false);
      setMemberUserId("");
      setMemberRole("student");
      toast.success(t("enterprise.workspaceDetail.memberAdded"));
    } catch (e: unknown) {
      toast.error(t("enterprise.workspaceDetail.failed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setAddingMember(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Scan }> = [
    { id: "repositories", label: t("enterprise.workspaceDetail.repositories"), icon: GitBranch },
    { id: "cases",        label: t("enterprise.workspaceDetail.cases"),        icon: Shield },
    { id: "members",      label: t("enterprise.workspaceDetail.members"),      icon: Users },
  ];

  // Stat calculations for header
  const threshold = workspace ? Math.round(workspace.defaultSimilarityThreshold * 100) : 0;
  const flaggedCount = useMemo(
    () => cases.filter((c) => c.confidenceScore >= threshold).length,
    [cases, threshold],
  );
  const reviewedCount = useMemo(
    () => cases.filter((c) => c.status === "resolved" || c.status === "confirmed_clone" || c.status === "false_positive" || c.status === "dismissed").length,
    [cases],
  );

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => {
      const a = c.match?.artifactA?.logicalPath?.toLowerCase() ?? "";
      const b = c.match?.artifactB?.logicalPath?.toLowerCase() ?? "";
      return a.includes(q) || b.includes(q) || String(c.id).includes(q);
    });
  }, [cases, caseSearch]);

  const scoreColor = (score: number): string => {
    if (score >= 80) return "hsl(var(--destructive))";
    if (score >= 60) return "hsl(14 85% 38%)";
    if (score >= 40) return "hsl(var(--warning))";
    return "hsl(var(--muted-foreground))";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate("/enterprise/workspaces")}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
          {t("enterprise.workspaceDetail.back")}
        </button>
        <ChevronRight className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
        <span className="font-medium text-foreground">{workspace?.name ?? `#${wsId}`}</span>
      </div>

      {/* Workspace hero card with stats */}
      {workspace && (
        <section
          className="overflow-hidden rounded-2xl border border-border bg-card"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="min-w-0 flex-1">
              {/* Badge row */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "hsl(var(--secondary))",
                    color: "hsl(var(--secondary-foreground))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  #{workspace.id}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: "hsl(var(--primary) / 0.12)",
                    color: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--primary) / 0.25)",
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t("enterprise.workspaceDetail.active", { defaultValue: "Active" })}
                </span>
              </div>
              <h1 className="t-h3 text-foreground">{workspace.name}</h1>
              {workspace.description && (
                <p className="mt-1 t-body">{workspace.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono tabular-nums">{threshold}%</span>
                  {t("enterprise.workspaceDetail.thresholdLabel", { defaultValue: "threshold" })}
                </span>
                <span className="flex items-center gap-1.5">
                  <FileCode2 className="h-3.5 w-3.5 text-primary" />
                  {workspace.storageRegion}
                </span>
              </div>
            </div>
          </div>

          {/* Stat row - 4 cards */}
          <div className="grid grid-cols-2 gap-3 px-6 pb-6 md:grid-cols-4">
            <StatCell label={t("enterprise.workspaceDetail.statRepos", { defaultValue: "Repositories" })} value={String(repos.length)} />
            <StatCell label={t("enterprise.workspaceDetail.statCases", { defaultValue: "Cases" })} value={String(cases.length)} />
            <StatCell
              label={t("enterprise.workspaceDetail.statFlagged", { defaultValue: "Flagged ≥ threshold" })}
              value={String(flaggedCount)}
              valueColor="hsl(var(--destructive))"
            />
            <StatCell
              label={t("enterprise.workspaceDetail.statReviewed", { defaultValue: "Reviewed" })}
              value={`${reviewedCount} / ${cases.length}`}
              valueColor="hsl(var(--success))"
            />
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="border-b border-border/50">
        <nav className="flex gap-1" aria-label="Workspace tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {loadingTab ? (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-muted-foreground"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : tabError ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-12 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {tabError}
        </div>
      ) : (
        <>
          {/* Repositories tab */}
          {activeTab === "repositories" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-9 gap-2 text-white"
                  style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
                  onClick={() => setRepoOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("enterprise.workspaceDetail.addRepo")}
                </Button>
              </div>

              {repos.length === 0 ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-14 text-center"
                  style={{ boxShadow: "var(--card-shadow-rest)" }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                  >
                    <GitBranch className="h-6 w-6" />
                  </div>
                  <p className="t-sm">{t("enterprise.workspaceDetail.noRepos")}</p>
                  <Button size="sm" variant="outline" onClick={() => setRepoOpen(true)} className="gap-2">
                    <Plus className="h-3.5 w-3.5" />{t("enterprise.workspaceDetail.addRepo")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3.5 transition-all hover:border-primary/40"
                      style={{ boxShadow: "var(--card-shadow-rest)" }}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ background: "var(--gradient-brand)" }}
                      >
                        {PROVIDER_ICON[repo.provider] ?? "??"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{repo.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {repo.provider}
                          {" · "}
                          <span className="font-mono">{repo.defaultBranch ?? "main"}</span>
                          {" · "}
                          {repo.declaredRegion}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        disabled={scanning === repo.id}
                        onClick={() => handleTriggerScan(repo.id)}
                      >
                        {scanning === repo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {scanning === repo.id ? t("enterprise.workspaceDetail.scanning") : t("enterprise.workspaceDetail.scan")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cases tab — table layout */}
          {activeTab === "cases" && (
            <div
              className="overflow-hidden rounded-2xl border border-border bg-card"
              style={{ boxShadow: "var(--card-shadow-rest)" }}
            >
              {/* Filter bar */}
              <div
                className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3"
                style={{ background: "hsl(var(--surface-2))" }}
              >
                <div className="relative min-w-[220px] flex-1 max-w-sm">
                  <Search className={cn("pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                  <Input
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder={t("enterprise.workspaceDetail.searchCases", { defaultValue: "Filter by path, student, or case ID…" })}
                    className={cn("h-8 bg-card text-sm", isRTL ? "pr-8" : "pl-8")}
                  />
                </div>
                <div className="flex-1" />
                <span
                  className="text-xs tabular-nums text-muted-foreground"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {t("enterprise.workspaceDetail.showing", { defaultValue: "Showing" })} {filteredCases.length} / {cases.length}
                </span>
              </div>

              {filteredCases.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                  >
                    <Shield className="h-6 w-6" />
                  </div>
                  <p className="t-sm">{t("enterprise.workspaceDetail.noCases")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr style={{ background: "hsl(var(--surface-2))" }}>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}
                        >
                          {t("enterprise.workspaceDetail.colCase", { defaultValue: "Case" })}
                        </th>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}
                        >
                          {t("enterprise.workspaceDetail.colPair", { defaultValue: "Pair" })}
                        </th>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}
                        >
                          {t("enterprise.workspaceDetail.colScore", { defaultValue: "Score" })}
                        </th>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}
                        >
                          {t("enterprise.workspaceDetail.colType", { defaultValue: "Clone type" })}
                        </th>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-right" : "text-left")}
                        >
                          {t("enterprise.workspaceDetail.colStatus", { defaultValue: "Status" })}
                        </th>
                        <th
                          className={cn("border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isRTL ? "text-left" : "text-right")}
                        >
                          &nbsp;
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((c) => {
                        const sm = STATUS_META[c.status] ?? STATUS_META.open;
                        const sv = SEV_META[c.severity] ?? SEV_META.medium;
                        const pathA = c.match?.artifactA?.logicalPath ?? "\u2014";
                        const pathB = c.match?.artifactB?.logicalPath ?? "\u2014";
                        const score = Math.round(c.confidenceScore);
                        const initA = pathA.split(/[/\\]/).pop()?.slice(0, 2).toUpperCase() ?? "A";
                        const initB = pathB.split(/[/\\]/).pop()?.slice(0, 2).toUpperCase() ?? "B";
                        return (
                          <tr
                            key={c.id}
                            className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 align-middle">
                              <span
                                className="font-medium text-muted-foreground"
                                style={{ fontFamily: "var(--font-mono)" }}
                              >
                                #C-{c.id}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="flex items-center gap-2 text-xs">
                                <span
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                  style={{ background: "var(--gradient-brand)" }}
                                >
                                  {initA}
                                </span>
                                <span className="max-w-[120px] truncate text-foreground">{pathA.split(/[/\\]/).pop()}</span>
                                <span className="text-muted-foreground">×</span>
                                <span
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                  style={{ background: "linear-gradient(135deg, hsl(var(--accent)), hsl(var(--primary)))" }}
                                >
                                  {initB}
                                </span>
                                <span className="max-w-[120px] truncate text-foreground">{pathB.split(/[/\\]/).pop()}</span>
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
                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
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
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", sv.cls)}>
                                  {c.severity}
                                </span>
                                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", sm.cls)}>
                                  {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                                </span>
                              </div>
                            </td>
                            <td className={cn("px-4 py-3 align-middle", isRTL ? "text-left" : "text-right")}>
                              <Link
                                to={`/enterprise/cases/${c.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                {t("enterprise.workspaceDetail.viewCase")}
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
          )}

          {/* Members tab */}
          {activeTab === "members" && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMemberOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("enterprise.workspaceDetail.addMember")}
                </Button>
              </div>
              {members.length === 0 ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-14 text-center"
                  style={{ boxShadow: "var(--card-shadow-rest)" }}
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                  >
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="t-sm">{t("enterprise.workspaceDetail.noMembers")}</p>
                </div>
              ) : (
                members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 transition-all hover:border-primary/40"
                    style={{ boxShadow: "var(--card-shadow-rest)" }}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: "var(--gradient-brand)" }}
                    >
                      {m.legacyUserId}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {t("enterprise.workspaceDetail.userHash", { defaultValue: "User #" })}
                        {m.legacyUserId}
                      </p>
                      {m.lastActiveAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.lastActiveAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                        ROLE_CLS[m.role] ?? "bg-muted text-muted-foreground border-border/60",
                      )}
                    >
                      {m.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Create repository dialog */}
      <Dialog open={repoOpen} onOpenChange={setRepoOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.workspaceDetail.addRepo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("enterprise.workspaceDetail.repoNameLabel")}</Label>
              <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("enterprise.workspaceDetail.providerLabel")}</Label>
              <Select value={repoProvider} onValueChange={setRepoProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="github">github</SelectItem>
                  <SelectItem value="gitlab">gitlab</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {repoProvider === "local" ? (
              <div className="space-y-1.5">
                <Label>{t("enterprise.workspaceDetail.localPathLabel")}</Label>
                <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("enterprise.workspaceDetail.cloneUrlLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={repoUrl}
                    onChange={(e) => { setRepoUrl(e.target.value); setProbedBranches([]); setProbeError(""); }}
                    placeholder="https://github.com/owner/repo"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={probing || !repoUrl.trim()}
                    onClick={handleProbeUrl}
                  >
                    {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {t("enterprise.workspaceDetail.probe")}
                  </Button>
                </div>
                {probeError && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {probeError}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("enterprise.workspaceDetail.branchLabel")}</Label>
              {probedBranches.length > 0 ? (
                <Select value={repoBranch} onValueChange={setRepoBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("enterprise.workspaceDetail.selectBranch")} />
                  </SelectTrigger>
                  <SelectContent>
                    {probedBranches.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" />
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRepoOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button
                onClick={handleCreateRepo}
                disabled={creatingRepo || !repoName.trim()}
                className="text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
                {creatingRepo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.workspaceDetail.addRepo")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time webhook credentials dialog */}
      <Dialog open={!!repoSecrets} onOpenChange={(open) => { if (!open) setRepoSecrets(null); }}>
        <DialogContent className="sm:max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {t("enterprise.workspaceDetail.secretsTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div
              className="flex items-start gap-2 rounded-lg border p-3 text-xs"
              style={{ background: "hsl(var(--warning) / 0.1)", borderColor: "hsl(var(--warning) / 0.3)" }}
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span className="text-warning">{t("enterprise.workspaceDetail.secretsIntro")}</span>
            </div>

            {([
              { label: t("enterprise.workspaceDetail.secretsWebhookLabel"), value: repoSecrets?.webhookSecret, mono: true },
              { label: t("enterprise.workspaceDetail.secretsGithubLabel"), value: repoSecrets?.githubWebhookUrl, mono: false },
              { label: t("enterprise.workspaceDetail.secretsGitlabLabel"), value: repoSecrets?.gitlabWebhookUrl, mono: false },
            ] as const).map((field) => (
              <div key={field.label} className="space-y-1.5">
                <Label>{field.label}</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={field.value ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    className={cn("flex-1", field.mono && "font-mono text-xs")}
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => field.value && copyToClipboard(field.value)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("enterprise.workspaceDetail.copy")}
                  </Button>
                </div>
              </div>
            ))}

            <p className="text-xs text-muted-foreground">{t("enterprise.workspaceDetail.secretsHint")}</p>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setRepoSecrets(null)}
                className="text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
                {t("enterprise.workspaceDetail.secretsDone")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.workspaceDetail.addMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("enterprise.workspaceDetail.userIdLabel")}</Label>
              <Input
                type="number"
                min={1}
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("enterprise.workspaceDetail.roleLabel")}</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">{t("enterprise.workspaceDetail.roleStudent")}</SelectItem>
                  <SelectItem value="reviewer">{t("enterprise.workspaceDetail.roleReviewer")}</SelectItem>
                  <SelectItem value="manager">{t("enterprise.workspaceDetail.roleManager")}</SelectItem>
                  <SelectItem value="admin">{t("enterprise.workspaceDetail.roleAdmin")}</SelectItem>
                  <SelectItem value="owner">{t("enterprise.workspaceDetail.roleOwner")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setMemberOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button
                onClick={handleAddMember}
                disabled={addingMember || !memberUserId.trim()}
                className="text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
                {addingMember && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.workspaceDetail.addMember")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border) / 0.5)" }}
    >
      <div className="t-label">{label}</div>
      <div
        className="mt-1.5 text-2xl font-bold tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          letterSpacing: "-0.02em",
          color: valueColor ?? "hsl(var(--foreground))",
        }}
      >
        {value}
      </div>
    </div>
  );
}
