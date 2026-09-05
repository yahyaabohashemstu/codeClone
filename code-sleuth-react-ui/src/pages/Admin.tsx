import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Masthead, Panel, Figure, SpecList } from "@/components/dossier/Dossier";
import { BenchSelect, Tag } from "@/components/bench/Bench";
import { IconChevronLeft, IconChevronRight, IconDownload, IconSearch } from "@/components/bench/icons";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { cn } from "@/lib/utils";
import * as api from "@/lib/adminApi";

const PLANS = ["free", "pro", "team"];

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const TABS = ["overview", "users", "revenue", "usage", "activity", "security"] as const;
type Tab = (typeof TABS)[number];

const TH = "label text-start font-semibold text-txt-muted";

// ── small presentational helpers ────────────────────────────────────────────

/** Titled group inside the drawer — whitespace and one hairline, never a box in a box. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 first:pt-0">
      <h3 className="label mb-3 text-txt-muted">{title}</h3>
      {children}
    </section>
  );
}

/** A section of the console: a hairline panel, its label strip carrying the aside. */
function Section({
  label,
  aside,
  children,
  className,
  bodyClassName,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel label={label} actions={aside} className={className} bodyClassName={bodyClassName}>
      {children}
    </Panel>
  );
}

/** Key figures as a ruled two-column readout; a `sub` caveat sits beside its value. */
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
          <span className="text-[11px] font-normal text-txt-muted">{it.sub}</span>
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
        <SpecList rows={rows.slice(mid)} className="sm:border-s sm:border-bench-hair sm:ps-12" />
      )}
    </div>
  );
}

/** Ordinal for ledger rows; a flagged row reads in signal. */
function LogNo({ n, flagged = false }: { n: number; flagged?: boolean }) {
  return <span className={cn("mono-ordinal", flagged ? "text-signal-bench" : "text-txt-muted")}>{String(n).padStart(2, "0")}</span>;
}

/** A terse mono reading for a figure caption, e.g. "1,204 users". */
function Caption({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="mono-meta text-txt-muted">
      <span className="text-txt-primary">{n.toLocaleString()}</span> {unit}
    </span>
  );
}

/** A lit lamp square with a spoken value — for boolean cells. */
function LampCell({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("lamp", on && "is-on")} />
      <span className="sr-only">{label}: {on ? "on" : "off"}</span>
    </span>
  );
}

function Bars({ items }: { items: { label: string; count: number }[] }) {
  const { t } = useTranslation("common");
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <div className="text-[13px] text-txt-muted">{t("admin.noData")}</div>;
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3">
          <div className="mono-filename w-28 shrink-0 truncate text-txt-muted" dir="ltr">{i.label}</div>
          <div className="metric-bar-track flex-1">
            <div className="metric-bar-fill" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <div className="mono-value w-12 shrink-0 text-end text-txt-primary" dir="ltr">{i.count}</div>
        </div>
      ))}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return <PageError message={t("admin.loadError")} onRetry={onRetry} />;
}

/** Load data once with an explicit error state + retry, so a failed fetch shows
 *  an error + Retry instead of an infinite loader. */
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

/** Hairline ledger table shell: 36px label head, 46px ruled rows.
 *  `flush` drops the outer rules for a table that fills its panel edge to edge. */
function Ledger({ minWidth = 640, flush = false, children }: { minWidth?: number; flush?: boolean; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cn("w-full border-collapse", !flush && "border-y border-bench-hair")} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  const { t } = useTranslation("common");
  const { data: m, error, reload } = useLoad(() => api.getAdminMetrics());
  if (error) return <LoadError onRetry={reload} />;
  if (!m) return <PageLoader />;
  return (
    <div className="space-y-5">
      <Section label={t("admin.census", { defaultValue: "Census" })}>
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
      </Section>

      <Section label={t("admin.planDistribution", { defaultValue: "Plan distribution" })}>
        <div className="grid gap-5 md:grid-cols-2">
          <Figure n={1} label={t("admin.planMix")} actions={<Caption n={m.totalUsers} unit={t("admin.users")} />}>
            <Bars items={PLANS.map((p) => ({ label: p, count: m.planCounts[p] ?? 0 }))} />
          </Figure>
          <Figure
            n={2}
            label={t("admin.apiPlanMix")}
            actions={<Caption n={Object.values(m.apiPlanCounts).reduce((s, c) => s + c, 0)} unit={t("admin.users")} />}
          >
            <Bars items={Object.entries(m.apiPlanCounts).map(([label, count]) => ({ label, count }))} />
          </Figure>
        </div>
      </Section>

      <Section label={t("admin.newSignups")}>
        <MetricLedger
          items={[
            { label: t("admin.today"), value: m.signups.today },
            { label: t("admin.days7"), value: m.signups.last7d },
            { label: t("admin.days30"), value: m.signups.last30d },
          ]}
        />
      </Section>
    </div>
  );
}

