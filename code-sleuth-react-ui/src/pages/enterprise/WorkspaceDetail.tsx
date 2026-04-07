import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FileCode2,
  GitBranch,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Scan,
  Shield,
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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import {
  createRepository,
  listCases,
  listMembers,
  listRepositories,
  listWorkspaces,
  triggerScan,
} from "@/lib/enterpriseApi";
import type {
  EnterpriseCase,
  EnterpriseRepository,
  EnterpriseWorkspace,
  WorkspaceMembership,
} from "@/types/enterprise";
import { cn } from "@/lib/utils";

type Tab = "repositories" | "cases" | "members";

const STATUS_META: Record<string, { label: string; labelAr: string; cls: string }> = {
  open:            { label: "Open",            labelAr: "مفتوحة",       cls: "bg-blue-500/15 text-blue-600" },
  in_review:       { label: "In Review",       labelAr: "قيد المراجعة",  cls: "bg-yellow-500/15 text-yellow-600" },
  confirmed_clone: { label: "Confirmed Clone", labelAr: "كلون مؤكد",    cls: "bg-destructive/15 text-destructive" },
  false_positive:  { label: "False Positive",  labelAr: "إيجابية خاطئة",cls: "bg-muted text-muted-foreground" },
  resolved:        { label: "Resolved",        labelAr: "محلولة",       cls: "bg-success/15 text-success" },
  dismissed:       { label: "Dismissed",       labelAr: "مرفوضة",       cls: "bg-muted text-muted-foreground" },
};

const SEV_META: Record<string, { cls: string }> = {
  critical: { cls: "bg-destructive/15 text-destructive" },
  high:     { cls: "bg-orange-500/15 text-orange-600" },
  medium:   { cls: "bg-yellow-500/15 text-yellow-600" },
  low:      { cls: "bg-blue-500/15 text-blue-600" },
};

const ROLE_CLS: Record<string, string> = {
  owner:    "bg-primary/15 text-primary",
  admin:    "bg-destructive/15 text-destructive",
  manager:  "bg-orange-500/15 text-orange-600",
  reviewer: "bg-blue-500/15 text-blue-600",
  student:  "bg-muted text-muted-foreground",
};

const PROVIDER_ICON: Record<string, string> = {
  github: "GH",
  gitlab: "GL",
  local:  "LO",
};

