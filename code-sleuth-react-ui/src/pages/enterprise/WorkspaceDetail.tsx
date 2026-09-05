import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
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
import { Masthead, Panel, FieldSheet, Field, PlatePair, SpecList } from "@/components/dossier/Dossier";
import { Reading, Scale, Tag, type TagTone } from "@/components/bench/Bench";
import { IconChevronLeft, IconChevronRight, IconFilePlus, IconRerun, IconSearch } from "@/components/bench/icons";
import { PageError } from "@/components/common/PageError";
import { PageLoader } from "@/components/common/PageLoader";
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

/** Dispositions take the three tag tones: a confirmed clone is hot, a case still open is advisory. */
const STATUS_TONE: Record<string, TagTone> = {
  open: "advisory",
  in_review: "advisory",
  confirmed_clone: "hot",
  false_positive: "neutral",
  resolved: "neutral",
  dismissed: "neutral",
};

const SEV_TONE: Record<string, TagTone> = {
  critical: "hot",
  high: "hot",
  medium: "advisory",
  low: "neutral",
};

/** Role identity is carried by the tag text; owners and admins read one step up. */
const roleTone = (role: string): TagTone => (role === "owner" || role === "admin" ? "advisory" : "neutral");

const PROVIDER_ICON: Record<string, string> = {
  github: "GH",
  gitlab: "GL",
  local:  "LO",
};

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

