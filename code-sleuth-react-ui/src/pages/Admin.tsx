import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, DollarSign, Gauge, Loader2, Lock, ShieldCheck, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Masthead, Panel, Figure, Serial, SpecList } from "@/components/dossier/Dossier";
import { cn } from "@/lib/utils";
import * as api from "@/lib/adminApi";

const PLANS = ["free", "pro", "team"];

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const TABS = ["overview", "users", "revenue", "usage", "activity", "security"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICON: Record<Tab, typeof Users> = {
  overview: Activity, users: Users, revenue: DollarSign,
  usage: Gauge, activity: Activity, security: ShieldCheck,
};

// ── small presentational helpers ────────────────────────────────────────────

/** Borderless titled group used inside the drawer — grouped by whitespace +
 *  1px dividers instead of nesting boxes-in-boxes. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 first:pt-0">
      <h3 className="t-label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

/** The case ledger for key figures: a ruled mono label:value reading laid out as
 *  a two-column index, NOT a row of raised stat cards. Any `sub` caveat is folded
 *  in beside its value as a muted annotation so no datum is lost. */
function MetricLedger({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }[];
  className?: string;
}) {
  const rows = items.map((it) => ({
    label: it.label,
    value:
      it.sub != null ? (
        <span className="inline-flex items-baseline gap-2">
          {it.value}
          <span className="text-[11px] font-normal text-muted-foreground">{it.sub}</span>
        </span>
      ) : (
        it.value
      ),
  }));
  const mid = Math.ceil(rows.length / 2);
  return (
    <div className={cn("grid sm:grid-cols-2", className)}>
      <SpecList rows={rows.slice(0, mid)} className="sm:pe-12" />
      {rows.length > mid && (
        <SpecList rows={rows.slice(mid)} className="sm:border-s sm:border-border sm:ps-12" />
      )}
    </div>
  );
}

/** A terse mono reading for a figure caption gutter, e.g. "1,204 users". */
function Reading({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      <span className="font-semibold text-foreground">{n.toLocaleString()}</span> {unit}
    </span>
  );
}

function Bars({ items }: { items: { label: string; count: number }[] }) {
  const { t } = useTranslation("common");
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <div className="text-sm text-muted-foreground">{t("admin.noData")}</div>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 text-sm">
          <div className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground">{i.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <div className="w-12 shrink-0 text-end font-mono tabular-nums">{i.count}</div>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <span>{t("admin.loadError")}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>{t("admin.retry")}</Button>
    </div>
  );
}

/** Load data once with an explicit error state + retry, so a failed fetch shows
 *  an error + Retry instead of an infinite spinner. */
function useLoad<T>(loader: () => Promise<T>): { data: T | null; error: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(() => {
    setError(false);
    setData(null);
    loaderRef.current().then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  const { t } = useTranslation("common");
  const { data: m, error, reload } = useLoad(() => api.getAdminMetrics());
  if (error) return <LoadError onRetry={reload} />;
  if (!m) return <Spinner />;
  return (
    <div className="space-y-12">
      <Panel bare marker="§" label={t("admin.census", { defaultValue: "Census" })}>
        <MetricLedger
          items={[
            { label: t("admin.totalUsers"), value: m.totalUsers },
            { label: t("admin.totalAnalyses"), value: m.totalAnalyses },
            { label: t("admin.verified"), value: m.verifiedUsers, sub: `${m.unverifiedUsers} ${t("admin.unverified")}` },
            { label: t("admin.twofa"), value: m.twofaUsers },
            { label: t("admin.admins"), value: m.adminUsers },
            { label: t("admin.locked"), value: m.lockedUsers },
            { label: t("admin.failedLogins24h"), value: m.failedLogins24h },
            { label: t("admin.estMrr"), value: money(m.estimatedMrrCents), sub: t("admin.estimatedNote") },
          ]}
        />
      </Panel>

      <Panel bare marker="§" label={t("admin.planDistribution", { defaultValue: "Plan distribution" })}>
        <div className="grid gap-5 md:grid-cols-2">
          <Figure n={1} label={t("admin.planMix")} actions={<Reading n={m.totalUsers} unit={t("admin.users")} />}>
            <Bars items={PLANS.map((p) => ({ label: p, count: m.planCounts[p] ?? 0 }))} />
          </Figure>
          <Figure
            n={2}
            label={t("admin.apiPlanMix")}
            actions={<Reading n={Object.values(m.apiPlanCounts).reduce((s, c) => s + c, 0)} unit={t("admin.users")} />}
          >
            <Bars items={Object.entries(m.apiPlanCounts).map(([label, count]) => ({ label, count }))} />
          </Figure>
        </div>
      </Panel>

      <Panel bare marker="§" label={t("admin.newSignups")}>
        <MetricLedger
          items={[
            { label: t("admin.today"), value: m.signups.today },
            { label: t("admin.days7"), value: m.signups.last7d },
            { label: t("admin.days30"), value: m.signups.last30d },
          ]}
        />
      </Panel>
    </div>
  );
}

// ── User detail modal ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium text-foreground">{value}</span>
    </div>
  );
}