export default function WorkspaceDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const wsId = Number(workspaceId);
  const { language, isRTL } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const ar = language === "ar";

  const [workspace, setWorkspace] = useState<EnterpriseWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("repositories");

  const [repos, setRepos] = useState<EnterpriseRepository[]>([]);
  const [cases, setCases] = useState<EnterpriseCase[]>([]);
  const [members, setMembers] = useState<WorkspaceMembership[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const [scanning, setScanningId] = useState<number | null>(null);

  // Create repo dialog
  const [repoOpen, setRepoOpen] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [repoProvider, setRepoProvider] = useState("local");
  const [repoPath, setRepoPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [creatingRepo, setCreatingRepo] = useState(false);

  const copy = ar
    ? {
        back: "مساحات العمل",
        repositories: "المستودعات",
        cases: "قضايا المراجعة",
        members: "الأعضاء",
        addRepo: "إضافة مستودع",
        scan: "فحص",
        scanning: "جارٍ الفحص...",
        noRepos: "لا توجد مستودعات. أضف واحداً للبدء.",
        noCases: "لا توجد قضايا مراجعة بعد.",
        noMembers: "لا يوجد أعضاء.",
        severity: "الخطورة",
        status: "الحالة",
        confidence: "الثقة",
        cloneType: "نوع الكلون",
        viewCase: "عرض القضية",
        repoNameLabel: "اسم المستودع",
        providerLabel: "مزود",
        localPathLabel: "المسار المحلي",
        cloneUrlLabel: "رابط الاستنساخ",
        branchLabel: "الفرع الافتراضي",
        cancel: "إلغاء",
        createRepo: "إضافة",
      }
    : {
        back: "Workspaces",
        repositories: "Repositories",
        cases: "Review Cases",
        members: "Members",
        addRepo: "Add Repository",
        scan: "Scan",
        scanning: "Scanning...",
        noRepos: "No repositories. Add one to get started.",
        noCases: "No review cases yet.",
        noMembers: "No members.",
        severity: "Severity",
        status: "Status",
        confidence: "Confidence",
        cloneType: "Clone type",
        viewCase: "View case",
        repoNameLabel: "Repository name",
        providerLabel: "Provider",
        localPathLabel: "Local path",
        cloneUrlLabel: "Clone URL",
        branchLabel: "Default branch",
        cancel: "Cancel",
        createRepo: "Add",
      };

  // Load workspace info
  useEffect(() => {
    listWorkspaces().then((list) => {
      const ws = list.find((w) => w.id === wsId);
      if (ws) setWorkspace(ws);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, language]);

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
      await triggerScan(repoId, { branch: repoBranch });
      toast({
        title: ar ? "تم إطلاق الفحص" : "Scan queued",
        description: ar ? "جارٍ معالجة الفحص في الخلفية." : "Scan is processing in the background.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: ar ? "فشل" : "Failed",
        description: (e as { message?: string })?.message ?? String(e),
      });
    } finally {
      setScanningId(null);
    }
  };

  const handleCreateRepo = async () => {
    if (!repoName.trim()) return;
    setCreatingRepo(true);
    try {
      const { item } = await createRepository(wsId, {
        name: repoName.trim(),
        provider: repoProvider,
        localPath: repoPath.trim() || undefined,
        cloneUrl: repoUrl.trim() || undefined,
        defaultBranch: repoBranch.trim() || "main",
      });
      setRepos((prev) => [item, ...prev]);
      setRepoOpen(false);
      setRepoName(""); setRepoPath(""); setRepoUrl(""); setRepoBranch("main");
      toast({ title: ar ? "تمت الإضافة" : "Repository added" });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: ar ? "فشل" : "Failed",
        description: (e as { message?: string })?.message ?? String(e),
      });
    } finally {
      setCreatingRepo(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Scan }> = [
    { id: "repositories", label: copy.repositories, icon: GitBranch },
    { id: "cases",        label: copy.cases,        icon: Shield },
    { id: "members",      label: copy.members,      icon: Users },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate("/enterprise/workspaces")}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {copy.back}
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{workspace?.name ?? `#${wsId}`}</span>
      </div>

      {/* Workspace header */}
      {workspace && (
        <div className="card-premium p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{workspace.name}</h1>
              {workspace.description && (
                <p className="mt-1 text-sm text-muted-foreground">{workspace.description}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-primary" />
                {Math.round(workspace.defaultSimilarityThreshold * 100)}%
              </span>
              <span className="flex items-center gap-1">
                <FileCode2 className="h-3 w-3 text-primary" />
                {workspace.storageRegion}
              </span>
            </div>
          </div>
        </div>
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
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : tabError ? (
        <div className="flex items-center justify-center gap-2 py-12 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {tabError}
        </div>
      ) : (
        <>
          {/* Repositories tab */}
          {activeTab === "repositories" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" className="gap-2" onClick={() => setRepoOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {copy.addRepo}
                </Button>
              </div>

              {repos.length === 0 ? (
                <div className="card-premium py-14 flex flex-col items-center gap-3 text-center">
                  <GitBranch className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{copy.noRepos}</p>
                  <Button size="sm" variant="outline" onClick={() => setRepoOpen(true)} className="gap-2">
                    <Plus className="h-3.5 w-3.5" />{copy.addRepo}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <div key={repo.id} className="card-premium flex items-center gap-4 px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                        {PROVIDER_ICON[repo.provider] ?? "??"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground text-sm">{repo.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {repo.provider} · {repo.defaultBranch ?? "main"} · {repo.declaredRegion}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        disabled={scanning === repo.id}
                        onClick={() => handleTriggerScan(repo.id)}
                      >
                        {scanning === repo.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {scanning === repo.id ? copy.scanning : copy.scan}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cases tab */}
          {activeTab === "cases" && (
            <div className="space-y-3">
              {cases.length === 0 ? (
                <div className="card-premium py-14 flex flex-col items-center gap-3 text-center">
                  <Shield className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{copy.noCases}</p>
                </div>
              ) : (
                cases.map((c) => {
                  const sm = STATUS_META[c.status] ?? STATUS_META.open;
                  const sv = SEV_META[c.severity] ?? SEV_META.medium;
                  return (
                    <div key={c.id} className="card-premium px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            #{c.id} ·{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.match.artifactA.logicalPath}
                            </span>{" "}
                            ↔{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.match.artifactB.logicalPath}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.cloneType.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sv.cls)}>
                            {c.severity}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sm.cls)}>
                            {ar ? sm.labelAr : sm.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {c.confidenceScore.toFixed(1)}%
                          </span>
                          <Link
                            to={`/enterprise/cases/${c.id}`}
                            className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                          >
                            {copy.viewCase}
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Members tab */}
          {activeTab === "members" && (
            <div className="space-y-2">
              {members.length === 0 ? (
                <div className="card-premium py-14 flex flex-col items-center gap-2 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{copy.noMembers}</p>
                </div>
              ) : (
                members.map((m) => (
                  <div key={m.id} className="card-premium flex items-center gap-4 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {m.legacyUserId}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">User #{m.legacyUserId}</p>
                      {m.lastActiveAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.lastActiveAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        ROLE_CLS[m.role] ?? "bg-muted text-muted-foreground",
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
            <DialogTitle>{copy.addRepo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{copy.repoNameLabel}</Label>
              <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{copy.providerLabel}</Label>
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
                <Label>{copy.localPathLabel}</Label>
                <Input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/path/to/repo" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{copy.cloneUrlLabel}</Label>
                <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/..." />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{copy.branchLabel}</Label>
              <Input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRepoOpen(false)}>{copy.cancel}</Button>
              <Button onClick={handleCreateRepo} disabled={creatingRepo || !repoName.trim()}>
                {creatingRepo && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {copy.createRepo}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
