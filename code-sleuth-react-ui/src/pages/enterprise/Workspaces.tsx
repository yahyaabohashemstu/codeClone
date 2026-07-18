import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2, Plus } from "lucide-react";
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
import {
  Masthead,
  FieldSheet,
  Field,
  Serial,
  Meter,
  Tag,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
  LedgerFault,
  LedgerSkeleton,
  DocFrame,
  RailReadings,
} from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import { createOrganization, createWorkspace, listOrganizations, listWorkspaces } from "@/lib/enterpriseApi";
import type { EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

const REGIONS = ["global", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "me-central"];

// The register ledger's single grid template — drives head, rows, footer alike.
const LEDGER_COLS = "3rem minmax(0,1fr) 9.5rem 7rem 6.5rem 1.5rem";

// Membership role → a NEUTRAL categorical tag tone. Role is a category, not a
// state, severity, or similarity band, so it never borrows --primary/--warning/
// --destructive/--success — those stay reserved for real action/state signals.
// Elevated roles read in foreground ink (accent); member roles in muted ink.
const ROLE_TONE: Record<string, "accent" | "muted"> = {
  owner: "accent",
  admin: "accent",
  manager: "accent",
  reviewer: "muted",
  student: "muted",
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listWorkspaces()
      .then(setWorkspaces)
      .catch((e) => setError(e?.message ?? t("enterprise.workspaces.errorMsg")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const regionCount = useMemo(
    () => new Set(workspaces.map((ws) => ws.storageRegion)).size,
    [workspaces],
  );

  // Median default threshold across the register — a distribution reading for the footer.
  const medianThreshold = useMemo(() => {
    if (workspaces.length === 0) return 0;
    const vals = workspaces
      .map((ws) => Math.round(ws.defaultSimilarityThreshold * 100))
      .sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  }, [workspaces]);

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
      />

      {/* Instrument-document body — register readings live in the margin rail,
          the ruled workspace ledger fills the wide main column. */}
      <DocFrame
        rail={
          <RailReadings
            label={t("enterprise.workspaces.registerLabel", { defaultValue: "Register" })}
            items={[
              { label: "RECORDS", value: loading ? "…" : workspaces.length },
              { label: t("enterprise.workspaces.region", { defaultValue: "Region" }), value: regionCount },
              { label: "MEDIAN", value: `${medianThreshold}%` },
              {
                label: "STATUS",
                value: loading ? "SYNC" : error ? "ERROR" : "LIVE",
                tone: loading ? "warning" : error ? "danger" : "success",
              },
            ]}
          />
        }
      >
        <Ledger columns={LEDGER_COLS}>
          <LedgerHead
            cells={[
              "#",
              t("enterprise.workspaces.name", { defaultValue: "Name" }),
              t("enterprise.workspaces.threshold"),
              t("enterprise.workspaces.region"),
              t("enterprise.workspaces.yourRole"),
              "",
            ]}
          />

          {loading ? (
            <LedgerSkeleton rows={5} />
          ) : error ? (
            <LedgerFault
              onRetry={load}
              retryLabel={t("enterprise.common.retry", { defaultValue: "Retry" })}
            >
              {error}
            </LedgerFault>
          ) : workspaces.length === 0 ? (
            <LedgerEmpty>
              <span className="inline-flex flex-wrap items-center gap-3">
                <span>{t("enterprise.workspaces.noWorkspaces")}</span>
                <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  {t("enterprise.workspaces.create")}
                </Button>
              </span>
            </LedgerEmpty>
          ) : (
            <>
              {workspaces.map((ws) => {
                const pct = Math.round(ws.defaultSimilarityThreshold * 100);
                return (
                  <LedgerRow
                    key={ws.id}
                    to={`/enterprise/workspaces/${ws.id}`}
                    className="group"
                  >
                    {/* Serial / case number */}
                    <LedgerCell>
                      <Serial tone="muted" className="group-hover:border-primary/40 group-hover:text-primary">
                        {ws.id}
                      </Serial>
                    </LedgerCell>

                    {/* Name + description */}
                    <LedgerCell>
                      <span className="block truncate t-h5 transition-colors group-hover:text-primary">
                        {ws.name}
                      </span>
                      {ws.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {ws.description}
                        </p>
                      )}
                    </LedgerCell>

                    {/* Threshold — reading + band-coloured meter */}
                    <LedgerCell>
                      <div className="flex items-center gap-2">
                        <span className="w-9 shrink-0 font-mono text-sm tabular-nums text-foreground">
                          {pct}%
                        </span>
                        <Meter
                          value={pct}
                          tone="auto"
                          className="h-2 flex-1"
                          ariaLabel={`${t("enterprise.workspaces.threshold")} ${pct}%`}
                        />
                      </div>
                    </LedgerCell>

                    {/* Region */}
                    <LedgerCell mono className="text-xs text-muted-foreground">
                      {ws.storageRegion}
                    </LedgerCell>

                    {/* Role */}
                    <LedgerCell>
                      {ws.membership && (
                        <Tag tone={ROLE_TONE[ws.membership.role] ?? "muted"}>
                          {ws.membership.role}
                        </Tag>
                      )}
                    </LedgerCell>

                    {/* Cross-reference chevron */}
                    <LedgerCell align="end">
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary",
                          isRTL && "rotate-180",
                        )}
                      />
                    </LedgerCell>
                  </LedgerRow>
                );
              })}

              <LedgerFooter
                left={
                  <span className="inline-flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span>
                      {t("enterprise.workspaces.region")}{" "}
                      <span className="font-semibold tabular-nums text-foreground">{regionCount}</span>
                    </span>
                    <span>
                      MEDIAN{" "}
                      <span className="font-semibold tabular-nums text-foreground">{medianThreshold}%</span>
                    </span>
                  </span>
                }
                right={`${workspaces.length} RECORDS`}
              />
            </>
          )}
        </Ledger>
      </DocFrame>
    </div>
  );
}
