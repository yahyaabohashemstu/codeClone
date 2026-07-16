import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Masthead,
  FieldSheet,
  Field,
  Serial,
  Tag,
  StatusTag,
  ScoreMeter,
  Verdict,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
  LedgerFault,
  LedgerSkeleton,
  Notice,
} from "@/components/dossier/Dossier";
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

// Semantic tone — colour encodes standing/disposition only, consumed by the Dossier
// Tag / StatusTag so a status or role never renders a bespoke colour twice.
type StampTone = ComponentProps<typeof StatusTag>["tone"];

const STATUS_TONE: Record<string, StampTone> = {
  open: "primary",
  in_review: "warning",
  confirmed_clone: "danger",
  false_positive: "muted",
  resolved: "success",
  dismissed: "muted",
};

const ROLE_TONE: Record<string, StampTone> = {
  owner: "primary",
  admin: "danger",
  manager: "warning",
  reviewer: "accent",
  student: "muted",
};

// Severity → a compact triage dot in the case gutter (colour = meaning).
const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-warning/70",
  low: "bg-muted-foreground/50",
};

// One grid-template per ledger — drives head + every row so columns never drift.
const REPO_COLS = "3.5rem minmax(0,1fr) 6rem 6.5rem 6.5rem 7.5rem";
const CASE_COLS = "5rem minmax(14rem,1.4fr) 9.5rem 6.5rem 7rem 8rem 3.5rem";
const MEMBER_COLS = "4rem minmax(0,1fr) 9rem 7rem";

// A logical path drawn as a muted directory + a foreground basename, kept LTR.
function PathText({ path, className }: { path: string; className?: string }) {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dir = idx >= 0 ? path.slice(0, idx + 1) : "";
  const base = idx >= 0 ? path.slice(idx + 1) : path;
  return (
    <span dir="ltr" title={path} className={cn("min-w-0 truncate font-mono text-xs", className)}>
      {dir && <span className="text-muted-foreground/55">{dir}</span>}
      <span className="text-foreground">{base}</span>
    </span>
  );
}

// The clone pair, read as one line: exhibit A → exhibit B, amber arrow between.
function PathPair({ a, b }: { a: string; b: string }) {
  return (
    <div dir="ltr" className="flex min-w-0 items-center gap-2">
      <PathText path={a} className="flex-1" />
      <span className="shrink-0 font-mono text-muted-foreground/60" aria-hidden="true">→</span>
      <PathText path={b} className="flex-1" />
    </div>
  );
}