const TH = "label text-start font-semibold text-txt-muted";

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

  // Readings
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

  const meta = [
    { label: "SERIAL", value: <span dir="ltr">{`WS-${wsId}`}</span> },
    ...(workspace
      ? [
          { label: "REGION", value: <span dir="ltr">{workspace.storageRegion}</span> },
          { label: "THRESHOLD", value: <span dir="ltr">{`${threshold}%`}</span> },
        ]
      : []),
  ];

  return (
    <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 pb-5 text-[12.5px] text-txt-muted">
        <button
          type="button"
          onClick={() => navigate("/enterprise/workspaces")}
          className="link inline-flex items-center gap-1"
        >
          <IconChevronLeft className="rtl:-scale-x-100" />
          {t("enterprise.workspaceDetail.back")}
        </button>
        <IconChevronRight className="rtl:-scale-x-100" />
        <span className="text-txt-primary" dir="auto">{workspace?.name ?? `#${wsId}`}</span>
      </div>

      <Masthead
        kicker={t("enterprise.workspaceDetail.back")}
        title={workspace?.name ?? `#${wsId}`}
        description={workspace?.description || undefined}
        meta={meta}
      />

      {/* Readings */}
      <div className={READINGS_ROW}>
        <Reading label={t("enterprise.workspaceDetail.statRepos", { defaultValue: "Repositories" })} value={repos.length} />
        <Reading label={t("enterprise.workspaceDetail.statCases", { defaultValue: "Cases" })} value={cases.length} />
        <Reading
          label={t("enterprise.workspaceDetail.statFlagged", { defaultValue: "Flagged ≥ threshold" })}
          value={<span className={cn(flaggedCount > 0 && "text-signal-bench")}>{flaggedCount}</span>}
          note={workspace ? `≥ ${threshold}` : undefined}
        />
        <Reading label={t("enterprise.workspaceDetail.statReviewed", { defaultValue: "Reviewed" })} value={reviewedCount} note={`/ ${cases.length}`} />
      </div>

      {/* Record */}
      {workspace && (
        <Panel className="mt-8" label={t("enterprise.workspaceDetail.caseFile", { defaultValue: "Record" })}>
          <SpecList
            rows={[
              { label: t("enterprise.workspaceDetail.specSlug", { defaultValue: "Slug" }), value: <span dir="ltr">{workspace.slug}</span> },
              { label: t("enterprise.workspaceDetail.specRegion", { defaultValue: "Storage region" }), value: <span dir="ltr">{workspace.storageRegion}</span> },
              { label: t("enterprise.workspaceDetail.specSimilarity", { defaultValue: "Similarity threshold" }), value: <span dir="ltr">{`${threshold}%`}</span> },
              { label: t("enterprise.workspaceDetail.specSemantic", { defaultValue: "Semantic threshold" }), value: <span dir="ltr">{`${Math.round(workspace.semanticThreshold * 100)}%`}</span> },
              { label: t("enterprise.workspaceDetail.specRole", { defaultValue: "Your role" }), value: workspace.membership ? <Tag tone={roleTone(workspace.membership.role)}>{workspace.membership.role}</Tag> : "—" },
              { label: t("enterprise.workspaceDetail.specCreated", { defaultValue: "Opened" }), value: <span dir="ltr">{workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "—"}</span> },
            ]}
          />
        </Panel>
      )}

      {/* Tabs — segmented, with live counts */}
      <div className="mt-8">
        <div className="segment-group" role="tablist" aria-label="Workspace tabs">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn("segment gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", active && "is-on")}
              >
                {tab.label}
                <span className="mono-meta-sm opacity-70" dir="ltr">{tabCounts[tab.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-8">
        {loadingTab ? (
          <PageLoader message={t("enterprise.common.loading")} />
        ) : tabError ? (
          <PageError message={tabError} />
        ) : (
          <>
            {/* Repositories — a ruled ledger */}
            {activeTab === "repositories" && (
              <Panel
                label={t("enterprise.workspaceDetail.repositories")}
                bodyClassName="p-0"
                actions={
                  <Button size="sm" onClick={() => setRepoOpen(true)}>
                    <IconFilePlus size={16} />
                    {t("enterprise.workspaceDetail.addRepo")}
                  </Button>
                }
              >
                {repos.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
                    <IconFilePlus className="text-txt-muted" />
                    <p className="text-[15px] text-txt-primary">{t("enterprise.workspaceDetail.noRepos")}</p>
                    <Button size="sm" variant="outline" onClick={() => setRepoOpen(true)} className="mt-2">
                      {t("enterprise.workspaceDetail.addRepo")}
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-bench-hair">
                    {repos.map((repo, i) => (
                      <div key={repo.id} className="flex items-center gap-4 px-5 py-3.5">
                        <span className="mono-ordinal w-8 shrink-0 text-txt-muted" dir="ltr">{`R${String(i + 1).padStart(2, "0")}`}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-txt-primary" dir="auto">{repo.name}</p>
                          <p className="mono-meta mt-1.5 text-txt-muted" dir="ltr">
                            <span className="text-txt-secondary">{PROVIDER_ICON[repo.provider] ?? "??"}</span>
                            {" · "}
                            {repo.defaultBranch ?? "main"}
                            {" · "}
                            {repo.declaredRegion}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={scanning === repo.id}
                          onClick={() => handleTriggerScan(repo.id)}
                        >
                          <IconRerun />
                          {scanning === repo.id ? t("enterprise.workspaceDetail.scanning") : t("enterprise.workspaceDetail.scan")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {/* Cases — a hairline ledger */}
            {activeTab === "cases" && (
              <Panel label={t("enterprise.workspaceDetail.cases")} bodyClassName="p-0">
                {/* Filter row */}
                <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5">
                  <label className="well w-full sm:w-[300px]">
                    <IconSearch className="text-txt-muted" />
                    <input
                      type="search"
                      value={caseSearch}
                      onChange={(e) => setCaseSearch(e.target.value)}
                      placeholder={t("enterprise.workspaceDetail.searchCases", { defaultValue: "Filter by path, student, or case ID…" })}
                      aria-label={t("enterprise.workspaceDetail.searchCases", { defaultValue: "Filter by path, student, or case ID…" })}
                    />
                  </label>
                  <span className="ms-auto text-[12.5px] text-txt-secondary" dir="ltr">
                    {t("enterprise.workspaceDetail.showing", { defaultValue: "Showing" })} {filteredCases.length} / {cases.length}
                  </span>
                </div>

                {filteredCases.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 border-y border-bench-hair px-6 py-20 text-center">
                    <IconFilePlus className="text-txt-muted" />
                    <p className="text-[15px] text-txt-primary">{t("enterprise.workspaceDetail.noCases")}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[900px] border-collapse border-y border-bench-hair">
                      <thead>
                        <tr className="h-9 border-b border-bench-hair">
                          <th className={cn(TH, "w-20 ps-5")}>{t("enterprise.workspaceDetail.colCase", { defaultValue: "Case" })}</th>
                          <th className={cn(TH, "ps-3")}>{t("enterprise.workspaceDetail.colPair", { defaultValue: "Pair" })}</th>
                          <th className={cn(TH, "w-[190px] ps-3")}>{t("enterprise.workspaceDetail.colScore", { defaultValue: "Score" })}</th>
                          <th className={cn(TH, "w-32 ps-3")}>{t("enterprise.workspaceDetail.colType", { defaultValue: "Clone type" })}</th>
                          <th className={cn(TH, "w-[240px] ps-3")}>{t("enterprise.workspaceDetail.colStatus", { defaultValue: "Status" })}</th>
                          <th className="w-28 pe-5">
                            <span className="sr-only">{t("enterprise.workspaceDetail.viewCase")}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCases.map((c) => {
                          const pathA = c.match?.artifactA?.logicalPath ?? "—";
                          const pathB = c.match?.artifactB?.logicalPath ?? "—";
                          const score = Math.round(c.confidenceScore);
                          return (
                            <tr key={c.id} className="h-[46px] border-b border-bench-hair last:border-b-0 hover:bg-bench-raised/60">
                              <td className="ps-5 align-middle">
                                <span className="mono-filename text-txt-muted" dir="ltr">{`C${c.id}`}</span>
                              </td>
                              <td className="max-w-[280px] ps-3 py-2 align-middle">
                                <PlatePair mono a={pathA.split(/[/\\]/).pop() ?? pathA} b={pathB.split(/[/\\]/).pop() ?? pathB} />
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
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <Tag tone={SEV_TONE[c.severity] ?? "neutral"}>{t(`enterprise.severity.${c.severity}`, { defaultValue: c.severity })}</Tag>
                                  <Tag tone={STATUS_TONE[c.status] ?? "neutral"}>{t(`enterprise.status.${c.status}`, { defaultValue: c.status })}</Tag>
                                </span>
                              </td>
                              <td className="pe-5 align-middle text-end">
                                <Link to={`/enterprise/cases/${c.id}`} className="link inline-flex items-center gap-1 text-[12.5px]">
                                  {t("enterprise.workspaceDetail.viewCase")}
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
              </Panel>
            )}

            {/* Members — a ruled roster */}
            {activeTab === "members" && (
              <Panel
                label={t("enterprise.workspaceDetail.members")}
                bodyClassName="p-0"
                actions={
                  <Button size="sm" variant="outline" onClick={() => setMemberOpen(true)}>
                    <IconFilePlus size={16} />
                    {t("enterprise.workspaceDetail.addMember")}
                  </Button>
                }
              >
                {members.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
                    <IconFilePlus className="text-txt-muted" />
                    <p className="text-[15px] text-txt-primary">{t("enterprise.workspaceDetail.noMembers")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-bench-hair">
                    {members.map((m) => (
                      <div key={m.id} className="flex h-[46px] items-center gap-4 px-5">
                        <span className="mono-filename w-12 shrink-0 text-txt-muted" dir="ltr">{m.legacyUserId}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-txt-primary">
                            {t("enterprise.workspaceDetail.userHash", { defaultValue: "User #" })}
                            <span className="mono-value" dir="ltr">{m.legacyUserId}</span>
                          </p>
                        </div>
                        {m.lastActiveAt && (
                          <span className="mono-filename text-txt-muted" dir="ltr">
                            {new Date(m.lastActiveAt).toLocaleDateString()}
                          </span>
                        )}
                        <Tag tone={roleTone(m.role)}>{m.role}</Tag>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            )}
          </>
        )}
      </div>

      {/* Create repository dialog — margin-label fields */}
      <Dialog open={repoOpen} onOpenChange={setRepoOpen}>
        <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="t-h4">{t("enterprise.workspaceDetail.addRepo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FieldSheet>
              <Field label={t("enterprise.workspaceDetail.repoNameLabel")} align="center">
                <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
              </Field>
              <Field label={t("enterprise.workspaceDetail.providerLabel")} align="center">
                <Select value={repoProvider} onValueChange={setRepoProvider}>
                  <SelectTrigger className="font-mono text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">local</SelectItem>
                    <SelectItem value="github">github</SelectItem>
                    <SelectItem value="gitlab">gitlab</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {repoProvider === "local" ? (
                <Field label={t("enterprise.workspaceDetail.localPathLabel")} align="center">
                  <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" dir="ltr" className="font-mono text-xs" />
                </Field>
              ) : (
                <Field label={t("enterprise.workspaceDetail.cloneUrlLabel")}>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 font-mono text-xs"
                      value={repoUrl}
                      onChange={(e) => { setRepoUrl(e.target.value); setProbedBranches([]); setProbeError(""); }}
                      placeholder="https://github.com/owner/repo"
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0"
                      disabled={probing || !repoUrl.trim()}
                      onClick={handleProbeUrl}
                    >
                      <IconRerun />
                      {t("enterprise.workspaceDetail.probe")}
                    </Button>
                  </div>
                  {probeError && (
                    <p role="alert" className="mt-2 flex items-center gap-2 text-[12.5px] text-signal-bench">
                      <span aria-hidden className="lamp is-on" />
                      {probeError}
                    </p>
                  )}
                </Field>
              )}
              <Field label={t("enterprise.workspaceDetail.branchLabel")} align="center">
                {probedBranches.length > 0 ? (
                  <Select value={repoBranch} onValueChange={setRepoBranch}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue placeholder={t("enterprise.workspaceDetail.selectBranch")} />
                    </SelectTrigger>
                    <SelectContent>
                      {probedBranches.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" dir="ltr" className="font-mono text-xs" />
                )}
              </Field>
            </FieldSheet>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setRepoOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleCreateRepo} disabled={creatingRepo || !repoName.trim()}>
                {t("enterprise.workspaceDetail.addRepo")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time webhook credentials dialog */}
      <Dialog open={!!repoSecrets} onOpenChange={(open) => { if (!open) setRepoSecrets(null); }}>
        <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="t-h4">{t("enterprise.workspaceDetail.secretsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div role="status" className="flex items-start gap-3 border border-signal px-4 py-3">
              <span aria-hidden className="lamp is-on mt-0.5" />
              <span className="text-[13px] leading-relaxed text-txt-primary">{t("enterprise.workspaceDetail.secretsIntro")}</span>
            </div>

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
                      className="h-10 shrink-0"
                      onClick={() => field.value && copyToClipboard(field.value)}
                    >
                      <Copy strokeWidth={1.5} />
                      {t("enterprise.workspaceDetail.copy")}
                    </Button>
                  </div>
                </Field>
              ))}
            </FieldSheet>

            <p className="text-[12.5px] leading-relaxed text-txt-muted">{t("enterprise.workspaceDetail.secretsHint")}</p>

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
        <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="t-h4">{t("enterprise.workspaceDetail.addMember")}</DialogTitle>
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
                  dir="ltr"
                  className="font-mono"
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
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setMemberOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleAddMember} disabled={addingMember || !memberUserId.trim()}>
                {t("enterprise.workspaceDetail.addMember")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
