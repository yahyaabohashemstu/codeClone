import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { toast } from "sonner";
import { useLanguage } from "@/context/LanguageContext";
import { createOrganization, createWorkspace, listOrganizations, listWorkspaces } from "@/lib/enterpriseApi";
import type { EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const REGIONS = ["global", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "me-central"];

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-primary/15 text-primary border-primary/25",
  admin: "bg-destructive/15 text-destructive border-destructive/25",
  manager: "bg-warning/15 text-warning border-warning/25",
  reviewer: "bg-accent/15 text-accent border-accent/25",
  student: "bg-muted text-muted-foreground border-border/60",
};

export default function Workspaces() {
  const { isRTL } = useLanguage();
  const { t } = useTranslation("enterprise");

  const [workspaces, setWorkspaces] = useState<EnterpriseWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [wsName, setWsName] = useState("");
  const [wsDesc, setWsDesc] = useState("");
  const [wsRegion, setWsRegion] = useState("global");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(e?.message ?? t("enterprise.workspaces.errorMsg")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

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
      toast.success(t("enterprise.workspaces.created"), { description: t("enterprise.workspaces.createdDesc", { name: created.name }) });
    } catch (e: unknown) {
      toast.error(t("enterprise.workspaces.creationFailed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
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
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <Building2 className="h-3 w-3" />
              {t("enterprise.workspaces.eyebrow", { defaultValue: "Enterprise admin" })}
            </div>
            <h1 className="mt-3 t-h2">{t("enterprise.workspaces.title")}</h1>
            <p className="mt-1 max-w-[60ch] t-body">{t("enterprise.workspaces.subtitle")}</p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-11 shrink-0 gap-2 px-5 text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
                <Plus className="h-4 w-4" />
                {t("enterprise.workspaces.create")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
              <DialogHeader>
                <DialogTitle>{t("enterprise.workspaces.create")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>{t("enterprise.workspaces.orgLabel")}</Label>
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder={t("enterprise.workspaces.orgPlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("enterprise.workspaces.wsLabel")}</Label>
                  <Input
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    placeholder={t("enterprise.workspaces.wsPlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("enterprise.workspaces.descLabel")}</Label>
                  <Input
                    value={wsDesc}
                    onChange={(e) => setWsDesc(e.target.value)}
                    placeholder={t("enterprise.workspaces.descPlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("enterprise.workspaces.regionLabel")}</Label>
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
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("enterprise.common.cancel")}</Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !wsName.trim()}
                    className="text-white"
                    style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
                  >
                    {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {t("enterprise.common.confirm")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Body */}
      {loading ? (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-muted-foreground"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("enterprise.common.loading")}
        </div>
      ) : error ? (
        <div
          className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-12 text-destructive"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : workspaces.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card py-16 text-center"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
          >
            <Folder className="h-7 w-7" />
          </div>
          <p className="t-body">{t("enterprise.workspaces.noWorkspaces")}</p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-2 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("enterprise.workspaces.create")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} to={`/enterprise/workspaces/${ws.id}`} className="group block">
              <div
                className="relative h-full overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
                style={{ boxShadow: "var(--card-shadow-rest)" }}
              >
                {/* Gradient accent line on hover */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 scale-x-0 transform transition-transform duration-300 group-hover:scale-x-100"
                  style={{ background: "var(--gradient-brand)", transformOrigin: isRTL ? "right" : "left" }}
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        fontFamily: "var(--font-mono)",
                        background: "hsl(var(--secondary))",
                        color: "hsl(var(--secondary-foreground))",
                      }}
                    >
                      #{ws.id}
                    </div>
                    <h3 className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                      {ws.name}
                    </h3>
                    {ws.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {ws.description}
                      </p>
                    )}
                  </div>
                  {ws.membership && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                        ROLE_BADGE[ws.membership.role] ?? "bg-muted text-muted-foreground border-border/60",
                      )}
                    >
                      {ws.membership.role}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    <span className="font-mono tabular-nums">
                      {Math.round(ws.defaultSimilarityThreshold * 100)}%
                    </span>
                    {t("enterprise.workspaces.threshold")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {ws.storageRegion}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    {t("enterprise.workspaces.viewDetails")}
                    <ChevronRight className={cn("h-3 w-3 transition-transform group-hover:translate-x-0.5", isRTL && "rotate-180 group-hover:-translate-x-0.5")} />
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