// ── User detail drawer ──────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
      <span className="text-txt-muted">{label}</span>
      <span className="min-w-0 text-end text-txt-primary">{value}</span>
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
  const mono = (v: React.ReactNode) => <span className="mono-value" dir="ltr">{v}</span>;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto border-bench-strong bg-bench-raised text-txt-primary scrollbar-thin sm:max-w-xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="t-h4 text-txt-primary">{t("admin.userDetail")}</SheetTitle>
        </SheetHeader>
        {error ? <LoadError onRetry={load} /> : !d ? <PageLoader /> : (
          <div className="divide-y divide-bench-hair">
            <Group title={t("admin.identity")}>
              <DetailRow label="ID" value={mono(d.user.id)} />
              <DetailRow
                label={t("admin.username")}
                value={
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <span dir="ltr">{d.user.username}</span>
                    {d.user.isAdmin && <Tag tone="advisory">{t("admin.admins")}</Tag>}
                    {!d.user.active && <Tag tone="hot">{t("admin.suspended")}</Tag>}
                  </span>
                }
              />
              <DetailRow label={t("admin.email")} value={<span dir="ltr">{d.user.email || "—"}</span>} />
              <DetailRow label={t("admin.verified")} value={<LampCell on={d.user.emailVerified} label={t("admin.verified")} />} />
              <DetailRow label={t("admin.twofa")} value={<LampCell on={d.user.twofaEnabled} label={t("admin.twofa")} />} />
              <DetailRow label={t("admin.created")} value={mono(fmtDate(d.user.createdAt))} />
              <DetailRow label={t("admin.lastLogin")} value={mono(fmtDateTime(d.user.lastLoginAt))} />
              <DetailRow label={t("admin.failedLogins")} value={mono(d.user.failedLoginCount)} />
              <DetailRow label={t("admin.locked")} value={mono(d.user.locked ? fmtDateTime(d.user.lockedUntil) : "—")} />
              <DetailRow label={t("admin.sessionVersion")} value={mono(d.user.sessionVersion)} />
            </Group>
            <Group title={t("admin.planSpend")}>
              <DetailRow label={t("admin.plan")} value={mono(`${d.subscription.plan} (${d.subscription.status})`)} />
              <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
                <span className="text-txt-muted">{t("admin.apiPlanLabel")}</span>
                <Select value={d.apiUsage.apiPlan} onValueChange={(v) => void runAction(() => api.setUserApiPlan(userId, v))}>
                  <SelectTrigger className="h-8 w-36 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{api.API_PLAN_CODES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DetailRow label={t("admin.estMonthlySpend")} value={mono(money(apiSpend))} />
              <DetailRow label={t("admin.lifetimePaid")} value={mono(money(d.lifetimePaidCents))} />
              <DetailRow label={t("admin.renewsOn")} value={mono(fmtDate(d.subscription.currentPeriodEnd))} />
              <DetailRow label={t("admin.stripeCustomer")} value={<span className="mono-filename" dir="ltr">{d.subscription.stripeCustomerId || "—"}</span>} />
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
                  variant="destructive" size="sm" disabled={busy}
                  onClick={() => void runAction(() => api.deleteUser(userId), { confirm: t("admin.confirmDelete"), closeAfter: true })}
                >
                  {t("admin.deleteUser")}
                </Button>
              </div>
            </Group>
            <Group title={t("admin.consumption")}>
              <DetailRow label={t("admin.usage")} value={mono(quota?.unlimited ? "∞" : `${quota?.used ?? 0} / ${quota?.limit ?? 0}`)} />
              <DetailRow label={t("admin.apiCalls")} value={mono(d.apiUsage.calls)} />
              <DetailRow label={t("admin.apiPairs")} value={mono(d.apiUsage.pairs)} />
              <DetailRow label={t("admin.analyses")} value={mono(d.activity.analysesCount)} />
              <DetailRow label={t("admin.lastAnalysis")} value={mono(fmtDateTime(d.activity.lastAnalysisAt))} />
              <DetailRow label={t("admin.avgSimilarity")} value={mono(d.activity.avgSimilarity ?? "—")} />
            </Group>
            <Group title={t("admin.payments")}>
              {d.payments.length === 0 ? <div className="text-[13px] text-txt-muted">{t("admin.noPayments")}</div> : (
                <div className="divide-y divide-bench-hair">
                  {d.payments.map((p) => (
                    <div key={p.id} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
                      <span className="mono-value text-txt-primary" dir="ltr">
                        {money(p.netCents)} <span className="mono-meta text-txt-muted">{p.status} · {p.product}</span>
                      </span>
                      <span className="mono-filename text-txt-muted" dir="ltr">{fmtDate(p.paidAt || p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
            <Group title={t("admin.apiKeys")}>
              {d.apiKeys.length === 0 ? <div className="text-[13px] text-txt-muted">{t("admin.noKeys")}</div> : (
                <div className="divide-y divide-bench-hair">
                  {d.apiKeys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                      <span className="inline-flex items-center gap-2">
                        <span className="mono-filename text-txt-primary" dir="ltr">{k.prefix}</span>
                        {k.revoked && <Tag tone="neutral">revoked</Tag>}
                      </span>
                      <span className="mono-filename text-txt-muted" dir="ltr">{fmtDate(k.lastUsedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
            <Group title={t("admin.securityHistory")}>
              {audit.length === 0 ? <div className="text-[13px] text-txt-muted">{t("admin.noData")}</div> : (
                <div className="divide-y divide-bench-hair">
                  {audit.map((a) => (
                    <div key={a.id} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
                      <span className="mono-filename text-txt-primary" dir="ltr">{a.action}</span>
                      <span className="mono-filename text-txt-muted" dir="ltr">{fmtDateTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Group>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent className="border-bench-strong bg-bench-raised text-txt-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="t-h4">{t("admin.confirmTitle", { defaultValue: t("admin.userDetail") })}</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-txt-secondary">{confirm?.message}</AlertDialogDescription>
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
  const shown = data?.items.length ?? 0;

  return (
    <div>
      <Section
        label={t("admin.users")}
        bodyClassName="p-0"
        aside={
          <Button asChild variant="outline" size="sm">
            <a href={csvUrl} download>
              <IconDownload />
              {t("admin.exportCsv")}
            </a>
          </Button>
        }
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }} className="w-full sm:w-[300px]">
            <label className="well">
              <IconSearch className="text-txt-muted" />
              <input type="search" placeholder={t("admin.search")} aria-label={t("admin.search")} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </form>
          <BenchSelect
            label={t("admin.plan")}
            value={plan}
            onChange={(v) => { setPlan(v); setPage(1); }}
            options={[{ value: "all", label: t("admin.all") }, ...PLANS.map((p) => ({ value: p, label: p }))]}
          />
          <BenchSelect
            label={t("admin.status")}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: "all", label: t("admin.all") },
              { value: "active", label: "active" },
              { value: "past_due", label: "past_due" },
              { value: "canceled", label: "canceled" },
            ]}
          />
          <span className="ms-auto text-[12.5px] text-txt-secondary" dir="ltr">
            {t("admin.showing")} {shown} {t("admin.of")} {total}
          </span>
        </div>

        <Ledger minWidth={1040}>
          <thead>
            <tr className="h-9 border-b border-bench-hair">
              <th className={cn(TH, "w-12 ps-5")}>#</th>
              <th className={cn(TH, "ps-3")}>{t("admin.username")}</th>
              <th className={cn(TH, "ps-3")}>{t("admin.email")}</th>
              <th className={cn(TH, "w-20 ps-3")}>{t("admin.verified")}</th>
              <th className={cn(TH, "w-20 ps-3")}>{t("admin.twofa")}</th>
              <th className={cn(TH, "w-28 ps-3")}>{t("admin.status")}</th>
              <th className={cn(TH, "w-24 ps-3")}>{t("admin.usage")}</th>
              <th className={cn(TH, "w-32 ps-3")}>{t("admin.lastActive")}</th>
              <th className={cn(TH, "w-28 ps-3 pe-5")}>{t("admin.plan")}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((u, i) => (
              <tr key={u.id} className="h-[46px] cursor-pointer border-b border-bench-hair last:border-b-0 hover:bg-bench-raised/60" onClick={() => setDetailId(u.id)}>
                <td className="ps-5 align-middle"><LogNo n={(page - 1) * perPage + i + 1} flagged={u.locked} /></td>
                <td className="ps-3 align-middle">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-txt-primary" dir="ltr">{u.username}</span>
                    {u.isAdmin && <Tag tone="advisory">{t("admin.admins")}</Tag>}
                    {u.locked && <Tag tone="hot">{t("admin.locked")}</Tag>}
                  </span>
                </td>
                <td className="mono-filename ps-3 align-middle text-txt-muted" dir="ltr">{u.email || "—"}</td>
                <td className="ps-3 align-middle"><LampCell on={u.emailVerified} label={t("admin.verified")} /></td>
                <td className="ps-3 align-middle"><LampCell on={u.twofaEnabled} label={t("admin.twofa")} /></td>
                <td className="ps-3 align-middle"><Tag tone={u.status === "active" ? "neutral" : "advisory"}>{u.status}</Tag></td>
                <td className="mono-value ps-3 align-middle text-txt-primary" dir="ltr">{u.usagePct === null ? "∞" : `${u.usageUsed}/${u.usageLimit}`}</td>
                <td className="mono-filename ps-3 align-middle text-txt-secondary" dir="ltr">{u.lastActive ? fmtDate(u.lastActive) : t("admin.never")}</td>
                <td className="ps-3 pe-5 align-middle" onClick={(e) => e.stopPropagation()}>
                  <Select value={u.plan} onValueChange={(v) => changePlan(u.id, v)}>
                    <SelectTrigger className="h-8 w-24 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-[15px] text-txt-primary">{t("admin.noUsers")}</td></tr>
            )}
          </tbody>
        </Ledger>

        {/* Pagination */}
        <div className="flex h-12 items-center justify-between px-5">
          <span className="mono-filename text-txt-secondary" dir="ltr">
            {page} / {maxPage}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center border border-bench-strong text-txt-primary hover:border-txt-muted disabled:opacity-40"
              aria-label={t("admin.prev")}
            >
              <IconChevronLeft className="rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= maxPage}
              className="flex h-8 w-8 items-center justify-center border border-bench-strong text-txt-primary hover:border-txt-muted disabled:opacity-40"
              aria-label={t("admin.next")}
            >
              <IconChevronRight className="rtl:-scale-x-100" />
            </button>
          </span>
        </div>
      </Section>

      {detailId !== null && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

// ── Revenue tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const { t } = useTranslation("common");
  const { data: r, error, reload } = useLoad(() => api.getAdminRevenue());
  if (error) return <LoadError onRetry={reload} />;
  if (!r) return <PageLoader />;
  const planTable = (rows: api.AdminRevenue["basePlans"], title: string) => (
    <Section label={title} bodyClassName="p-0">
      <Ledger minWidth={560} flush>
        <thead>
          <tr className="h-9 border-b border-bench-hair">
            <th className={cn(TH, "w-12 ps-5")}>#</th>
            <th className={cn(TH, "ps-3")}>{t("admin.plan")}</th>
            <th className={cn(TH, "w-32 ps-3")}>{t("admin.subscribers")}</th>
            <th className={cn(TH, "w-32 ps-3")}>{t("admin.price")}</th>
            <th className={cn(TH, "w-32 ps-3 pe-5")}>{t("admin.monthly")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.code} className="h-[46px] border-b border-bench-hair last:border-b-0">
              <td className="ps-5 align-middle"><LogNo n={i + 1} /></td>
              <td className="ps-3 align-middle text-[13px] font-semibold text-txt-primary">{p.name}</td>
              <td className="mono-value ps-3 align-middle text-txt-primary" dir="ltr">{p.subscribers}</td>
              <td className="mono-value ps-3 align-middle text-txt-secondary" dir="ltr">{money(p.priceCents)}</td>
              <td className="mono-value ps-3 pe-5 align-middle text-txt-primary" dir="ltr">{money(p.monthlyCents)}</td>
            </tr>
          ))}
        </tbody>
      </Ledger>
    </Section>
  );
  return (
    <div className="space-y-5">
      <Section label={t("admin.estimates", { defaultValue: "Estimated" })} aside={<Tag tone="advisory">{t("admin.estimatedNote")}</Tag>}>
        <MetricLedger
          items={[
            { label: t("admin.estMrr"), value: money(r.estimatedMrrCents) },
            { label: t("admin.usageRevenue"), value: money(r.estimatedUsageRevenueCents) },
            { label: t("admin.pastDue"), value: r.pastDue },
            { label: t("admin.canceled"), value: r.canceled },
          ]}
        />
      </Section>
      <Section label={t("admin.actualRevenueTitle")}>
        {r.paymentsCount === 0 ? (
          <div className="py-3 text-center text-[13px] text-txt-muted">{t("admin.ledgerEmpty")}</div>
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
      </Section>
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
  if (!u) return <PageLoader />;
  return (
    <div className="space-y-5">
      <Section label={t("admin.usageSummary", { defaultValue: "Period usage" })}>
        <MetricLedger
          items={[
            { label: t("admin.period"), value: u.period },
            { label: t("admin.interactiveAnalyses"), value: u.interactiveAnalyses },
            { label: t("admin.apiCalls"), value: u.apiCalls },
            { label: t("admin.apiPairs"), value: u.apiPairs },
            { label: t("admin.overQuota"), value: u.overQuotaUsers, sub: `${u.nearQuotaUsers} ${t("admin.nearQuota")}` },
          ]}
        />
      </Section>
      <div className="grid gap-5 md:grid-cols-2">
        <Figure n={1} label={t("admin.topInteractive")}>
          {u.topInteractive.length === 0 ? <div className="text-[13px] text-txt-muted">{t("admin.noData")}</div> : (
            <Bars items={u.topInteractive.map((x) => ({ label: x.username, count: x.analyses }))} />
          )}
        </Figure>
        <Section label={t("admin.topApi")} bodyClassName="p-0">
          {u.topApi.length === 0 ? <div className="p-5 text-[13px] text-txt-muted">{t("admin.noData")}</div> : (
            <Ledger minWidth={360} flush>
              <thead>
                <tr className="h-9 border-b border-bench-hair">
                  <th className={cn(TH, "w-12 ps-5")}>#</th>
                  <th className={cn(TH, "ps-3")}>{t("admin.username")}</th>
                  <th className={cn(TH, "w-24 ps-3")}>{t("admin.calls")}</th>
                  <th className={cn(TH, "w-24 ps-3 pe-5")}>{t("admin.pairs")}</th>
                </tr>
              </thead>
              <tbody>
                {u.topApi.map((x, i) => (
                  <tr key={x.userId} className="h-[46px] border-b border-bench-hair last:border-b-0">
                    <td className="ps-5 align-middle"><LogNo n={i + 1} /></td>
                    <td className="ps-3 align-middle text-[13px] text-txt-primary" dir="ltr">{x.username}</td>
                    <td className="mono-value ps-3 align-middle text-txt-primary" dir="ltr">{x.calls}</td>
                    <td className="mono-value ps-3 pe-5 align-middle text-txt-primary" dir="ltr">{x.pairs}</td>
                  </tr>
                ))}
              </tbody>
            </Ledger>
          )}
        </Section>
      </div>
      <div className="mono-meta text-txt-muted">{u.note}</div>
    </div>
  );
}

// ── Activity tab ────────────────────────────────────────────────────────────

function ActivityTab() {
  const { t } = useTranslation("common");
  const { data, error, reload } = useLoad(() => Promise.all([api.getAdminActivity(30), api.getAdminDistributions()]));
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <PageLoader />;
  const [a, dist] = data;
  const asBars = (rows: { date: string; count: number }[]) => rows.map((r) => ({ label: r.date.slice(5), count: r.count }));
  const sum = (rows: { count: number }[]) => rows.reduce((s, r) => s + r.count, 0);
  const total = (n: number) => (
    <span className="mono-meta text-txt-muted">
      Σ <span className="text-txt-primary">{n.toLocaleString()}</span>
    </span>
  );
  return (
    <div className="space-y-5">
      <Section label={t("admin.timeSeries", { defaultValue: "Daily activity" })}>
        <div className="grid gap-5 md:grid-cols-3">
          <Figure n={1} label={t("admin.signupsPerDay")} actions={total(sum(a.signupsPerDay))}><Bars items={asBars(a.signupsPerDay)} /></Figure>
          <Figure n={2} label={t("admin.analysesPerDay")} actions={total(sum(a.analysesPerDay))}><Bars items={asBars(a.analysesPerDay)} /></Figure>
          <Figure n={3} label={t("admin.dau")} actions={total(sum(a.activeUsersPerDay))}><Bars items={asBars(a.activeUsersPerDay)} /></Figure>
        </div>
      </Section>
      <Section label={t("admin.distributions", { defaultValue: "Distributions" })}>
        <div className="grid gap-5 md:grid-cols-2">
          <Figure n={4} label={t("admin.languageMix")} actions={total(sum(dist.languages.map((l) => ({ count: l.count }))))}>
            <Bars items={dist.languages.map((l) => ({ label: l.language, count: l.count }))} />
          </Figure>
          <Figure n={5} label={t("admin.similarityMix")} actions={total(sum(dist.similarity.map((s) => ({ count: s.count }))))}>
            <Bars items={dist.similarity.map((s) => ({ label: s.range, count: s.count }))} />
          </Figure>
        </div>
      </Section>
    </div>
  );
}

// ── Security tab ────────────────────────────────────────────────────────────

function SecurityTab() {
  const { t } = useTranslation("common");
  const { data: s, error, reload } = useLoad(() => api.getAdminSecurity());
  if (error) return <LoadError onRetry={reload} />;
  if (!s) return <PageLoader />;
  return (
    <div className="space-y-5">
      <Section label={t("admin.securitySummary", { defaultValue: "Security posture" })}>
        <MetricLedger
          items={[
            { label: t("admin.locked"), value: s.lockedCount },
            { label: t("admin.failedLogins24h"), value: s.failedLogins24h },
            { label: t("admin.twofa"), value: s.twofaUsers },
            { label: t("admin.dormantKeys"), value: s.dormantApiKeys },
            { label: t("admin.revokedKeys"), value: s.revokedApiKeys },
          ]}
        />
      </Section>
      <Section label={t("admin.lockedAccounts")} bodyClassName="p-0">
        {s.lockedAccounts.length === 0 ? <div className="p-5 text-center text-[13px] text-txt-muted">{t("admin.noLocked")}</div> : (
          <Ledger minWidth={560} flush>
            <thead>
              <tr className="h-9 border-b border-bench-hair">
                <th className={cn(TH, "w-12 ps-5")}>#</th>
                <th className={cn(TH, "ps-3")}>{t("admin.username")}</th>
                <th className={cn(TH, "w-32 ps-3")}>{t("admin.failedLogins")}</th>
                <th className={cn(TH, "w-48 ps-3 pe-5")}>{t("admin.lockedUntil")}</th>
              </tr>
            </thead>
            <tbody>
              {s.lockedAccounts.map((a, i) => (
                <tr key={a.id} className="h-[46px] border-b border-bench-hair last:border-b-0">
                  <td className="ps-5 align-middle"><LogNo n={i + 1} flagged /></td>
                  <td className="ps-3 align-middle text-[13px] text-txt-primary" dir="ltr">{a.username}</td>
                  <td className="mono-value ps-3 align-middle text-txt-primary" dir="ltr">{a.failedLoginCount}</td>
                  <td className="mono-filename ps-3 pe-5 align-middle text-txt-secondary" dir="ltr">{fmtDateTime(a.lockedUntil)}</td>
                </tr>
              ))}
            </tbody>
          </Ledger>
        )}
      </Section>
      <Section label={t("admin.adminActions")} bodyClassName="p-0">
        {s.recentAdminActions.length === 0 ? <div className="p-5 text-center text-[13px] text-txt-muted">{t("admin.noData")}</div> : (
          <ol className="divide-y divide-bench-hair">
            {s.recentAdminActions.map((a, i) => (
              <li key={a.id} className="flex h-[46px] items-center gap-4 px-5">
                <LogNo n={i + 1} />
                <span className="mono-filename min-w-0 flex-1 truncate text-txt-primary" dir="ltr">
                  {a.action}
                  {a.detail ? <span className="text-txt-muted"> · {a.detail}</span> : null}
                </span>
                <span className="mono-filename shrink-0 text-txt-muted" dir="ltr">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
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
        <span className={m.lockedUsers > 0 ? "text-signal-bench" : undefined}>{m.lockedUsers.toLocaleString()}</span>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <div className="pt-7">
      <Masthead
        kicker={t("admin.kicker", { defaultValue: "Console" })}
        title={t("admin.title")}
        description={t("admin.subtitle")}
        meta={meta}
      />

      {/* Console section switch */}
      <div className="segment-group flex-wrap" role="tablist">
        {TABS.map((tb) => {
          const active = tab === tb;
          return (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb)}
              className={cn("segment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", active && "is-on")}
            >
              {t(`admin.tabs.${tb}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab />}
        {tab === "revenue" && <RevenueTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "security" && <SecurityTab />}
      </div>
    </div>
  );
};

export default Admin;
