import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PageError } from "@/components/common/PageError";
import { PageLoader } from "@/components/common/PageLoader";
import { PageHeader, Reading, Scale, Tag } from "@/components/bench/Bench";
import { Panel } from "@/components/dossier/Dossier";
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
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

/**
 * Plan & usage: the current plan read as four readings and a quota scale,
 * then the rate card as a row of hairline plan panels.
 */
const Billing = () => {
  const { t } = useTranslation("common");
  const { formatNumber } = useLanguage();
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
    return <PageLoader />;
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

  const usageValue = summary ? (summary.unlimited ? "∞" : `${summary.used}/${summary.limit}`) : "—";

  return (
    <div className="pt-7">
      <PageHeader
        kicker={t("billing.title")}
        title={summary?.planName ?? t("billing.currentPlan")}
        actions={
          billingEnabled && summary && summary.plan !== "free" ? (
            <Button variant="outline" onClick={handlePortal} disabled={openingPortal}>
              {t("billing.manageSubscription")}
            </Button>
          ) : undefined
        }
      />
      <p className="body-lg mt-3 max-w-[64ch] text-txt-secondary">{t("billing.subtitle")}</p>

      {/* Current plan, read as four readings */}
      {summary && (
        <div className={cn(READINGS_ROW, "mt-8")}>
          <Reading label={t("billing.currentPlan")} value={summary.planName} note={summary.plan} />
          <Reading label={t("billing.status")} value={summary.status} note={renewsOn ? `${t("billing.renewsOn")} ${renewsOn}` : undefined} />
          <Reading label={t("billing.period", { defaultValue: "Billing period" })} value={summary.period} />
          <Reading
            label={t("billing.usageThisMonth")}
            value={<span className={cn(overQuota && "text-signal-bench")}>{usageValue}</span>}
            note={
              summary.unlimited
                ? t("billing.unlimited")
                : summary.remaining !== null
                  ? t("billing.remaining", { count: summary.remaining })
                  : `${usagePct}%`
            }
          />
        </div>
      )}

      <div className="mt-8 space-y-5">
        {/* Quota scale */}
        {summary && !summary.unlimited && (
          <Panel label={t("billing.usageThisMonth")}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-[240px] flex-1">
                <Scale value={usagePct} quiet={!overQuota} label={`${usagePct}%`} />
                <div aria-hidden className="mono-meta-sm mt-2 flex items-start justify-between text-txt-muted">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>
              <span className="mono-value text-txt-primary" dir="ltr">
                {summary.used} {t("billing.of")} {summary.limit} · {usagePct}%
              </span>
            </div>
          </Panel>
        )}

        {!billingEnabled && (
          <div role="status" className="flex items-start gap-3 border border-bench-strong px-4 py-3">
            <span aria-hidden className="lamp mt-0.5" />
            <span className="text-[13px] leading-relaxed text-txt-secondary">{t("billing.billingDisabled")}</span>
          </div>
        )}

        {/* Rate card */}
        <Panel label={t("billing.availablePlans")} actions={<span className="mono-meta text-txt-muted">USD</span>}>
          {plans.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-txt-muted">
              {t("billing.noPlans", { defaultValue: "No plans are available right now." })}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan, i) => {
                const isCurrent = summary?.plan === plan.code;
                const isFree = plan.code === "free";
                const isUpgrade = currentIndex >= 0 && i > currentIndex;
                return (
                  <article key={plan.code} className={cn("card-premium flex flex-col", isCurrent && "border-signal")}>
                    <div className="flex h-10 items-center justify-between gap-3 border-b border-bench-hair px-5">
                      <h3 className="label text-txt-primary">{plan.name}</h3>
                      {isCurrent && <Tag tone="hot">{t("billing.current")}</Tag>}
                    </div>
                    <div className="flex flex-1 flex-col gap-5 px-5 py-5">
                      <div className="flex items-baseline gap-1.5" dir="ltr">
                        <span className="mono-value text-[1.375rem] text-txt-primary">
                          {plan.priceCents === 0 ? t("billing.free") : formatPlanPrice(plan.priceCents)}
                        </span>
                        {plan.priceCents > 0 && <span className="mono-meta text-txt-muted">{t("billing.perMonth")}</span>}
                      </div>
                      <dl className="rule-t flex items-baseline justify-between gap-4 pt-3">
                        <dt className="label text-txt-muted">{t("billing.colQuota", { defaultValue: "Monthly quota" })}</dt>
                        <dd className="mono-value text-txt-primary">
                          {plan.unlimited ? t("billing.unlimited") : formatNumber(plan.monthlyAnalysisQuota)}
                        </dd>
                      </dl>
                      <div className="mt-auto pt-1">
                        {isCurrent ? (
                          <span className="mono-meta text-txt-muted">{t("billing.current")}</span>
                        ) : isFree ? null : isUpgrade ? (
                          <Button
                            onClick={() => handleChoose(plan.code)}
                            disabled={checkingOut === plan.code}
                            className="w-full"
                            aria-label={t("billing.choose")}
                          >
                            {t("billing.choose")}
                          </Button>
                        ) : (
                          // Lower tier than the current plan — a downgrade, so its
                          // subscribe button is disabled (its features are already included).
                          <Button variant="outline" disabled className="w-full">
                            {t("billing.includedInPlan")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default Billing;
