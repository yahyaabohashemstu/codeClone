import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Masthead, Panel, Figure, Serial, Field, FieldSheet, Reading,
  StatusTag, Meter, SectionRule, Notice,
  Ledger, LedgerHead, LedgerRow, LedgerCell, LedgerFooter, LedgerEmpty,
  DocFrame, RailNav, RailReadings, DocSection, ReadoutGrid, ReadoutRow,
} from "@/components/dossier/Dossier";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import * as api from "@/lib/adminApi";

const PLANS = ["free", "pro", "team"];

const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const TABS = ["overview", "users", "revenue", "usage", "activity", "security"] as const;
type Tab = (typeof TABS)[number];

// ── semantic tone maps — colour encodes state only ──────────────────────────

type SemTone = "ok" | "warning" | "danger" | "muted";

/** Subscription status → semantic stamp tone. */
const subStatusTone = (s: string): SemTone =>
  s === "active" ? "ok" : s === "past_due" ? "warning" : s === "canceled" ? "danger" : "muted";

/** Failed-login count → escalating tone. */
const failedTone = (n: number): SemTone => (n >= 5 ? "danger" : n >= 1 ? "warning" : "muted");

/** Payment status → semantic tone. */
const paymentTone = (s: string): SemTone => {
  const v = s.toLowerCase();
  if (v.includes("refund")) return "warning";
  if (v.includes("fail") || v.includes("cancel") || v.includes("dispute")) return "danger";
  if (v.includes("paid") || v.includes("succe") || v.includes("complete")) return "ok";
  return "muted";
};

/** Usage % → ink colour for a mono reading (near/over quota). */
const usageInk = (pct: number | null): string =>
  pct == null ? "" : pct >= 100 ? "text-destructive" : pct >= 80 ? "text-warning" : "";

/** A real-signal count rendered as a StatusTag: the number is the content, the
 *  colour is the state — quiet (muted) at zero, escalating when the signal fires.
 *  This is the calibrated way to read locked accounts, failed logins, past-due
 *  subs and over-quota users — an alarm stamp, not a bare coloured number. */
const signalTag = (n: number, hot: Exclude<SemTone, "muted"> = "warning") => (
  <StatusTag tone={n > 0 ? hot : "muted"}>{n.toLocaleString()}</StatusTag>
);

// ── small presentational helpers ────────────────────────────────────────────

/** Ruled §-divider heading for a drawer section (was the boxed `Group`). */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-6 first:pt-0">
      <SectionRule tick>{title}</SectionRule>
      {children}
    </section>
  );
}

/** A margin-label spec row inside a FieldSheet (was `DetailRow`). */
function DetailRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <Field label={label} align="center" className="py-3">
      <div className="text-sm text-foreground">{value}</div>
    </Field>
  );
}