function UserDetailModal({ userId, onClose, onChanged }: { userId: number; onClose: () => void; onChanged?: () => void }) {
  const { t } = useTranslation("common");
  const [d, setD] = useState<api.AdminUserDetail | null>(null);
  const [audit, setAudit] = useState<api.AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; run: () => Promise<void> } | null>(null);

  const load = useCallback(() => {
    setError(false);
    api.getAdminUserDetail(userId).then(setD).catch(() => setError(true));
    api.getAdminUserAudit(userId, 25).then(setAudit).catch(() => undefined);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const executeAction = async (fn: () => Promise<void>, closeAfter?: boolean) => {
    setBusy(true);
    try {
      await fn();
      toast.success(t("admin.actionDone"));
      onChanged?.();
      if (closeAfter) { onClose(); return; }
      load();
    } catch {
      toast.error(t("admin.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  // Destructive actions route through an accessible AlertDialog rather than the
  // native window.confirm (which has no focus trap / a11y semantics / theming).
  const runAction = (fn: () => Promise<void>, opts: { confirm?: string; closeAfter?: boolean } = {}) => {
    if (opts.confirm) {
      setConfirm({ message: opts.confirm, run: () => executeAction(fn, opts.closeAfter) });
      return;
    }
    void executeAction(fn, opts.closeAfter);
  };

  const quota = d?.quota as { used?: number; limit?: number; unlimited?: boolean } | undefined;
  const apiSpend = d ? (d.apiUsage.monthlyPriceCents + d.apiUsage.estimatedCostCents) : 0;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="t-h3">{t("admin.userDetail")}</SheetTitle>
        </SheetHeader>
        {error ? <LoadError onRetry={load} /> : !d ? <Spinner /> : (
          <div className="divide-y divide-border">
            <Group title={t("admin.identity")}>
              <DetailRow label="ID" value={<span className="font-mono">{d.user.id}</span>} />
              <DetailRow label={t("admin.username")} value={<>{d.user.username}{d.user.isAdmin && <span className="ms-1 text-muted-foreground">★</span>}{!d.user.active && <span className="ms-2 text-xs text-destructive">{t("admin.suspended")}</span>}</>} />
              <DetailRow label={t("admin.email")} value={d.user.email || "—"} />
              <DetailRow label={t("admin.verified")} value={d.user.emailVerified ? "✓" : "—"} />
              <DetailRow label={t("admin.twofa")} value={d.user.twofaEnabled ? "✓" : "—"} />
              <DetailRow label={t("admin.created")} value={fmtDate(d.user.createdAt)} />
              <DetailRow label={t("admin.lastLogin")} value={fmtDateTime(d.user.lastLoginAt)} />
              <DetailRow label={t("admin.failedLogins")} value={<span className="font-mono tabular-nums">{d.user.failedLoginCount}</span>} />
              <DetailRow label={t("admin.locked")} value={d.user.locked ? fmtDateTime(d.user.lockedUntil) : "—"} />
              <DetailRow label={t("admin.sessionVersion")} value={<span className="font-mono tabular-nums">{d.user.sessionVersion}</span>} />
            </Group>
            <Group title={t("admin.planSpend")}>
              <DetailRow label={t("admin.plan")} value={`${d.subscription.plan} (${d.subscription.status})`} />
              <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
                <span className="text-muted-foreground">{t("admin.apiPlanLabel")}</span>
                <Select value={d.apiUsage.apiPlan} onValueChange={(v) => void runAction(() => api.setUserApiPlan(userId, v))}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{api.API_PLAN_CODES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DetailRow label={t("admin.estMonthlySpend")} value={<span className="font-mono">{money(apiSpend)}</span>} />
              <DetailRow label={t("admin.lifetimePaid")} value={<span className="font-mono">{money(d.lifetimePaidCents)}</span>} />
              <DetailRow label={t("admin.renewsOn")} value={fmtDate(d.subscription.currentPeriodEnd)} />
              <DetailRow label={t("admin.stripeCustomer")} value={<span className="font-mono text-xs">{d.subscription.stripeCustomerId || "—"}</span>} />
            </Group>

            <Group title={t("admin.actions")}>
              <div className="flex flex-wrap gap-2">
                {d.user.active ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.suspendUser(userId), { confirm: t("admin.confirmSuspend") })}>{t("admin.suspend")}</Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.unsuspendUser(userId))}>{t("admin.unsuspend")}</Button>
                )}
                {d.user.locked ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.unlockUser(userId))}>{t("admin.unlock")}</Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.lockUser(userId, 60))}>{t("admin.lock")}</Button>
                )}
                {d.user.twofaEnabled && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.resetUser2fa(userId))}>{t("admin.reset2fa")}</Button>
                )}
                {!d.user.emailVerified && d.user.email && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.resendUserVerification(userId))}>{t("admin.resendVerify")}</Button>
                )}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.logoutUserEverywhere(userId))}>{t("admin.forceLogout")}</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.resetUserQuota(userId))}>{t("admin.resetQuota")}</Button>
                {d.user.isAdmin ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.setUserAdmin(userId, false))}>{t("admin.demote")}</Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => api.setUserAdmin(userId, true))}>{t("admin.promote")}</Button>
                )}
                <Button
                  variant="outline" size="sm" disabled={busy}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => void runAction(() => api.deleteUser(userId), { confirm: t("admin.confirmDelete"), closeAfter: true })}
                >
                  {t("admin.deleteUser")}
                </Button>
              </div>
            </Group>
            <Group title={t("admin.consumption")}>
              <DetailRow label={t("admin.usage")} value={<span className="font-mono tabular-nums">{quota?.unlimited ? "∞" : `${quota?.used ?? 0} / ${quota?.limit ?? 0}`}</span>} />
              <DetailRow label={t("admin.apiCalls")} value={<span className="font-mono tabular-nums">{d.apiUsage.calls}</span>} />
              <DetailRow label={t("admin.apiPairs")} value={<span className="font-mono tabular-nums">{d.apiUsage.pairs}</span>} />
              <DetailRow label={t("admin.analyses")} value={<span className="font-mono tabular-nums">{d.activity.analysesCount}</span>} />
              <DetailRow label={t("admin.lastAnalysis")} value={fmtDateTime(d.activity.lastAnalysisAt)} />
              <DetailRow label={t("admin.avgSimilarity")} value={<span className="font-mono tabular-nums">{d.activity.avgSimilarity ?? "—"}</span>} />
            </Group>
            <Group title={t("admin.payments")}>
              {d.payments.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noPayments")}</div> : (
                <div className="divide-y divide-border text-sm">
                  {d.payments.map((p) => (
                    <div key={p.id} className="flex justify-between py-1.5">
                      <span className="font-mono">{money(p.netCents)} <span className="ms-1 text-xs text-muted-foreground">{p.status} · {p.product}</span></span>
                      <span className="text-muted-foreground">{fmtDate(p.paidAt || p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
            <Group title={t("admin.apiKeys")}>
              {d.apiKeys.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noKeys")}</div> : (
                <div className="divide-y divide-border text-sm">
                  {d.apiKeys.map((k) => (
                    <div key={k.id} className="flex justify-between py-1.5">
                      <span className="font-mono">{k.prefix}{k.revoked && <span className="ms-2 text-destructive">revoked</span>}</span>
                      <span className="text-muted-foreground">{fmtDate(k.lastUsedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
            <Group title={t("admin.securityHistory")}>
              {audit.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
                <div className="divide-y divide-border text-sm">
                  {audit.map((a) => (
                    <div key={a.id} className="flex justify-between py-1.5">
                      <span className="font-mono text-xs">{a.action}</span>
                      <span className="text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.confirmTitle", { defaultValue: t("admin.userDetail") })}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const pending = confirm; setConfirm(null); void pending?.run(); }}>
              {t("admin.confirm", { defaultValue: "Confirm" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────

function UsersTab() {
  const { t } = useTranslation("common");
  const [data, setData] = useState<api.AdminUsersPage | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(() => {
    api.getAdminUsers({
      page, q: search,
      plan: plan === "all" ? "" : plan,
      status: status === "all" ? "" : status,
    }).then(setData).catch(() => toast.error(t("admin.loadError")));
  }, [page, search, plan, status, t]);

  useEffect(() => { load(); }, [load]);

  const changePlan = async (userId: number, newPlan: string) => {
    try {
      await api.setUserPlan(userId, newPlan);
      toast.success(t("admin.updated"));
      load();  // re-fetch so derived columns (status, usage cap) reflect the change
    } catch { toast.error(t("admin.updateFailed")); }
  };

  // The CSV export must reflect the same filters the table is showing.
  const csvParams = new URLSearchParams();
  if (search) csvParams.set("q", search);
  if (plan !== "all") csvParams.set("plan", plan);
  if (status !== "all") csvParams.set("status", status);
  const csvUrl = csvParams.toString() ? `${api.ADMIN_USERS_CSV_URL}?${csvParams}` : api.ADMIN_USERS_CSV_URL;

  const perPage = data?.perPage ?? 25;
  const total = data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <Panel
        bare
        marker="§"
        label={t("admin.users")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }} className="min-w-[180px]">
              <Input placeholder={t("admin.search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
            </form>
            <Select value={plan} onValueChange={(v) => { setPlan(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-28"><SelectValue placeholder={t("admin.plan")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.all")}</SelectItem>
                {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-32"><SelectValue placeholder={t("admin.status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.all")}</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="past_due">past_due</SelectItem>
                <SelectItem value="canceled">canceled</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm" className="h-8">
              <a href={csvUrl} download>{t("admin.exportCsv")}</a>
            </Button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-start t-label">
                <th className="w-px px-4 py-2.5 text-start">#</th>
                <th className="px-4 py-2.5 text-start">{t("admin.username")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.email")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.verified")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.twofa")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.status")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.usage")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.lastActive")}</th>
                <th className="px-4 py-2.5 text-start">{t("admin.plan")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u, i) => (
                <tr key={u.id} className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-muted/40" onClick={() => setDetailId(u.id)}>
                  <td className="px-4 py-2 align-middle"><Serial tone={u.locked ? "primary" : "muted"}>{(page - 1) * perPage + i + 1}</Serial></td>
                  <td className="px-4 py-2 font-medium text-foreground">{u.username}{u.isAdmin && <span className="ms-1 text-xs text-muted-foreground">★</span>}{u.locked && <Lock className="ms-1 inline h-3 w-3 text-destructive" />}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.email || "—"}</td>
                  <td className="px-4 py-2">{u.emailVerified ? "✓" : "—"}</td>
                  <td className="px-4 py-2">{u.twofaEnabled ? "✓" : "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">{u.status}</td>
                  <td className="px-4 py-2 font-mono tabular-nums">{u.usagePct === null ? "∞" : `${u.usageUsed}/${u.usageLimit}`}</td>
                  <td className="px-4 py-2 text-muted-foreground">{u.lastActive ? fmtDate(u.lastActive) : t("admin.never")}</td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <Select value={u.plan} onValueChange={(v) => changePlan(u.id, v)}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">{t("admin.noUsers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">{t("admin.showing")} {data?.items.length ?? 0} {t("admin.of")} {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("admin.prev")}</Button>
            <span className="px-2 py-1 tabular-nums">{page}/{maxPage}</span>
            <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>{t("admin.next")}</Button>
          </div>
        </div>
      </Panel>

      {detailId !== null && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

// ── Revenue tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const { t } = useTranslation("common");
  const { data: r, error, reload } = useLoad(() => api.getAdminRevenue());
  if (error) return <LoadError onRetry={reload} />;
  if (!r) return <Spinner />;
  const planTable = (rows: api.AdminRevenue["basePlans"], title: string) => (
    <Panel bare marker="§" label={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-foreground t-label">
            <th className="w-px pb-2 pe-4 text-start">#</th>
            <th className="pb-2 pe-4 text-start">{t("admin.plan")}</th>
            <th className="pb-2 pe-4 text-start">{t("admin.subscribers")}</th>
            <th className="pb-2 pe-4 text-start">{t("admin.price")}</th>
            <th className="pb-2 pe-4 text-start">{t("admin.monthly")}</th>
          </tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.code} className="border-b border-border/50 last:border-b-0">
                <td className="py-2 pe-4 align-middle"><Serial>{i + 1}</Serial></td>
                <td className="py-2 pe-4 font-medium">{p.name}</td>
                <td className="py-2 pe-4 font-mono tabular-nums">{p.subscribers}</td>
                <td className="py-2 pe-4 font-mono">{money(p.priceCents)}</td>
                <td className="py-2 pe-4 font-mono font-semibold">{money(p.monthlyCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
  return (
    <div className="space-y-12">
      <Panel bare marker="§" label={t("admin.estimates", { defaultValue: "Estimated" })}>
        <div className="mb-5 inline-flex rounded-sm bg-warning/20 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground">{t("admin.estimatedNote")}</div>
        <MetricLedger
          items={[
            { label: t("admin.estMrr"), value: money(r.estimatedMrrCents) },
            { label: t("admin.usageRevenue"), value: money(r.estimatedUsageRevenueCents) },
            { label: t("admin.pastDue"), value: r.pastDue },
            { label: t("admin.canceled"), value: r.canceled },
          ]}
        />
      </Panel>
      <Panel bare marker="§" label={t("admin.actualRevenueTitle")}>
        {r.paymentsCount === 0 ? (
          <div className="text-sm text-muted-foreground">{t("admin.ledgerEmpty")}</div>
        ) : (
          <MetricLedger
            items={[
              { label: t("admin.actualRevenue"), value: money(r.actualCollectedCents) },
              { label: t("admin.grossPaid"), value: money(r.grossPaidCents) },
              { label: t("admin.refunds"), value: money(r.refundsCents) },
              { label: t("admin.failedPayments"), value: r.failedPaymentsCount, sub: money(r.failedPaymentsCents) },
            ]}
          />
        )}
      </Panel>
      {planTable(r.basePlans, t("admin.perPlan"))}
      {planTable(r.apiPlans, t("admin.apiRevenue"))}
    </div>
  );
}

// ── Usage tab ───────────────────────────────────────────────────────────────

function UsageTab() {
  const { t } = useTranslation("common");
  const { data: u, error, reload } = useLoad(() => api.getAdminUsage());
  if (error) return <LoadError onRetry={reload} />;
  if (!u) return <Spinner />;
  return (
    <div className="space-y-12">
      <Panel bare marker="§" label={t("admin.usageSummary", { defaultValue: "Period usage" })}>
        <MetricLedger
          items={[
            { label: t("admin.period"), value: u.period },
            { label: t("admin.interactiveAnalyses"), value: u.interactiveAnalyses },
            { label: t("admin.apiCalls"), value: u.apiCalls },
            { label: t("admin.apiPairs"), value: u.apiPairs },
            { label: t("admin.overQuota"), value: u.overQuotaUsers, sub: `${u.nearQuotaUsers} ${t("admin.nearQuota")}` },
          ]}
        />
      </Panel>
      <div className="grid gap-5 md:grid-cols-2">
        <Figure n={1} label={t("admin.topInteractive")}>
          {u.topInteractive.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
            <Bars items={u.topInteractive.map((x) => ({ label: x.username, count: x.analyses }))} />
          )}
        </Figure>
        <Panel bare marker="§" label={t("admin.topApi")}>
          {u.topApi.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-foreground t-label">
                  <th className="w-px pb-2 pe-4 text-start">#</th>
                  <th className="pb-2 pe-4 text-start">{t("admin.username")}</th>
                  <th className="pb-2 pe-4 text-start">{t("admin.calls")}</th>
                  <th className="pb-2 pe-4 text-start">{t("admin.pairs")}</th>
                </tr></thead>
                <tbody>
                  {u.topApi.map((x, i) => (
                    <tr key={x.userId} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pe-4 align-middle"><Serial>{i + 1}</Serial></td>
                      <td className="py-2 pe-4">{x.username}</td>
                      <td className="py-2 pe-4 font-mono tabular-nums">{x.calls}</td>
                      <td className="py-2 pe-4 font-mono tabular-nums">{x.pairs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <div className="font-mono text-xs text-muted-foreground">{u.note}</div>
    </div>
  );
}

// ── Activity tab ────────────────────────────────────────────────────────────

function ActivityTab() {
  const { t } = useTranslation("common");
  const { data, error, reload } = useLoad(() => Promise.all([api.getAdminActivity(30), api.getAdminDistributions()]));
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Spinner />;
  const [a, dist] = data;
  const asBars = (rows: { date: string; count: number }[]) => rows.map((r) => ({ label: r.date.slice(5), count: r.count }));
  const sum = (rows: { count: number }[]) => rows.reduce((s, r) => s + r.count, 0);
  const total = (n: number) => (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      Σ <span className="font-semibold text-foreground">{n.toLocaleString()}</span>
    </span>
  );
  return (
    <div className="space-y-12">
      <Panel bare marker="§" label={t("admin.timeSeries", { defaultValue: "Daily activity" })}>
        <div className="grid gap-5 md:grid-cols-3">
          <Figure n={1} label={t("admin.signupsPerDay")} actions={total(sum(a.signupsPerDay))}><Bars items={asBars(a.signupsPerDay)} /></Figure>
          <Figure n={2} label={t("admin.analysesPerDay")} actions={total(sum(a.analysesPerDay))}><Bars items={asBars(a.analysesPerDay)} /></Figure>
          <Figure n={3} label={t("admin.dau")} actions={total(sum(a.activeUsersPerDay))}><Bars items={asBars(a.activeUsersPerDay)} /></Figure>
        </div>
      </Panel>
      <Panel bare marker="§" label={t("admin.distributions", { defaultValue: "Distributions" })}>
        <div className="grid gap-5 md:grid-cols-2">
          <Figure n={4} label={t("admin.languageMix")} actions={total(sum(dist.languages.map((l) => ({ count: l.count }))))}>
            <Bars items={dist.languages.map((l) => ({ label: l.language, count: l.count }))} />
          </Figure>
          <Figure n={5} label={t("admin.similarityMix")} actions={total(sum(dist.similarity.map((s) => ({ count: s.count }))))}>
            <Bars items={dist.similarity.map((s) => ({ label: s.range, count: s.count }))} />
          </Figure>
        </div>
      </Panel>
    </div>
  );
}

// ── Security tab ────────────────────────────────────────────────────────────

function SecurityTab() {
  const { t } = useTranslation("common");
  const { data: s, error, reload } = useLoad(() => api.getAdminSecurity());
  if (error) return <LoadError onRetry={reload} />;
  if (!s) return <Spinner />;
  return (
    <div className="space-y-12">
      <Panel bare marker="§" label={t("admin.securitySummary", { defaultValue: "Security posture" })}>
        <MetricLedger
          items={[
            { label: t("admin.locked"), value: s.lockedCount },
            { label: t("admin.failedLogins24h"), value: s.failedLogins24h },
            { label: t("admin.twofa"), value: s.twofaUsers },
            { label: t("admin.dormantKeys"), value: s.dormantApiKeys },
            { label: t("admin.revokedKeys"), value: s.revokedApiKeys },
          ]}
        />
      </Panel>
      <Panel bare marker="§" label={t("admin.lockedAccounts")}>
        {s.lockedAccounts.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noLocked")}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b-2 border-foreground t-label">
                <th className="w-px pb-2 pe-4 text-start">#</th>
                <th className="pb-2 pe-4 text-start">{t("admin.username")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.failedLogins")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.lockedUntil")}</th>
              </tr></thead>
              <tbody>
                {s.lockedAccounts.map((a, i) => (
                  <tr key={a.id} className="border-b border-border/50 last:border-b-0">
                    <td className="py-2 pe-4 align-middle"><Serial tone="primary">{i + 1}</Serial></td>
                    <td className="py-2 pe-4">{a.username}</td>
                    <td className="py-2 pe-4 font-mono tabular-nums">{a.failedLoginCount}</td>
                    <td className="py-2 pe-4 text-muted-foreground">{fmtDateTime(a.lockedUntil)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel bare marker="§" label={t("admin.adminActions")}>
        {s.recentAdminActions.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
          <ol className="divide-y divide-border text-sm">
            {s.recentAdminActions.map((a, i) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <Serial>{i + 1}</Serial>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{a.action}{a.detail ? <span className="text-muted-foreground"> · {a.detail}</span> : null}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

const Admin = () => {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<Tab>("overview");
  // A lightweight, always-on read powering the masthead's live console readings.
  const { data: m } = useLoad(() => api.getAdminMetrics());

  const meta = [
    { label: t("admin.totalUsers"), value: m ? m.totalUsers.toLocaleString() : "—" },
    { label: t("admin.estMrr"), value: m ? money(m.estimatedMrrCents) : "—" },
    { label: t("admin.verified"), value: m ? m.verifiedUsers.toLocaleString() : "—" },
    {
      label: t("admin.locked"),
      value: m ? (
        <span className={m.lockedUsers > 0 ? "font-semibold text-foreground" : undefined}>{m.lockedUsers.toLocaleString()}</span>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <Masthead
        kicker={t("admin.eyebrow", { defaultValue: "Operations console" })}
        title={t("admin.title")}
        description={t("admin.subtitle")}
        meta={meta}
      />

      {/* Console section switch — mono, ruled, like a log filter rail */}
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {TABS.map((tb) => {
          const Icon = TAB_ICON[tb];
          const active = tab === tb;
          return (
            <button
              key={tb}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 font-mono text-xs uppercase tracking-wide transition-colors",
                active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`admin.tabs.${tb}`)}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "revenue" && <RevenueTab />}
      {tab === "usage" && <UsageTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "security" && <SecurityTab />}
    </div>
  );
};

export default Admin;