// A ruled, mono-labelled section header with room for one action on the trailing edge.
function TabHeader({ label, action }: { label: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
      <div className="flex items-center gap-2.5">
        <span className="h-px w-6 bg-primary" aria-hidden="true" />
        <h2 className="t-label text-foreground">{label}</h2>
      </div>
      {action != null && <div className="flex flex-wrap items-center gap-3">{action}</div>}
    </div>
  );
}

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
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTab = () => setReloadKey((k) => k + 1);

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
  }, [wsId, activeTab, reloadKey]);

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
      const result = await probeGitUrl(wsId, url);
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

  const tabCounts: Record<Tab, number> = {
    repositories: repos.length,
    cases: cases.length,
    members: members.length,
  };
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "repositories", label: t("enterprise.workspaceDetail.repositories") },
    { id: "cases",        label: t("enterprise.workspaceDetail.cases") },
    { id: "members",      label: t("enterprise.workspaceDetail.members") },
  ];

  // Stat calculations for masthead meta strip
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

  // Live case-file readings for the masthead — folds the old stat-card row in.
  const meta = [
    { label: "SERIAL", value: `WS-${wsId}` },
    ...(workspace
      ? [
          { label: "REGION", value: workspace.storageRegion },
          { label: "THRESHOLD", value: `${threshold}%` },
        ]
      : []),
    { label: "REPOS", value: repos.length },
    { label: "CASES", value: cases.length },
    { label: "FLAGGED", value: <span className="text-destructive">{flaggedCount}</span> },
    { label: "REVIEWED", value: `${reviewedCount}/${cases.length}` },
  ];

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

      {/* Workspace dossier masthead — identity + live readings, not a boxed hero */}
      <Masthead
        kicker={t("enterprise.workspaceDetail.dossierKicker", { defaultValue: "Workspace" })}
        title={workspace?.name ?? `#${wsId}`}
        description={workspace?.description || undefined}
        meta={meta}
      />

      {/* Tabs — mono ledger selectors with live counts */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Workspace tabs">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 border-b-2 pb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                <span className={cn("tabular-nums", active ? "text-primary/70" : "text-muted-foreground/50")}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content — each register is a ruled Ledger; loading / fault / empty
          states sit left-anchored beneath a constant head, per the Dossier kit */}
      {activeTab === "repositories" && (
        <section className="space-y-3">
          <TabHeader
            label={t("enterprise.workspaceDetail.repositories")}
            action={
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setRepoOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("enterprise.workspaceDetail.addRepo")}
              </Button>
            }
          />
          <Ledger columns={REPO_COLS}>
            <LedgerHead
              cells={[
                "#",
                t("enterprise.workspaceDetail.colRepo", { defaultValue: "Repository" }),
                t("enterprise.workspaceDetail.colProvider", { defaultValue: "Provider" }),
                t("enterprise.workspaceDetail.colBranch", { defaultValue: "Branch" }),
                t("enterprise.workspaceDetail.colRegion", { defaultValue: "Region" }),
                "",
              ]}
              aligns={["start", "start", "start", "start", "start", "end"]}
            />
            {loadingTab ? (
              <LedgerSkeleton rows={4} />
            ) : tabError ? (
              <LedgerFault onRetry={reloadTab} retryLabel={t("enterprise.common.retry", { defaultValue: "Retry" })}>
                {tabError}
              </LedgerFault>
            ) : repos.length === 0 ? (
              <LedgerEmpty>
                <span className="inline-flex flex-wrap items-center gap-3">
                  <span>{t("enterprise.workspaceDetail.noRepos")}</span>
                  <Button size="sm" variant="outline" onClick={() => setRepoOpen(true)} className="gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    {t("enterprise.workspaceDetail.addRepo")}
                  </Button>
                </span>
              </LedgerEmpty>
            ) : (
              <>
                {repos.map((repo, i) => (
                  <LedgerRow key={repo.id}>
                    <LedgerCell>
                      <Serial>{`R${String(i + 1).padStart(2, "0")}`}</Serial>
                    </LedgerCell>
                    <LedgerCell className="truncate text-sm font-medium text-foreground">
                      {repo.name}
                    </LedgerCell>
                    <LedgerCell>
                      <Tag>{repo.provider}</Tag>
                    </LedgerCell>
                    <LedgerCell mono className="text-xs text-muted-foreground">
                      <span dir="ltr" className="block truncate">{repo.defaultBranch ?? "main"}</span>
                    </LedgerCell>
                    <LedgerCell mono className="text-xs text-muted-foreground">
                      {repo.declaredRegion}
                    </LedgerCell>
                    <LedgerCell align="end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
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
                    </LedgerCell>
                  </LedgerRow>
                ))}
                <LedgerFooter right={`${repos.length} RECORDS`} />
              </>
            )}
          </Ledger>
        </section>
      )}

      {activeTab === "cases" && (
        <section className="space-y-3">
          <TabHeader
            label={t("enterprise.workspaceDetail.cases")}
            action={
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  placeholder={t("enterprise.workspaceDetail.searchCases", { defaultValue: "Filter by path, student, or case ID…" })}
                  aria-label={t("enterprise.workspaceDetail.searchCases", { defaultValue: "Filter by path, student, or case ID…" })}
                  className="h-9 bg-card font-mono text-xs ps-9"
                />
              </div>
            }
          />
          <Ledger columns={CASE_COLS}>
            <LedgerHead
              cells={[
                t("enterprise.workspaceDetail.colCase", { defaultValue: "Case" }),
                t("enterprise.workspaceDetail.colPair", { defaultValue: "Artifacts" }),
                t("enterprise.workspaceDetail.colScore", { defaultValue: "Score" }),
                t("enterprise.workspaceDetail.colVerdict", { defaultValue: "Verdict" }),
                t("enterprise.workspaceDetail.colType", { defaultValue: "Clone type" }),
                t("enterprise.workspaceDetail.colStatus", { defaultValue: "Status" }),
                "",
              ]}
              aligns={["start", "start", "end", "start", "start", "start", "end"]}
            />
            {loadingTab ? (
              <LedgerSkeleton rows={5} />
            ) : tabError ? (
              <LedgerFault onRetry={reloadTab} retryLabel={t("enterprise.common.retry", { defaultValue: "Retry" })}>
                {tabError}
              </LedgerFault>
            ) : filteredCases.length === 0 ? (
              <LedgerEmpty>{t("enterprise.workspaceDetail.noCases")}</LedgerEmpty>
            ) : (
              <>
                {filteredCases.map((c) => {
                  const pathA = c.match?.artifactA?.logicalPath ?? "—";
                  const pathB = c.match?.artifactB?.logicalPath ?? "—";
                  const score = Math.round(c.confidenceScore);
                  return (
                    <LedgerRow key={c.id} to={`/enterprise/cases/${c.id}`}>
                      <LedgerCell>
                        <div className="flex items-center gap-2">
                          <span
                            role="img"
                            aria-label={c.severity}
                            title={c.severity}
                            className={cn("h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[c.severity] ?? "bg-muted")}
                          />
                          <Serial tone={c.status === "confirmed_clone" ? "primary" : "muted"}>
                            C-{c.id}
                          </Serial>
                        </div>
                      </LedgerCell>
                      <LedgerCell>
                        <PathPair a={pathA} b={pathB} />
                      </LedgerCell>
                      <LedgerCell align="end">
                        <ScoreMeter value={score} />
                      </LedgerCell>
                      <LedgerCell>
                        <Verdict score={score} />
                      </LedgerCell>
                      <LedgerCell>
                        <Tag>{c.cloneType.replace(/_/g, " ")}</Tag>
                      </LedgerCell>
                      <LedgerCell>
                        <StatusTag tone={STATUS_TONE[c.status] ?? "muted"}>
                          {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                        </StatusTag>
                      </LedgerCell>
                      <LedgerCell align="end">
                        <span className="inline-flex items-center text-primary">
                          <span className="sr-only">{t("enterprise.workspaceDetail.viewCase")}</span>
                          <ChevronRight className={cn("h-4 w-4", isRTL && "rotate-180")} aria-hidden />
                        </span>
                      </LedgerCell>
                    </LedgerRow>
                  );
                })}
                <LedgerFooter
                  left={t("enterprise.workspaceDetail.showing", { defaultValue: "Showing" })}
                  right={`${filteredCases.length} / ${cases.length}`}
                />
              </>
            )}
          </Ledger>
        </section>
      )}

      {activeTab === "members" && (
        <section className="space-y-3">
          <TabHeader
            label={t("enterprise.workspaceDetail.members")}
            action={
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setMemberOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("enterprise.workspaceDetail.addMember")}
              </Button>
            }
          />
          <Ledger columns={MEMBER_COLS}>
            <LedgerHead
              cells={[
                "#",
                t("enterprise.workspaceDetail.colUser", { defaultValue: "User" }),
                t("enterprise.workspaceDetail.colLastActive", { defaultValue: "Last active" }),
                t("enterprise.workspaceDetail.colRole", { defaultValue: "Role" }),
              ]}
            />
            {loadingTab ? (
              <LedgerSkeleton rows={4} />
            ) : tabError ? (
              <LedgerFault onRetry={reloadTab} retryLabel={t("enterprise.common.retry", { defaultValue: "Retry" })}>
                {tabError}
              </LedgerFault>
            ) : members.length === 0 ? (
              <LedgerEmpty>{t("enterprise.workspaceDetail.noMembers")}</LedgerEmpty>
            ) : (
              <>
                {members.map((m) => (
                  <LedgerRow key={m.id}>
                    <LedgerCell>
                      <Serial>{m.legacyUserId}</Serial>
                    </LedgerCell>
                    <LedgerCell className="text-sm font-medium text-foreground">
                      {t("enterprise.workspaceDetail.userHash", { defaultValue: "User #" })}
                      <span className="font-mono">{m.legacyUserId}</span>
                    </LedgerCell>
                    <LedgerCell mono className="text-xs text-muted-foreground">
                      {m.lastActiveAt ? new Date(m.lastActiveAt).toLocaleDateString() : "—"}
                    </LedgerCell>
                    <LedgerCell>
                      <Tag tone={ROLE_TONE[m.role] ?? "muted"}>{m.role}</Tag>
                    </LedgerCell>
                  </LedgerRow>
                ))}
                <LedgerFooter right={`${members.length} RECORDS`} />
              </>
            )}
          </Ledger>
        </section>
      )}

      {/* Create repository dialog — margin-label fields */}
      <Dialog open={repoOpen} onOpenChange={setRepoOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.workspaceDetail.addRepo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FieldSheet>
              <Field label={t("enterprise.workspaceDetail.repoNameLabel")} align="center">
                <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
              </Field>
              <Field label={t("enterprise.workspaceDetail.providerLabel")} align="center">
                <Select value={repoProvider} onValueChange={setRepoProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">local</SelectItem>
                    <SelectItem value="github">github</SelectItem>
                    <SelectItem value="gitlab">gitlab</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {repoProvider === "local" ? (
                <Field label={t("enterprise.workspaceDetail.localPathLabel")} align="center">
                  <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" />
                </Field>
              ) : (
                <Field label={t("enterprise.workspaceDetail.cloneUrlLabel")}>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={repoUrl}
                      onChange={(e) => { setRepoUrl(e.target.value); setProbedBranches([]); setProbeError(""); }}
                      placeholder="https://github.com/owner/repo"
                      dir="ltr"
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
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {probeError}
                    </p>
                  )}
                </Field>
              )}
              <Field label={t("enterprise.workspaceDetail.branchLabel")} align="center">
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
              </Field>
            </FieldSheet>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRepoOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button
                onClick={handleCreateRepo}
                disabled={creatingRepo || !repoName.trim()}
              >
                {creatingRepo && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.workspaceDetail.addRepo")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time webhook credentials dialog — a clear reveal callout */}
      <Dialog open={!!repoSecrets} onOpenChange={(open) => { if (!open) setRepoSecrets(null); }}>
        <DialogContent className="sm:max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {t("enterprise.workspaceDetail.secretsTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Notice tone="warning">{t("enterprise.workspaceDetail.secretsIntro")}</Notice>

            <FieldSheet>
              {([
                { label: t("enterprise.workspaceDetail.secretsWebhookLabel"), value: repoSecrets?.webhookSecret, mono: true },
                { label: t("enterprise.workspaceDetail.secretsGithubLabel"), value: repoSecrets?.githubWebhookUrl, mono: false },
                { label: t("enterprise.workspaceDetail.secretsGitlabLabel"), value: repoSecrets?.gitlabWebhookUrl, mono: false },
              ] as const).map((field) => (
                <Field key={field.label} label={field.label} align="center">
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
                </Field>
              ))}
            </FieldSheet>

            <p className="text-xs text-muted-foreground">{t("enterprise.workspaceDetail.secretsHint")}</p>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setRepoSecrets(null)}>
                {t("enterprise.workspaceDetail.secretsDone")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add member dialog — margin-label fields */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.workspaceDetail.addMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FieldSheet>
              <Field label={t("enterprise.workspaceDetail.userIdLabel")} align="center">
                <Input
                  type="number"
                  min={1}
                  value={memberUserId}
                  onChange={(e) => setMemberUserId(e.target.value)}
                  placeholder="e.g. 2"
                />
              </Field>
              <Field label={t("enterprise.workspaceDetail.roleLabel")} align="center">
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
              </Field>
            </FieldSheet>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setMemberOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button
                onClick={handleAddMember}
                disabled={addingMember || !memberUserId.trim()}
              >
                {addingMember && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.workspaceDetail.addMember")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