/** Horizontal distribution readout: mono label + band meter + tabular count. */
function Bars({ items }: { items: { label: string; count: number }[] }) {
  const { t } = useTranslation("common");
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <div className="text-sm text-muted-foreground">{t("admin.noData")}</div>;
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 text-sm">
          <div className="w-28 shrink-0 truncate font-mono text-xs uppercase tracking-wide text-muted-foreground">{i.label}</div>
          <Meter value={i.count} max={max} tone="primary" className="flex-1" ariaLabel={i.label} />
          <div className="w-12 shrink-0 text-end font-mono tabular-nums">{i.count.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-[30vh] items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">{t("admin.loading", { defaultValue: "Loading…" })}</span>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-3">
      <Notice tone="danger">{t("admin.loadError")}</Notice>
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
  const apiPlanTotal = Object.values(m.apiPlanCounts).reduce((s, c) => s + c, 0);
  return (
    <div>
      {/* §01 Census — the soft counts as dense mono readouts, not a tile grid */}
      <DocSection n="01" title={t("admin.tabs.overview")} note={t("admin.censusNote", { defaultValue: "Census" })}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.totalUsers")} value={m.totalUsers.toLocaleString()} />
          <ReadoutRow label={t("admin.totalAnalyses")} value={m.totalAnalyses.toLocaleString()} />
          <ReadoutRow label={t("admin.verified")} value={`${m.verifiedUsers.toLocaleString()} · ${m.unverifiedUsers.toLocaleString()} ${t("admin.unverified")}`} />
          <ReadoutRow label={t("admin.twofa")} value={m.twofaUsers.toLocaleString()} />
          <ReadoutRow label={t("admin.admins")} value={m.adminUsers.toLocaleString()} />
          <ReadoutRow label={t("admin.estMrr")} value={money(m.estimatedMrrCents)} />
        </ReadoutGrid>
      </DocSection>

      {/* §02 Signals — the number is the content, the stamp colour is the state */}
      <DocSection n="02" title={t("admin.signalsTitle", { defaultValue: "Signals" })}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.locked")} value={signalTag(m.lockedUsers, "warning")} />
          <ReadoutRow label={t("admin.failedLogins24h")} value={signalTag(m.failedLogins24h, "warning")} />
        </ReadoutGrid>
      </DocSection>

      {/* §03 Plan distribution — figure-framed bar readouts */}
      <DocSection n="03" title={t("admin.planMix")}>
        <div className="grid gap-5 md:grid-cols-2">
          <Figure n={1} label={t("admin.planMix")} actions={<Reading label={t("admin.users")} value={m.totalUsers.toLocaleString()} />}>
            <Bars items={PLANS.map((p) => ({ label: p, count: m.planCounts[p] ?? 0 }))} />
          </Figure>
          <Figure n={2} label={t("admin.apiPlanMix")} actions={<Reading label={t("admin.users")} value={apiPlanTotal.toLocaleString()} />}>
            <Bars items={Object.entries(m.apiPlanCounts).map(([label, count]) => ({ label, count }))} />
          </Figure>
        </div>
      </DocSection>

      {/* §04 New signups — mono readouts */}
      <DocSection n="04" title={t("admin.newSignups")}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.today")} value={m.signups.today.toLocaleString()} />
          <ReadoutRow label={t("admin.days7")} value={m.signups.last7d.toLocaleString()} />
          <ReadoutRow label={t("admin.days30")} value={m.signups.last30d.toLocaleString()} />
        </ReadoutGrid>
      </DocSection>
    </div>
  );
}

// ── User detail drawer ──────────────────────────────────────────────────────

function UserDetailModal({ userId, onClose, onChanged }: { userId: number; onClose: () => void; onChanged?: () => void }) {
  const { t } = useTranslation("common");
  const { isRTL } = useLanguage();
  const [d, setD] = useState<api.AdminUserDetail | null>(null);
  const [audit, setAudit] = useState<api.AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; destructive?: boolean; run: () => void } | null>(null);

  const load = useCallback(() => {
    setError(false);
    api.getAdminUserDetail(userId).then(setD).catch(() => setError(true));
    api.getAdminUserAudit(userId, 25).then(setAudit).catch(() => undefined);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const perform = async (fn: () => Promise<void>, opts: { closeAfter?: boolean }) => {
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

  // Destructive/irreversible actions route through an AlertDialog confirmation
  // (a real focus-trapped dialog) instead of the browser's window.confirm.
  const runAction = (
    fn: () => Promise<void>,
    opts: { confirm?: string; destructive?: boolean; closeAfter?: boolean } = {},
  ) => {
    if (opts.confirm) {
      setConfirm({
        message: opts.confirm,
        destructive: opts.destructive,
        run: () => {
          setConfirm(null);
          void perform(fn, opts);
        },
      });
      return;
    }
    void perform(fn, opts);
  };

  const quota = d?.quota as { used?: number; limit?: number; unlimited?: boolean } | undefined;
  const apiSpend = d ? (d.apiUsage.monthlyPriceCents + d.apiUsage.estimatedCostCents) : 0;

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent
          side={isRTL ? "left" : "right"}
          aria-describedby={undefined}
          className="w-full overflow-y-auto border-s border-border bg-card p-6 sm:max-w-xl"
        >
          <SheetHeader className="mb-4 space-y-0 text-start">
            <SheetTitle className="t-h3">{t("admin.userDetail")}</SheetTitle>
          </SheetHeader>
          {error ? <LoadError onRetry={load} /> : !d ? <Spinner /> : (
          <div className="space-y-2">
            <Group title={t("admin.identity")}>
              <FieldSheet>
                <DetailRow label="ID" value={<span className="font-mono tabular-nums">{d.user.id}</span>} />
                <DetailRow
                  label={t("admin.username")}
                  value={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.user.username}</span>
                      {d.user.isAdmin && <span className="text-primary" aria-hidden="true">★</span>}
                      {!d.user.active && <StatusTag tone="danger">{t("admin.suspended")}</StatusTag>}
                    </span>
                  }
                />
                <DetailRow label={t("admin.email")} value={d.user.email || "—"} />
                <DetailRow label={t("admin.verified")} value={d.user.emailVerified ? <StatusTag tone="ok">✓</StatusTag> : "—"} />
                <DetailRow label={t("admin.twofa")} value={d.user.twofaEnabled ? <StatusTag tone="ok">✓</StatusTag> : "—"} />
                <DetailRow label={t("admin.created")} value={<span className="font-mono tabular-nums">{fmtDate(d.user.createdAt)}</span>} />
                <DetailRow label={t("admin.lastLogin")} value={<span className="font-mono tabular-nums">{fmtDateTime(d.user.lastLoginAt)}</span>} />
                <DetailRow
                  label={t("admin.failedLogins")}
                  value={<span className={cn("font-mono tabular-nums", d.user.failedLoginCount >= 5 ? "text-destructive" : d.user.failedLoginCount >= 1 ? "text-warning" : "")}>{d.user.failedLoginCount}</span>}
                />
                <DetailRow label={t("admin.locked")} value={d.user.locked ? <span className="font-mono tabular-nums text-warning">{fmtDateTime(d.user.lockedUntil)}</span> : "—"} />
                <DetailRow label={t("admin.sessionVersion")} value={<span className="font-mono tabular-nums">{d.user.sessionVersion}</span>} />
              </FieldSheet>
            </Group>

            <Group title={t("admin.planSpend")}>
              <FieldSheet>
                <DetailRow
                  label={t("admin.plan")}
                  value={<span className="inline-flex items-center gap-2"><span className="font-mono">{d.subscription.plan}</span><StatusTag tone={subStatusTone(d.subscription.status)}>{d.subscription.status}</StatusTag></span>}
                />
                <Field label={t("admin.apiPlanLabel")} align="center" className="py-3">
                  <Select value={d.apiUsage.apiPlan} onValueChange={(v) => void runAction(() => api.setUserApiPlan(userId, v))}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{api.API_PLAN_CODES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <DetailRow label={t("admin.estMonthlySpend")} value={<span className="font-mono">{money(apiSpend)}</span>} />
                <DetailRow label={t("admin.lifetimePaid")} value={<span className="font-mono">{money(d.lifetimePaidCents)}</span>} />
                <DetailRow label={t("admin.renewsOn")} value={<span className="font-mono tabular-nums">{fmtDate(d.subscription.currentPeriodEnd)}</span>} />
                <DetailRow label={t("admin.stripeCustomer")} value={<span className="font-mono text-xs">{d.subscription.stripeCustomerId || "—"}</span>} />
              </FieldSheet>
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
                  onClick={() => void runAction(() => api.deleteUser(userId), { confirm: t("admin.confirmDelete"), destructive: true, closeAfter: true })}
                >
                  {t("admin.deleteUser")}
                </Button>
              </div>
            </Group>

            <Group title={t("admin.consumption")}>
              <FieldSheet>
                <DetailRow label={t("admin.usage")} value={<span className="font-mono tabular-nums">{quota?.unlimited ? "∞" : `${quota?.used ?? 0} / ${quota?.limit ?? 0}`}</span>} />
                <DetailRow label={t("admin.apiCalls")} value={<span className="font-mono tabular-nums">{d.apiUsage.calls}</span>} />
                <DetailRow label={t("admin.apiPairs")} value={<span className="font-mono tabular-nums">{d.apiUsage.pairs}</span>} />
                <DetailRow label={t("admin.analyses")} value={<span className="font-mono tabular-nums">{d.activity.analysesCount}</span>} />
                <DetailRow label={t("admin.lastAnalysis")} value={<span className="font-mono tabular-nums">{fmtDateTime(d.activity.lastAnalysisAt)}</span>} />
                <DetailRow label={t("admin.avgSimilarity")} value={<span className="font-mono tabular-nums">{d.activity.avgSimilarity ?? "—"}</span>} />
              </FieldSheet>
            </Group>

            <Group title={t("admin.payments")}>
              {d.payments.length === 0 ? (
                <Notice tone="info">{t("admin.noPayments")}</Notice>
              ) : (
                <Ledger columns="1.75rem minmax(0,1fr) auto">
                  <LedgerHead cells={["#", t("admin.payments"), t("admin.when")]} aligns={["start", "start", "end"]} />
                  {d.payments.map((p, i) => (
                    <LedgerRow key={p.id}>
                      <LedgerCell><Serial>{i + 1}</Serial></LedgerCell>
                      <LedgerCell>
                        <span className="font-mono tabular-nums">{money(p.netCents)}</span>
                        <StatusTag tone={paymentTone(p.status)} className="ms-2">{p.status}</StatusTag>
                        <span className="ms-1 text-xs text-muted-foreground">{p.product}</span>
                      </LedgerCell>
                      <LedgerCell align="end" mono className="text-xs text-muted-foreground">{fmtDate(p.paidAt || p.createdAt)}</LedgerCell>
                    </LedgerRow>
                  ))}
                </Ledger>
              )}
            </Group>

            <Group title={t("admin.apiKeys")}>
              {d.apiKeys.length === 0 ? (
                <Notice tone="info">{t("admin.noKeys")}</Notice>
              ) : (
                <Ledger columns="1.75rem minmax(0,1fr) auto">
                  <LedgerHead cells={["#", t("admin.apiKeys"), t("admin.lastActive")]} aligns={["start", "start", "end"]} />
                  {d.apiKeys.map((k, i) => (
                    <LedgerRow key={k.id}>
                      <LedgerCell><Serial>{i + 1}</Serial></LedgerCell>
                      <LedgerCell>
                        <span className="font-mono">{k.prefix}</span>
                        {k.revoked && <StatusTag tone="danger" className="ms-2">{t("admin.revokedKeys")}</StatusTag>}
                      </LedgerCell>
                      <LedgerCell align="end" mono className="text-xs text-muted-foreground">{fmtDate(k.lastUsedAt)}</LedgerCell>
                    </LedgerRow>
                  ))}
                </Ledger>
              )}
            </Group>

            <Group title={t("admin.securityHistory")}>
              {audit.length === 0 ? (
                <Notice tone="info">{t("admin.noData")}</Notice>
              ) : (
                <Ledger columns="1.75rem minmax(0,1fr) auto">
                  <LedgerHead cells={["#", t("admin.action"), t("admin.when")]} aligns={["start", "start", "end"]} />
                  {audit.map((a, i) => (
                    <LedgerRow key={a.id}>
                      <LedgerCell><Serial>{i + 1}</Serial></LedgerCell>
                      <LedgerCell><span className="font-mono text-xs text-foreground">{a.action}</span></LedgerCell>
                      <LedgerCell align="end" mono className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</LedgerCell>
                    </LedgerRow>
                  ))}
                </Ledger>
              )}
            </Group>
          </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={cn(confirm?.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => confirm?.run()}
            >
              {t("admin.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────

const USERS_COLUMNS =
  "2.5rem minmax(7rem,1.3fr) minmax(0,1.6fr) 3.25rem 3.25rem 6.5rem 6.5rem 6.5rem 6.5rem";

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
  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <Panel
        label={t("admin.users")}
        bodyClassName="p-0"
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
        <Ledger columns={USERS_COLUMNS} className="rounded-none border-0 bg-transparent">
          <LedgerHead
            cells={["#", t("admin.username"), t("admin.email"), t("admin.verified"), t("admin.twofa"), t("admin.status"), t("admin.usage"), t("admin.lastActive"), t("admin.plan")]}
            aligns={["start", "start", "start", "start", "start", "start", "end", "start", "start"]}
          />
          {rows.map((u, i) => (
            <LedgerRow key={u.id} className="hover:bg-muted/40">
              <LedgerCell><Serial tone={u.locked ? "primary" : "muted"}>{(page - 1) * perPage + i + 1}</Serial></LedgerCell>
              <LedgerCell>
                <button
                  type="button"
                  onClick={() => setDetailId(u.id)}
                  className="inline-flex items-center gap-1 text-start font-medium text-foreground hover:text-primary hover:underline"
                >
                  {u.username}
                  {u.isAdmin && <span className="text-xs text-primary" aria-hidden="true">★</span>}
                  {u.locked && (
                    <>
                      <Lock className="h-3 w-3 text-destructive" aria-hidden="true" />
                      <span className="sr-only">{t("admin.locked")}</span>
                    </>
                  )}
                </button>
              </LedgerCell>
              <LedgerCell className="truncate text-muted-foreground">{u.email || "—"}</LedgerCell>
              <LedgerCell>{u.emailVerified ? "✓" : "—"}</LedgerCell>
              <LedgerCell>{u.twofaEnabled ? "✓" : "—"}</LedgerCell>
              <LedgerCell><StatusTag tone={subStatusTone(u.status)}>{u.status}</StatusTag></LedgerCell>
              <LedgerCell align="end" mono>
                <span className={usageInk(u.usagePct)}>{u.usagePct === null ? "∞" : `${u.usageUsed}/${u.usageLimit}`}</span>
              </LedgerCell>
              <LedgerCell className="text-muted-foreground">{u.lastActive ? fmtDate(u.lastActive) : t("admin.never")}</LedgerCell>
              <LedgerCell>
                <Select value={u.plan} onValueChange={(v) => changePlan(u.id, v)}>
                  <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </LedgerCell>
            </LedgerRow>
          ))}
          {data && rows.length === 0 && <LedgerEmpty>{t("admin.noUsers")}</LedgerEmpty>}
        </Ledger>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">{t("admin.showing")} {rows.length} {t("admin.of")} {total}</span>
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
  const planLedger = (rows: api.AdminRevenue["basePlans"], n: string, title: string) => {
    const subs = rows.reduce((s, p) => s + p.subscribers, 0);
    const monthly = rows.reduce((s, p) => s + p.monthlyCents, 0);
    return (
      <DocSection n={n} title={title}>
        <Ledger columns="2.5rem minmax(0,1fr) 6rem 6rem 7rem">
          <LedgerHead
            cells={["#", t("admin.plan"), t("admin.subscribers"), t("admin.price"), t("admin.monthly")]}
            aligns={["start", "start", "end", "end", "end"]}
          />
          {rows.map((p, i) => (
            <LedgerRow key={p.code}>
              <LedgerCell><Serial>{i + 1}</Serial></LedgerCell>
              <LedgerCell className="font-medium">{p.name}</LedgerCell>
              <LedgerCell align="end" mono>{p.subscribers}</LedgerCell>
              <LedgerCell align="end" mono>{money(p.priceCents)}</LedgerCell>
              <LedgerCell align="end" mono className="font-semibold text-foreground">{money(p.monthlyCents)}</LedgerCell>
            </LedgerRow>
          ))}
          <LedgerFooter left={`${t("admin.subscribers")} · ${subs.toLocaleString()}`} right={`Σ ${money(monthly)}`} />
        </Ledger>
      </DocSection>
    );
  };
  return (
    <div>
      <Notice tone="warning">{t("admin.estimatedNote")}</Notice>

      {/* §01 Estimated — MRR + usage revenue + the past-due / canceled signals */}
      <DocSection n="01" title={t("admin.estimatedRevenueTitle", { defaultValue: "Estimated" })}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.estMrr")} value={money(r.estimatedMrrCents)} />
          <ReadoutRow label={t("admin.usageRevenue")} value={money(r.estimatedUsageRevenueCents)} />
          <ReadoutRow label={t("admin.pastDue")} value={signalTag(r.pastDue, "warning")} />
          <ReadoutRow label={t("admin.canceled")} value={signalTag(r.canceled, "danger")} />
        </ReadoutGrid>
      </DocSection>

      {/* §02 Actual — collected from the Stripe payments ledger */}
      <DocSection n="02" title={t("admin.actualRevenueTitle")}>
        {r.paymentsCount === 0 ? (
          <Notice tone="info">{t("admin.ledgerEmpty")}</Notice>
        ) : (
          <ReadoutGrid>
            <ReadoutRow label={t("admin.actualRevenue")} value={money(r.actualCollectedCents)} />
            <ReadoutRow label={t("admin.grossPaid")} value={money(r.grossPaidCents)} />
            <ReadoutRow label={t("admin.refunds")} value={money(r.refundsCents)} />
            <ReadoutRow
              label={t("admin.failedPayments")}
              value={
                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">{money(r.failedPaymentsCents)}</span>
                  {signalTag(r.failedPaymentsCount, "danger")}
                </span>
              }
            />
          </ReadoutGrid>
        )}
      </DocSection>

      {planLedger(r.basePlans, "03", t("admin.perPlan"))}
      {planLedger(r.apiPlans, "04", t("admin.apiRevenue"))}
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
    <div>
      {/* §01 Summary — the period-scoped counts + quota signals as dense readouts */}
      <DocSection n="01" title={t("admin.tabs.usage")} actions={<Reading label={t("admin.period")} value={u.period} tone="primary" />}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.interactiveAnalyses")} value={u.interactiveAnalyses.toLocaleString()} />
          <ReadoutRow label={t("admin.apiCalls")} value={u.apiCalls.toLocaleString()} />
          <ReadoutRow label={t("admin.apiPairs")} value={u.apiPairs.toLocaleString()} />
          <ReadoutRow label={t("admin.overQuota")} value={signalTag(u.overQuotaUsers, "danger")} />
          <ReadoutRow label={t("admin.nearQuota")} value={signalTag(u.nearQuotaUsers, "warning")} />
        </ReadoutGrid>
      </DocSection>

      {/* §02 Top interactive — distribution readout, ruled not boxed */}
      <DocSection n="02" title={t("admin.topInteractive")}>
        {u.topInteractive.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("admin.noData")}</div>
        ) : (
          <Bars items={u.topInteractive.map((x) => ({ label: x.username, count: x.analyses }))} />
        )}
      </DocSection>

      {/* §03 Top API — ruled ledger with a Σ footer */}
      <DocSection n="03" title={t("admin.topApi")}>
        <Ledger columns="2.5rem minmax(0,1fr) 5rem 5rem">
          <LedgerHead cells={["#", t("admin.username"), t("admin.calls"), t("admin.pairs")]} aligns={["start", "start", "end", "end"]} />
          {u.topApi.map((x, i) => (
            <LedgerRow key={x.userId}>
              <LedgerCell><Serial tone={i === 0 ? "primary" : "muted"}>{i + 1}</Serial></LedgerCell>
              <LedgerCell>{x.username}</LedgerCell>
              <LedgerCell align="end" mono>{x.calls.toLocaleString()}</LedgerCell>
              <LedgerCell align="end" mono>{x.pairs.toLocaleString()}</LedgerCell>
            </LedgerRow>
          ))}
          {u.topApi.length === 0 ? (
            <LedgerEmpty>{t("admin.noData")}</LedgerEmpty>
          ) : (
            <LedgerFooter
              left={`${t("admin.calls")} / ${t("admin.pairs")}`}
              right={`Σ ${u.topApi.reduce((s, x) => s + x.calls, 0).toLocaleString()} / ${u.topApi.reduce((s, x) => s + x.pairs, 0).toLocaleString()}`}
            />
          )}
        </Ledger>
      </DocSection>

      <div className="mt-6 font-mono text-xs text-muted-foreground">{u.note}</div>
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
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <Figure n={1} label={t("admin.signupsPerDay")} actions={total(sum(a.signupsPerDay))}><Bars items={asBars(a.signupsPerDay)} /></Figure>
        <Figure n={2} label={t("admin.analysesPerDay")} actions={total(sum(a.analysesPerDay))}><Bars items={asBars(a.analysesPerDay)} /></Figure>
        <Figure n={3} label={t("admin.dau")} actions={total(sum(a.activeUsersPerDay))}><Bars items={asBars(a.activeUsersPerDay)} /></Figure>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Figure n={4} label={t("admin.languageMix")} actions={total(sum(dist.languages.map((l) => ({ count: l.count }))))}>
          <Bars items={dist.languages.map((l) => ({ label: l.language, count: l.count }))} />
        </Figure>
        <Figure n={5} label={t("admin.similarityMix")} actions={total(sum(dist.similarity.map((s) => ({ count: s.count }))))}>
          <Bars items={dist.similarity.map((s) => ({ label: s.range, count: s.count }))} />
        </Figure>
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
    <div>
      {/* §01 Posture — the security counts + live alarm signals as dense readouts */}
      <DocSection n="01" title={t("admin.tabs.security")}>
        <ReadoutGrid>
          <ReadoutRow label={t("admin.locked")} value={signalTag(s.lockedCount, "warning")} />
          <ReadoutRow label={t("admin.failedLogins24h")} value={signalTag(s.failedLogins24h, "warning")} />
          <ReadoutRow label={t("admin.twofa")} value={s.twofaUsers.toLocaleString()} />
          <ReadoutRow label={t("admin.dormantKeys")} value={s.dormantApiKeys.toLocaleString()} />
          <ReadoutRow label={t("admin.revokedKeys")} value={s.revokedApiKeys.toLocaleString()} />
        </ReadoutGrid>
      </DocSection>

      {/* §02 Locked accounts — ruled ledger with a Σ footer */}
      <DocSection n="02" title={t("admin.lockedAccounts")}>
        <Ledger columns="2.5rem minmax(0,1fr) 7rem minmax(0,1fr)">
          <LedgerHead cells={["#", t("admin.username"), t("admin.failedLogins"), t("admin.lockedUntil")]} aligns={["start", "start", "end", "end"]} />
          {s.lockedAccounts.map((a, i) => (
            <LedgerRow key={a.id}>
              <LedgerCell><Serial tone="primary">{i + 1}</Serial></LedgerCell>
              <LedgerCell className="font-medium">{a.username}</LedgerCell>
              <LedgerCell align="end"><StatusTag tone={failedTone(a.failedLoginCount)}>{a.failedLoginCount}</StatusTag></LedgerCell>
              <LedgerCell align="end" mono className="text-xs text-muted-foreground">{fmtDateTime(a.lockedUntil)}</LedgerCell>
            </LedgerRow>
          ))}
          {s.lockedAccounts.length === 0 ? (
            <LedgerEmpty>{t("admin.noLocked")}</LedgerEmpty>
          ) : (
            <LedgerFooter
              left={`${s.lockedAccounts.length} ${t("admin.lockedAccounts")}`}
              right={`Σ ${s.lockedAccounts.reduce((sum, a) => sum + a.failedLoginCount, 0).toLocaleString()}`}
            />
          )}
        </Ledger>
      </DocSection>

      {/* §03 Admin actions — recent audit trail */}
      <DocSection n="03" title={t("admin.adminActions")}>
        <Ledger columns="2.5rem minmax(0,1fr) auto">
          <LedgerHead cells={["#", t("admin.action"), t("admin.when")]} aligns={["start", "start", "end"]} />
          {s.recentAdminActions.map((a, i) => (
            <LedgerRow key={a.id}>
              <LedgerCell><Serial>{i + 1}</Serial></LedgerCell>
              <LedgerCell className="truncate">
                <span className="font-mono text-xs text-foreground">{a.action}</span>
                {a.detail ? <span className="font-mono text-xs text-muted-foreground"> · {a.detail}</span> : null}
              </LedgerCell>
              <LedgerCell align="end" mono className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</LedgerCell>
            </LedgerRow>
          ))}
          {s.recentAdminActions.length === 0 && <LedgerEmpty>{t("admin.noData")}</LedgerEmpty>}
        </Ledger>
      </DocSection>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

const Admin = () => {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<Tab>("overview");
  // A lightweight, always-on read powering the rail's live console readings.
  const { data: m } = useLoad(() => api.getAdminMetrics());

  // Live security signals — quiet (default) at zero, escalating when the alarm fires.
  const lockedTone: "default" | "warning" = m && m.lockedUsers > 0 ? "warning" : "default";
  const failedTone24h: "default" | "warning" | "danger" =
    !m ? "default" : m.failedLogins24h >= 5 ? "danger" : m.failedLogins24h > 0 ? "warning" : "default";

  return (
    <div className="space-y-6 animate-fade-in">
      <Masthead
        kicker={t("admin.eyebrow", { defaultValue: "Operations console" })}
        title={t("admin.title")}
        description={t("admin.subtitle")}
        actions={<span className="stamp">{t("admin.classification", { defaultValue: "Restricted" })}</span>}
      />

      {/* Instrument-document layout: the console section index + live readings sit
          in the margin rail; the active section's readouts/ledgers fill the wide main. */}
      <DocFrame
        rail={
          <>
            {/* Console section index — a mono §NN table of contents wired to the tab state */}
            <RailNav
              label={t("admin.sectionsLabel", { defaultValue: "Sections" })}
              items={TABS.map((tb, i) => ({
                n: String(i + 1).padStart(2, "0"),
                label: t(`admin.tabs.${tb}`),
                active: tab === tb,
                onClick: () => setTab(tb),
              }))}
            />

            {/* Always-on census — folded out of the masthead into the margin */}
            <RailReadings
              label={t("admin.censusLabel", { defaultValue: "Census" })}
              items={[
                { label: t("admin.totalUsers"), value: m ? m.totalUsers.toLocaleString() : "—" },
                { label: t("admin.estMrr"), value: m ? money(m.estimatedMrrCents) : "—" },
                { label: t("admin.verified"), value: m ? m.verifiedUsers.toLocaleString() : "—" },
              ]}
            />

            {/* Live security signals — the colour is the alarm, the number is the content */}
            <RailReadings
              label={t("admin.signalsLabel", { defaultValue: "Signals" })}
              items={[
                { label: t("admin.locked"), value: m ? m.lockedUsers.toLocaleString() : "—", tone: lockedTone },
                { label: t("admin.failedLogins24h"), value: m ? m.failedLogins24h.toLocaleString() : "—", tone: failedTone24h },
              ]}
            />
          </>
        }
      >
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab />}
        {tab === "revenue" && <RevenueTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "security" && <SecurityTab />}
      </DocFrame>
    </div>
  );
};

export default Admin;
