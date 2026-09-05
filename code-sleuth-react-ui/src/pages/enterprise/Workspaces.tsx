import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Masthead, Panel, FieldSheet, Field } from "@/components/dossier/Dossier";
import { Reading, Scale, Tag, type TagTone } from "@/components/bench/Bench";
import { IconChevronRight, IconFilePlus } from "@/components/bench/icons";
import { PageError } from "@/components/common/PageError";
import { PageLoader } from "@/components/common/PageLoader";
import { useLanguage } from "@/context/LanguageContext";
import { createOrganization, createWorkspace, listOrganizations, listWorkspaces } from "@/lib/enterpriseApi";
import type { EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const REGIONS = ["global", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "me-central"];

/** Role identity is carried by the tag text; owners and admins read one step up. */
const roleTone = (role: string): TagTone => (role === "owner" || role === "admin" ? "advisory" : "neutral");

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

const TH = "label text-start font-semibold text-txt-muted";

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
        <Button className="shrink-0">
          <IconFilePlus size={16} />
          {t("enterprise.workspaces.create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="t-h4">{t("enterprise.workspaces.create")}</DialogTitle>
        </DialogHeader>

        {/* Intake form — margin-label fields */}
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

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("enterprise.common.cancel")}</Button>
          <Button onClick={handleCreate} disabled={creating || !wsName.trim()}>
            {t("enterprise.common.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
      <Masthead
        kicker={t("enterprise.workspaces.eyebrow", { defaultValue: "Enterprise admin" })}
        title={t("enterprise.workspaces.title")}
        description={t("enterprise.workspaces.subtitle")}
        actions={createDialog}
      />

      {/* Readings */}
      {!loading && !error && (
        <div className={READINGS_ROW}>
          <Reading label={t("enterprise.workspaces.registered", { defaultValue: "Registered" })} value={workspaces.length} />
          <Reading label={t("enterprise.workspaces.region", { defaultValue: "Region" })} value={regionCount} />
          <Reading label={t("enterprise.workspaces.yourRole", { defaultValue: "Roles" })} value={roleCount} />
          <Reading label={t("enterprise.workspaces.threshold", { defaultValue: "Threshold" })} value={workspaces.length ? `≥ ${meanThreshold}` : "—"} />
        </div>
      )}

      {/* Registry */}
      <Panel
        className="mt-8"
        label={t("enterprise.workspaces.registry", { defaultValue: "Registry" })}
        bodyClassName="p-0"
        actions={
          !loading && !error ? (
            <span className="mono-meta text-txt-muted" dir="ltr">
              {String(workspaces.length).padStart(2, "0")}
            </span>
          ) : undefined
        }
      >
        {loading ? (
          <PageLoader message={t("enterprise.common.loading")} />
        ) : error ? (
          <PageError message={error} />
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <IconFilePlus className="text-txt-muted" />
            <p className="text-[15px] text-txt-primary">{t("enterprise.workspaces.noWorkspaces")}</p>
            <Button onClick={() => setCreateOpen(true)} className="mt-2">
              {t("enterprise.workspaces.create")}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[840px] border-collapse">
              <thead>
                <tr className="h-9 border-b border-bench-hair">
                  <th className={cn(TH, "w-14 ps-5")}>#</th>
                  <th className={cn(TH, "ps-3")}>{t("enterprise.workspaces.title")}</th>
                  <th className={cn(TH, "w-[200px] ps-3")}>{t("enterprise.workspaces.threshold")}</th>
                  <th className={cn(TH, "w-32 ps-3")}>{t("enterprise.workspaces.region")}</th>
                  <th className={cn(TH, "w-32 ps-3")}>{t("enterprise.workspaces.yourRole")}</th>
                  <th className="w-32 pe-5">
                    <span className="sr-only">{t("enterprise.workspaces.viewDetails")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws) => {
                  const pct = Math.round(ws.defaultSimilarityThreshold * 100);
                  return (
                    <tr key={ws.id} className="h-[46px] border-b border-bench-hair last:border-b-0 hover:bg-bench-raised/60">
                      <td className="ps-5 align-middle">
                        <span className="mono-filename text-txt-muted" dir="ltr">{ws.id}</span>
                      </td>
                      <td className="max-w-[360px] ps-3 py-2 align-middle">
                        <span className="block truncate text-[13px] font-semibold text-txt-primary" dir="auto">{ws.name}</span>
                        {ws.description && (
                          <span className="mt-1 block truncate text-[12px] text-txt-muted" dir="auto">{ws.description}</span>
                        )}
                      </td>
                      <td className="ps-3 align-middle">
                        <span className="flex items-center gap-3">
                          <Scale value={pct} quiet={pct < 50} className="w-[110px]" />
                          <span className="mono-value text-txt-primary" dir="ltr">≥ {pct}</span>
                        </span>
                      </td>
                      <td className="mono-filename ps-3 align-middle text-txt-secondary" dir="ltr">{ws.storageRegion}</td>
                      <td className="ps-3 align-middle">
                        {ws.membership && <Tag tone={roleTone(ws.membership.role)}>{ws.membership.role}</Tag>}
                      </td>
                      <td className="pe-5 align-middle text-end">
                        <Link to={`/enterprise/workspaces/${ws.id}`} className="link inline-flex items-center gap-1 text-[12.5px]">
                          {t("enterprise.workspaces.viewDetails")}
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
    </div>
  );
}
