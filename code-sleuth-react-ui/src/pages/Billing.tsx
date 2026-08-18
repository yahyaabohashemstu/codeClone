import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Infinity as InfinityIcon, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PageError } from "@/components/common/PageError";
import { Masthead, Panel, Stamp } from "@/components/dossier/Dossier";
import {
  formatPlanPrice,
  getBillingSummary,
  getPlans,
  openBillingPortal,
  startCheckout,
  type BillingPlan,
  type BillingSummary,
} from "@/lib/billingApi";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const Billing = () => {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([getBillingSummary(), getPlans()])
      .then(([s, p]) => {
        setSummary(s);
        setPlans(p.plans);
        setBillingEnabled(p.billingEnabled);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle the return from Stripe Checkout (?status=success|cancel).
  useEffect(() => {
    const status = params.get("status");
    if (!status) return;
    if (status === "success") {
      toast.success(t("billing.checkoutSuccess"));
      getBillingSummary().then(setSummary).catch(() => undefined);
    } else if (status === "cancel") {
      toast(t("billing.checkoutCanceled"));
    }
    params.delete("status");
    setParams(params, { replace: true });
  }, [params, setParams, t]);

  const handlePortal = async () => {
    setOpeningPortal(true);
    try {
      const url = await openBillingPortal();
      window.location.href = url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        toast.error(t("billing.billingDisabled"));
      } else {
        toast.error(t("billing.checkoutError"));
      }
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleChoose = async (planCode: string) => {
    setCheckingOut(planCode);
    try {
      const res = await startCheckout(planCode);
      if (res.changed) {
        // Existing subscriber upgraded in place — no redirect; refresh the plan.
        toast.success(t("billing.checkoutSuccess"));
        const s = await getBillingSummary();
        setSummary(s);
      } else if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        toast.error(t("billing.billingDisabled"));
      } else {
        toast.error(t("billing.checkoutError"));
      }
    } finally {
      setCheckingOut(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <span className="sr-only">{t("status.loading", { defaultValue: "Loading" })}</span>
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={load} />;
  }

  const usagePct =
    summary && !summary.unlimited && summary.limit > 0
      ? Math.min(100, Math.round((summary.used / summary.limit) * 100))
      : 0;
  const overQuota = usagePct >= 100;

  // Upgrade-only: a plan is choosable only if it ranks strictly above the current
  // plan (plans arrive ordered free < pro < team). Applies whatever the source of
  // the current plan — Stripe payment or an admin grant.
  const currentIndex = plans.findIndex((p) => p.code === summary?.plan);

  const renewsOn =
    summary?.currentPeriodEnd
      ? new Date(summary.currentPeriodEnd).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  // Live mono readings for the statement masthead.
  const meta = summary
    ? [
        { label: "PLAN", value: <span className="uppercase">{summary.planName}</span> },
        {
          label: "STATUS",
          value: <span className="uppercase text-success">{summary.status}</span>,
        },
        { label: "PERIOD", value: summary.period },
        {
          label: "USAGE",
          value: summary.unlimited ? (
            <span className="text-foreground">∞</span>
          ) : (
            <span className={cn(overQuota && "text-destructive")}>
              {summary.used}/{summary.limit}
            </span>
          ),
        },
      ]
    : undefined;

  return (
    <div className="space-y-10 animate-fade-in">
      <Masthead
        kicker={t("nav.billing")}
        title={t("billing.title")}
        description={t("billing.subtitle")}
        meta={meta}
        actions={
          billingEnabled && summary && summary.plan !== "free" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              disabled={openingPortal}
              className="h-9 gap-2"
            >
              {openingPortal ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Settings className="h-3.5 w-3.5" />
              )}
              {t("billing.manageSubscription")}
            </Button>
          ) : undefined
        }
      />

      {/* The subscription statement — one sheet: the plan block beside the ink-coverage gauge */}
      {summary && (
        <Panel bare marker="§" label={t("billing.currentPlan")}>
          <div className="grid border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* The plan, stated */}
            <div className="border-b border-border p-5 md:border-b-0 md:border-e">
              <div className="flex flex-wrap items-center gap-3">
                <span className="t-h2 text-foreground">{summary.planName}</span>
                <Stamp band="pass" className="px-1.5 text-[10px]">{summary.status}</Stamp>
              </div>
              <dl className="mt-4 divide-y divide-border/60 border-t border-border/60">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="press-slug">{t("billing.period", { defaultValue: "Billing period" })}</dt>
                  <dd className="font-display text-sm font-bold tabular-nums text-foreground" style={{ fontStretch: "108%" }}>
                    {summary.period}
                  </dd>
                </div>
                {renewsOn && (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="press-slug">{t("billing.renewsOn", { defaultValue: "renews" })}</dt>
                    <dd className="font-display text-sm font-bold tabular-nums text-foreground" style={{ fontStretch: "108%" }}>
                      {renewsOn}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* The ink-coverage gauge — how much of the month's quota is laid down */}
            <div className="p-5">
              <span className="press-slug block">{t("billing.usageThisMonth")}</span>
              {summary.unlimited ? (
                <div className="mt-2 flex items-center gap-2">
                  <InfinityIcon className="h-6 w-6 text-primary" aria-hidden />
                  <span className="font-display text-2xl font-extrabold text-foreground" style={{ fontStretch: "118%" }}>
                    {t("billing.unlimited")}
                  </span>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                    <span
                      className={cn(
                        "font-display text-[2.6rem] font-extrabold leading-none",
                        overQuota ? "text-destructive" : "text-foreground",
                      )}
                      style={{ fontStretch: "120%" }}
                    >
                      {summary.used}
                    </span>
                    <span className="press-slug">
                      {t("billing.of")} {summary.limit} · {usagePct}%
                    </span>
                  </div>
                  <div
                    className="relative mt-3 h-3 overflow-hidden border border-border bg-muted"
                    role="progressbar"
                    aria-valuenow={usagePct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("billing.usageThisMonth")}
                  >
                    <div
                      className={cn("h-full transition-[width]", overQuota ? "bg-destructive" : "bg-primary")}
                      style={{ width: `${usagePct}%` }}
                    />
                    {/* quarter ticks on the gauge */}
                    {[25, 50, 75].map((tick) => (
                      <span
                        key={tick}
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-foreground/20"
                        style={{ insetInlineStart: `${tick}%` }}
                      />
                    ))}
                  </div>
                  {summary.remaining !== null && (
                    <div className="press-slug mt-2">{t("billing.remaining", { count: summary.remaining })}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </Panel>
      )}

      {!billingEnabled && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>{t("billing.billingDisabled")}</span>
        </div>
      )}

      {/* The rate card — tiers as columns, attributes as ruled rows (the printed price card) */}
      <Panel bare marker="§" label={t("billing.availablePlans")}>
        {plans.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t("billing.noPlans", { defaultValue: "No plans are available right now." })}
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] border border-border bg-card text-sm">
              <thead>
                {/* Tier row — the card's header band */}
                <tr className="border-b-2 border-foreground">
                  <th className="press-slug w-32 px-5 py-4 text-start align-bottom">
                    {t("billing.colTier", { defaultValue: "Tier" })}
                  </th>
                  {plans.map((plan) => {
                    const isCurrent = summary?.plan === plan.code;
                    return (
                      <th
                        key={plan.code}
                        className={cn(
                          "border-s border-border px-5 py-4 text-start align-bottom",
                          isCurrent && "bg-primary/5",
                        )}
                      >
                        <span className="t-h3 block text-foreground">{plan.name}</span>
                        {isCurrent && (
                          <Stamp band="neutral" className="mt-1.5 px-1.5 text-[9px]">
                            {t("billing.current")}
                          </Stamp>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Price row */}
                <tr className="border-b border-border">
                  <th className="press-slug px-5 py-4 text-start align-middle font-normal">
                    {t("billing.colPrice", { defaultValue: "Price" })}
                  </th>
                  {plans.map((plan) => {
                    const isCurrent = summary?.plan === plan.code;
                    return (
                      <td key={plan.code} className={cn("border-s border-border px-5 py-4", isCurrent && "bg-primary/5")}>
                        <span className="flex items-baseline gap-1 tabular-nums">
                          <span className="font-display text-2xl font-extrabold text-foreground" style={{ fontStretch: "118%" }}>
                            {plan.priceCents === 0 ? t("billing.free") : formatPlanPrice(plan.priceCents)}
                          </span>
                          {plan.priceCents > 0 && (
                            <span className="press-slug">{t("billing.perMonth")}</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
                {/* Quota row */}
                <tr className="border-b border-border">
                  <th className="press-slug px-5 py-4 text-start align-middle font-normal">
                    {t("billing.colQuota", { defaultValue: "Monthly quota" })}
                  </th>
                  {plans.map((plan) => {
                    const isCurrent = summary?.plan === plan.code;
                    return (
                      <td
                        key={plan.code}
                        className={cn(
                          "border-s border-border px-5 py-4 font-display font-bold tabular-nums text-foreground",
                          isCurrent && "bg-primary/5",
                        )}
                        style={{ fontStretch: "108%" }}
                      >
                        {plan.unlimited ? t("billing.unlimited") : plan.monthlyAnalysisQuota}
                      </td>
                    );
                  })}
                </tr>
                {/* Action row */}
                <tr>
                  <th className="px-5 py-4" aria-hidden />
                  {plans.map((plan, i) => {
                    const isCurrent = summary?.plan === plan.code;
                    const isFree = plan.code === "free";
                    const isUpgrade = currentIndex >= 0 && i > currentIndex;
                    return (
                      <td key={plan.code} className={cn("border-s border-border px-5 py-4", isCurrent && "bg-primary/5")}>
                        {!isCurrent && !isFree &&
                          (isUpgrade ? (
                            <Button
                              onClick={() => handleChoose(plan.code)}
                              disabled={checkingOut === plan.code}
                              className="h-9 gap-2"
                              aria-label={t("billing.choose")}
                            >
                              {checkingOut === plan.code ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  {t("billing.choose")}
                                </>
                              ) : (
                                t("billing.choose")
                              )}
                            </Button>
                          ) : (
                            // Lower tier than the current plan — a downgrade, so its
                            // subscribe button is disabled (its features are already included).
                            <Button variant="outline" disabled className="h-9 opacity-60">
                              {t("billing.includedInPlan")}
                            </Button>
                          ))}
                        {isCurrent && (
                          <span className="press-slug flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
                            {t("billing.current")}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default Billing;
