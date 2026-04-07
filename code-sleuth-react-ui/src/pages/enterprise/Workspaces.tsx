import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Folder,
  Loader2,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { createOrganization, createWorkspace, listOrganizations, listWorkspaces } from "@/lib/enterpriseApi";
import type { EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const REGIONS = ["global", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "me-central"];

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-primary/15 text-primary",
  admin: "bg-destructive/15 text-destructive",
  manager: "bg-orange-500/15 text-orange-600",
  reviewer: "bg-blue-500/15 text-blue-600",
  student: "bg-muted text-muted-foreground",
};

export default function Workspaces() {
  const { language, isRTL } = useLanguage();
  const { toast } = useToast();
  const ar = language === "ar";

  const [workspaces, setWorkspaces] = useState<EnterpriseWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [wsName, setWsName] = useState("");
  const [wsDesc, setWsDesc] = useState("");
  const [wsRegion, setWsRegion] = useState("global");
  const [creating, setCreating] = useState(false);

  const copy = ar
    ? {
        title: "مساحات العمل",
        subtitle: "إدارة مساحات العمل والمستودعات وسير مراجعة الكود",
        create: "مساحة عمل جديدة",
        orgLabel: "اسم المؤسسة (جديدة أو موجودة)",
        wsLabel: "اسم مساحة العمل",
        descLabel: "الوصف (اختياري)",
        regionLabel: "منطقة التخزين",
        cancel: "إلغاء",
        confirm: "إنشاء",
        noWorkspaces: "لا توجد مساحات عمل بعد.",
        members: "أعضاء",
        repositories: "مستودعات",
        cases: "قضايا",
        viewDetails: "عرض التفاصيل",
        yourRole: "دورك",
        threshold: "عتبة التشابه",
        region: "المنطقة",
        loading: "جاري التحميل...",
        errorMsg: "فشل تحميل مساحات العمل",
      }
    : {
        title: "Workspaces",
        subtitle: "Manage workspaces, repositories, and code review workflows",
        create: "New Workspace",
        orgLabel: "Organization name (new or existing)",
        wsLabel: "Workspace name",
        descLabel: "Description (optional)",
        regionLabel: "Storage region",
        cancel: "Cancel",
        confirm: "Create",
        noWorkspaces: "No workspaces yet.",
        members: "members",
        repositories: "repositories",
        cases: "cases",
        viewDetails: "View details",
        yourRole: "Your role",
        threshold: "Threshold",
        region: "Region",
        loading: "Loading...",
        errorMsg: "Failed to load workspaces",
      };

  useEffect(() => {
    setLoading(true);
    listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(e?.message ?? copy.errorMsg))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const handleCreate = async () => {
    if (!wsName.trim()) return;
    setCreating(true);
    try {
      let orgId: number;
      const orgs = await listOrganizations();
      const existing = orgs.find(
        (o) => o.name.toLowerCase() === orgName.trim().toLowerCase(),
      );
      if (existing) {
        orgId = existing.id;
      } else {
        const newOrg = await createOrganization({
          name: orgName.trim() || wsName.trim(),
          storageRegion: wsRegion,
        });
        orgId = newOrg.id;
      }

      const created = await createWorkspace({
        organizationId: orgId,
        name: wsName.trim(),
        description: wsDesc.trim() || undefined,
        storageRegion: wsRegion,
      });
      setWorkspaces((prev) => [created, ...prev]);
      setCreateOpen(false);
      setOrgName("");
      setWsName("");
      setWsDesc("");
      toast({
        title: ar ? "تم الإنشاء" : "Created",
        description: ar
          ? `مساحة العمل "${created.name}" جاهزة.`
          : `Workspace "${created.name}" is ready.`,
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: ar ? "فشل الإنشاء" : "Creation failed",
        description: (e as { message?: string })?.message ?? String(e),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Building2 className="h-6 w-6 text-primary" />
            {copy.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              {copy.create}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{copy.create}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>{copy.orgLabel}</Label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={ar ? "مثال: جامعتي" : "e.g. My University"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{copy.wsLabel}</Label>
                <Input
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder={ar ? "مثال: مشروع التخرج 2025" : "e.g. Graduation Project 2025"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{copy.descLabel}</Label>
                <Input
                  value={wsDesc}
                  onChange={(e) => setWsDesc(e.target.value)}
                  placeholder={ar ? "وصف اختياري..." : "Optional description..."}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{copy.regionLabel}</Label>
                <Select value={wsRegion} onValueChange={setWsRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>{copy.cancel}</Button>
                <Button onClick={handleCreate} disabled={creating || !wsName.trim()}>
                  {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {copy.confirm}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          {copy.loading}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive py-12 justify-center">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="card-premium flex flex-col items-center gap-4 py-16 text-center">
          <Folder className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">{copy.noWorkspaces}</p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm" className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            {copy.create}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} to={`/enterprise/workspaces/${ws.id}`} className="block group">
              <div className="card-premium h-full p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-glow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-foreground group-hover:text-primary transition-colors">
                      {ws.name}
                    </h3>
                    {ws.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {ws.description}
                      </p>
                    )}
                  </div>
                  {ws.membership && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        ROLE_BADGE[ws.membership.role] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {ws.membership.role}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    {Math.round(ws.defaultSimilarityThreshold * 100)}% {copy.threshold}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {ws.storageRegion}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    {copy.viewDetails}
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
