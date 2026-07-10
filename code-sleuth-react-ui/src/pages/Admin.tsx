import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity, DollarSign, Gauge, Loader2, Lock, ShieldCheck, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)} style={{ boxShadow: "var(--card-shadow-rest)" }}>
      {title && <h2 className="t-h3 mb-4">{title}</h2>}
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-5" style={{ boxShadow: "var(--card-shadow-rest)" }}>
      <div className="t-label">{label}</div>
      <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
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
          <div className="w-28 shrink-0 truncate text-muted-foreground">{i.label}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(i.count / max) * 100}%`, background: "var(--gradient-brand)" }} />
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label={t("admin.totalUsers")} value={m.totalUsers} />
        <Tile label={t("admin.totalAnalyses")} value={m.totalAnalyses} />
        <Tile label={t("admin.verified")} value={m.verifiedUsers} sub={`${m.unverifiedUsers} ${t("admin.unverified")}`} />
        <Tile label={t("admin.twofa")} value={m.twofaUsers} />
        <Tile label={t("admin.admins")} value={m.adminUsers} />
        <Tile label={t("admin.locked")} value={m.lockedUsers} />
        <Tile label={t("admin.failedLogins24h")} value={m.failedLogins24h} />
        <Tile label={t("admin.estMrr")} value={money(m.estimatedMrrCents)} sub={t("admin.estimatedNote")} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("admin.planMix")}>
          <Bars items={PLANS.map((p) => ({ label: p, count: m.planCounts[p] ?? 0 }))} />
        </Card>
        <Card title={t("admin.apiPlanMix")}>
          <Bars items={Object.entries(m.apiPlanCounts).map(([label, count]) => ({ label, count }))} />
        </Card>
      </div>
      <Card title={t("admin.newSignups")}>
        <div className="grid grid-cols-3 gap-4">
          <Tile label={t("admin.today")} value={m.signups.today} />
          <Tile label={t("admin.days7")} value={m.signups.last7d} />
          <Tile label={t("admin.days30")} value={m.signups.last30d} />
        </div>
      </Card>
    </div>
  );
}

// ── User detail modal ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1.5 text-sm">
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

  const load = useCallback(() => {
    setError(false);
    api.getAdminUserDetail(userId).then(setD).catch(() => setError(true));
    api.getAdminUserAudit(userId, 25).then(setAudit).catch(() => undefined);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const runAction = async (fn: () => Promise<void>, opts: { confirm?: string; closeAfter?: boolean } = {}) => {
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    setBusy(true);
    try {
      await fn();
      toast.success(t("admin.actionDone"));
      onChanged?.();
      if (opts.closeAfter) { onClose(); return; }
      load();
    } catch {
      toast.error(t("admin.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const quota = d?.quota as { used?: number; limit?: number; unlimited?: boolean } | undefined;
  const apiSpend = d ? (d.apiUsage.monthlyPriceCents + d.apiUsage.estimatedCostCents) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="t-h3">{t("admin.userDetail")}</h2>
          <button onClick={onClose} aria-label={t("admin.close")} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {error ? <LoadError onRetry={load} /> : !d ? <Spinner /> : (
          <div className="space-y-5">
            <Card title={t("admin.identity")}>
              <DetailRow label="ID" value={d.user.id} />
              <DetailRow label={t("admin.username")} value={<>{d.user.username}{d.user.isAdmin && <span className="ms-1 text-primary">★</span>}{!d.user.active && <span className="ms-2 text-xs text-destructive">{t("admin.suspended")}</span>}</>} />
              <DetailRow label={t("admin.email")} value={d.user.email || "—"} />
              <DetailRow label={t("admin.verified")} value={d.user.emailVerified ? "✓" : "—"} />
              <DetailRow label={t("admin.twofa")} value={d.user.twofaEnabled ? "✓" : "—"} />
              <DetailRow label={t("admin.created")} value={fmtDate(d.user.createdAt)} />
              <DetailRow label={t("admin.lastLogin")} value={fmtDateTime(d.user.lastLoginAt)} />
              <DetailRow label={t("admin.failedLogins")} value={d.user.failedLoginCount} />
              <DetailRow label={t("admin.locked")} value={d.user.locked ? fmtDateTime(d.user.lockedUntil) : "—"} />
              <DetailRow label={t("admin.sessionVersion")} value={d.user.sessionVersion} />
            </Card>
            <Card title={t("admin.planSpend")}>
              <DetailRow label={t("admin.plan")} value={`${d.subscription.plan} (${d.subscription.status})`} />
              <div className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm">
                <span className="text-muted-foreground">{t("admin.apiPlanLabel")}</span>
                <Select value={d.apiUsage.apiPlan} onValueChange={(v) => void runAction(() => api.setUserApiPlan(userId, v))}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{api.API_PLAN_CODES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DetailRow label={t("admin.estMonthlySpend")} value={money(apiSpend)} />
              <DetailRow label={t("admin.lifetimePaid")} value={money(d.lifetimePaidCents)} />
              <DetailRow label={t("admin.renewsOn")} value={fmtDate(d.subscription.currentPeriodEnd)} />
              <DetailRow label={t("admin.stripeCustomer")} value={d.subscription.stripeCustomerId || "—"} />
            </Card>

            <Card title={t("admin.actions")}>
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
            </Card>
            <Card title={t("admin.consumption")}>
              <DetailRow label={t("admin.usage")} value={quota?.unlimited ? "∞" : `${quota?.used ?? 0} / ${quota?.limit ?? 0}`} />
              <DetailRow label={t("admin.apiCalls")} value={d.apiUsage.calls} />
              <DetailRow label={t("admin.apiPairs")} value={d.apiUsage.pairs} />
              <DetailRow label={t("admin.analyses")} value={d.activity.analysesCount} />
              <DetailRow label={t("admin.lastAnalysis")} value={fmtDateTime(d.activity.lastAnalysisAt)} />
              <DetailRow label={t("admin.avgSimilarity")} value={d.activity.avgSimilarity ?? "—"} />
            </Card>
            <Card title={t("admin.payments")}>
              {d.payments.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noPayments")}</div> : (
                <div className="space-y-1 text-sm">
                  {d.payments.map((p) => (
                    <div key={p.id} className="flex justify-between border-b border-border/40 py-1">
                      <span>{money(p.netCents)} <span className="ms-1 text-xs text-muted-foreground">{p.status} · {p.product}</span></span>
                      <span className="text-muted-foreground">{fmtDate(p.paidAt || p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={t("admin.apiKeys")}>
              {d.apiKeys.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noKeys")}</div> : (
                <div className="space-y-1 text-sm">
                  {d.apiKeys.map((k) => (
                    <div key={k.id} className="flex justify-between border-b border-border/40 py-1">
                      <span className="font-mono">{k.prefix}{k.revoked && <span className="ms-2 text-destructive">revoked</span>}</span>
                      <span className="text-muted-foreground">{fmtDate(k.lastUsedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={t("admin.securityHistory")}>
              {audit.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
                <div className="space-y-1 text-sm">
                  {audit.map((a) => (
                    <div key={a.id} className="flex justify-between border-b border-border/40 py-1">
                      <span className="font-mono text-xs">{a.action}</span>
                      <span className="text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
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
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }} className="flex-1 min-w-[200px]">
          <Input placeholder={t("admin.search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-9" />
        </form>
        <Select value={plan} onValueChange={(v) => { setPlan(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-32"><SelectValue placeholder={t("admin.plan")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all")}</SelectItem>
            {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder={t("admin.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all")}</SelectItem>
            <SelectItem value="active">active</SelectItem>
            <SelectItem value="past_due">past_due</SelectItem>
            <SelectItem value="canceled">canceled</SelectItem>
          </SelectContent>
        </Select>
        <Button asChild variant="outline" className="h-9">
          <a href={csvUrl} download>{t("admin.exportCsv")}</a>
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start t-label">
                <th className="pb-2 pe-4 text-start">{t("admin.username")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.email")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.verified")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.twofa")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.status")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.usage")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.lastActive")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.plan")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr key={u.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/40" onClick={() => setDetailId(u.id)}>
                  <td className="py-2 pe-4 font-medium text-foreground">{u.username}{u.isAdmin && <span className="ms-1 text-xs text-primary">★</span>}{u.locked && <Lock className="ms-1 inline h-3 w-3 text-destructive" />}</td>
                  <td className="py-2 pe-4 text-muted-foreground">{u.email || "—"}</td>
                  <td className="py-2 pe-4">{u.emailVerified ? "✓" : "—"}</td>
                  <td className="py-2 pe-4">{u.twofaEnabled ? "✓" : "—"}</td>
                  <td className="py-2 pe-4">{u.status}</td>
                  <td className="py-2 pe-4 font-mono tabular-nums">{u.usagePct === null ? "∞" : `${u.usageUsed}/${u.usageLimit}`}</td>
                  <td className="py-2 pe-4 text-muted-foreground">{u.lastActive ? fmtDate(u.lastActive) : t("admin.never")}</td>
                  <td className="py-2 pe-4" onClick={(e) => e.stopPropagation()}>
                    <Select value={u.plan} onValueChange={(v) => changePlan(u.id, v)}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">{t("admin.noUsers")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("admin.showing")} {data?.items.length ?? 0} {t("admin.of")} {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("admin.prev")}</Button>
            <span className="px-2 py-1 font-mono">{page}/{maxPage}</span>
            <Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>{t("admin.next")}</Button>
          </div>
        </div>
      </Card>

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
    <Card title={title}>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border t-label">
          <th className="pb-2 pe-4 text-start">{t("admin.plan")}</th>
          <th className="pb-2 pe-4 text-start">{t("admin.subscribers")}</th>
          <th className="pb-2 pe-4 text-start">{t("admin.price")}</th>
          <th className="pb-2 pe-4 text-start">{t("admin.monthly")}</th>
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.code} className="border-b border-border/50">
              <td className="py-2 pe-4 font-medium">{p.name}</td>
              <td className="py-2 pe-4 font-mono tabular-nums">{p.subscribers}</td>
              <td className="py-2 pe-4 font-mono">{money(p.priceCents)}</td>
              <td className="py-2 pe-4 font-mono font-semibold">{money(p.monthlyCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">{t("admin.estimatedNote")}</div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label={t("admin.estMrr")} value={money(r.estimatedMrrCents)} />
        <Tile label={t("admin.usageRevenue")} value={money(r.estimatedUsageRevenueCents)} />
        <Tile label={t("admin.pastDue")} value={r.pastDue} />
        <Tile label={t("admin.canceled")} value={r.canceled} />
      </div>
      <Card title={t("admin.actualRevenueTitle")}>
        {r.paymentsCount === 0 ? (
          <div className="text-sm text-muted-foreground">{t("admin.ledgerEmpty")}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label={t("admin.actualRevenue")} value={money(r.actualCollectedCents)} />
            <Tile label={t("admin.grossPaid")} value={money(r.grossPaidCents)} />
            <Tile label={t("admin.refunds")} value={money(r.refundsCents)} />
            <Tile label={t("admin.failedPayments")} value={r.failedPaymentsCount} sub={money(r.failedPaymentsCents)} />
          </div>
        )}
      </Card>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Tile label={t("admin.period")} value={u.period} />
        <Tile label={t("admin.interactiveAnalyses")} value={u.interactiveAnalyses} />
        <Tile label={t("admin.apiCalls")} value={u.apiCalls} />
        <Tile label={t("admin.apiPairs")} value={u.apiPairs} />
        <Tile label={t("admin.overQuota")} value={u.overQuotaUsers} sub={`${u.nearQuotaUsers} ${t("admin.nearQuota")}`} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("admin.topInteractive")}>
          {u.topInteractive.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
            <Bars items={u.topInteractive.map((x) => ({ label: x.username, count: x.analyses }))} />
          )}
        </Card>
        <Card title={t("admin.topApi")}>
          {u.topApi.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border t-label">
                <th className="pb-2 pe-4 text-start">{t("admin.username")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.calls")}</th>
                <th className="pb-2 pe-4 text-start">{t("admin.pairs")}</th>
              </tr></thead>
              <tbody>
                {u.topApi.map((x) => (
                  <tr key={x.userId} className="border-b border-border/50">
                    <td className="py-2 pe-4">{x.username}</td>
                    <td className="py-2 pe-4 font-mono tabular-nums">{x.calls}</td>
                    <td className="py-2 pe-4 font-mono tabular-nums">{x.pairs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <div className="text-xs text-muted-foreground">{u.note}</div>
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
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <Card title={t("admin.signupsPerDay")}><Bars items={asBars(a.signupsPerDay)} /></Card>
        <Card title={t("admin.analysesPerDay")}><Bars items={asBars(a.analysesPerDay)} /></Card>
        <Card title={t("admin.dau")}><Bars items={asBars(a.activeUsersPerDay)} /></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("admin.languageMix")}>
          <Bars items={dist.languages.map((l) => ({ label: l.language, count: l.count }))} />
        </Card>
        <Card title={t("admin.similarityMix")}>
          <Bars items={dist.similarity.map((s) => ({ label: s.range, count: s.count }))} />
        </Card>
      </div>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Tile label={t("admin.locked")} value={s.lockedCount} />
        <Tile label={t("admin.failedLogins24h")} value={s.failedLogins24h} />
        <Tile label={t("admin.twofa")} value={s.twofaUsers} />
        <Tile label={t("admin.dormantKeys")} value={s.dormantApiKeys} />
        <Tile label={t("admin.revokedKeys")} value={s.revokedApiKeys} />
      </div>
      <Card title={t("admin.lockedAccounts")}>
        {s.lockedAccounts.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noLocked")}</div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border t-label">
              <th className="pb-2 pe-4 text-start">{t("admin.username")}</th>
              <th className="pb-2 pe-4 text-start">{t("admin.failedLogins")}</th>
              <th className="pb-2 pe-4 text-start">{t("admin.lockedUntil")}</th>
            </tr></thead>
            <tbody>
              {s.lockedAccounts.map((a) => (
                <tr key={a.id} className="border-b border-border/50">
                  <td className="py-2 pe-4">{a.username}</td>
                  <td className="py-2 pe-4 font-mono">{a.failedLoginCount}</td>
                  <td className="py-2 pe-4 text-muted-foreground">{fmtDateTime(a.lockedUntil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title={t("admin.adminActions")}>
        {s.recentAdminActions.length === 0 ? <div className="text-sm text-muted-foreground">{t("admin.noData")}</div> : (
          <div className="space-y-1 text-sm">
            {s.recentAdminActions.map((a) => (
              <div key={a.id} className="flex justify-between border-b border-border/40 py-1">
                <span className="font-mono text-xs">{a.action}{a.detail ? ` · ${a.detail}` : ""}</span>
                <span className="text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

const Admin = () => {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="t-h2">{t("admin.title")}</h1>
        <p className="mt-1 t-body">{t("admin.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tb) => {
          const Icon = TAB_ICON[tb];
          return (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                tab === tb ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
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
