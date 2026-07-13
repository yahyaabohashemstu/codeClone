import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronRight,
  Folder,
  Loader2,
  Plus,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Masthead, FieldSheet, Field, Serial, SectionHead, SpecList } from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import { createOrganization, createWorkspace, listOrganizations, listWorkspaces } from "@/lib/enterpriseApi";
import type { EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const REGIONS = ["global", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "me-central"];

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-primary/15 text-primary border-primary/30",
  admin: "bg-destructive/15 text-destructive border-destructive/30",
  manager: "bg-warning/15 text-foreground border-warning/30",
  reviewer: "bg-accent/15 text-accent border-accent/30",
  student: "bg-muted text-muted-foreground border-border",
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

  const regionCount = useMemo(
    () => new Set(workspaces.map((ws) => ws.storageRegion)).size,
    [workspaces],
  );

  const meanThreshold = useMemo(() => {
    if (workspaces.length === 0) return 0;
    const sum = workspaces.reduce((acc, ws) => acc + ws.defaultSimilarityThreshold, 0);
    return Math.round((sum / workspaces.length) * 100);
  }, [workspaces]);

  const roleCount = useMemo(
    () => new Set(workspaces.map((ws) => ws.membership?.role).filter(Boolean)).size,
    [workspaces],
  );

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

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          {t("enterprise.workspaces.create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t("enterprise.workspaces.create")}</DialogTitle>
        </DialogHeader>

        {/* Intake form — margin-label fields, a printed requisition sheet */}
        <FieldSheet className="mt-2">
          <Field label={t("enterprise.workspaces.orgLabel")} align="center">
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={t("enterprise.workspaces.orgPlaceholder")}
            />
          </Field>
          <Field label={t("enterprise.workspaces.wsLabel")} align="center">
            <Input
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder={t("enterprise.workspaces.wsPlaceholder")}
            />
          </Field>
          <Field label={t("enterprise.workspaces.descLabel")} align="center">
            <Input
              value={wsDesc}
              onChange={(e) => setWsDesc(e.target.value)}
              placeholder={t("enterprise.workspaces.descPlaceholder")}
            />
          </Field>
          <Field label={t("enterprise.workspaces.regionLabel")} align="center">
            <Select value={wsRegion} onValueChange={setWsRegion}>
              <SelectTrigger className="font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r} className="font-mono text-sm">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldSheet>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("enterprise.common.cancel")}</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !wsName.trim()}
          >
            {creating && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
            {t("enterprise.common.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      <Masthead
        kicker={t("enterprise.workspaces.eyebrow", { defaultValue: "Enterprise admin" })}
        title={t("enterprise.workspaces.title")}
        description={t("enterprise.workspaces.subtitle")}
        actions={createDialog}
        meta={[
          { label: "INDEX", value: <span className="tabular-nums">{workspaces.length}</span> },
          { label: t("enterprise.workspaces.region", { defaultValue: "Region" }), value: <span className="tabular-nums">{regionCount}</span> },
          {
            label: "STATUS",
            value: loading ? (
              <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-foreground">SYNC</span>
            ) : error ? (
              <span className="text-destructive">ERROR</span>
            ) : (
              <span className="text-success">LIVE</span>
            ),
          },
        ]}
      />

      {/* Registry — ruled §-section ledger + marginalia summary */}
      <div className="mt-10 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <SectionHead
            marker="§"
            title={t("enterprise.workspaces.registry", { defaultValue: "Registry" })}
            aside={
              loading
                ? "SYNC"
                : error
                  ? "ERROR"
                  : `Nº ${String(workspaces.length).padStart(3, "0")}`
            }
          />

          {loading ? (
            <div className="flex items-center gap-2 border-b border-border py-16 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("enterprise.common.loading")}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 border-s-2 border-destructive bg-destructive/5 px-4 py-5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-start gap-4 border-b border-border py-14">
              <div className="flex items-center gap-2.5 text-muted-foreground">
                <Folder className="h-5 w-5" />
                <span className="font-mono text-xs uppercase tracking-[0.14em]">
                  {t("enterprise.workspaces.noWorkspaces")}
                </span>
              </div>
              <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                {t("enterprise.workspaces.create")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Ledger column header — heavy foreground rule, no fill */}
              <div className="hidden items-center gap-4 border-b-2 border-foreground pb-2 sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_7rem_6rem_1.25rem]">
                <span className="t-label">#</span>
                <span className="t-label">{t("enterprise.workspaces.title")}</span>
                <span className="t-label">{t("enterprise.workspaces.threshold")}</span>
                <span className="t-label">{t("enterprise.workspaces.region")}</span>
                <span className="t-label">{t("enterprise.workspaces.yourRole")}</span>
                <span />
              </div>

              {/* Ledger rows — hairline separated */}
              <div className="divide-y divide-border">
                {workspaces.map((ws) => (
                  <Link
                    key={ws.id}
                    to={`/enterprise/workspaces/${ws.id}`}
                    className="group grid grid-cols-1 gap-x-4 gap-y-2.5 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_7rem_6rem_1.25rem] sm:items-center"
                  >
                    {/* Serial / case number */}
                    <Serial tone="muted" className="group-hover:border-primary/40 group-hover:text-foreground">
                      {ws.id}
                    </Serial>

                    {/* Name + description */}
                    <div className="min-w-0">
                      <h3 className="truncate t-h5 transition-colors group-hover:text-foreground">
                        {ws.name}
                      </h3>
                      {ws.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {ws.description}
                        </p>
                      )}
                    </div>

                    {/* Threshold */}
                    <div className="font-mono text-sm tabular-nums text-foreground">
                      <span className="t-label me-2 sm:hidden">{t("enterprise.workspaces.threshold")}</span>
                      {Math.round(ws.defaultSimilarityThreshold * 100)}%
                    </div>

                    {/* Region */}
                    <div className="font-mono text-xs text-muted-foreground">
                      <span className="t-label me-2 sm:hidden">{t("enterprise.workspaces.region")}</span>
                      {ws.storageRegion}
                    </div>

                    {/* Role */}
                    <div>
                      {ws.membership && (
                        <span
                          className={cn(
                            "inline-flex rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                            ROLE_BADGE[ws.membership.role] ?? "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {ws.membership.role}
                        </span>
                      )}
                    </div>

                    {/* Chevron */}
                    <ChevronRight
                      className={cn(
                        "hidden h-4 w-4 justify-self-end text-muted-foreground transition-colors group-hover:text-foreground sm:block",
                        isRTL && "rotate-180",
                      )}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Marginalia — registry summary spec sheet, ruled like a case index */}
        {!loading && !error && workspaces.length > 0 && (
          <aside className="lg:border-s lg:border-border lg:ps-8">
            <div className="t-label mb-2.5 text-muted-foreground">
              {t("enterprise.workspaces.summary", { defaultValue: "Summary" })}
            </div>
            <SpecList
              rows={[
                {
                  label: t("enterprise.workspaces.registered", { defaultValue: "Registered" }),
                  value: workspaces.length,
                },
                {
                  label: t("enterprise.workspaces.region", { defaultValue: "Region" }),
                  value: regionCount,
                },
                {
                  label: t("enterprise.workspaces.yourRole", { defaultValue: "Roles" }),
                  value: roleCount,
                },
                {
                  label: t("enterprise.workspaces.threshold", { defaultValue: "Threshold" }),
                  value: `${meanThreshold}%`,
                },
              ]}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
