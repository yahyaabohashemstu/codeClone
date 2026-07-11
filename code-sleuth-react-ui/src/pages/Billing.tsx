import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2, Settings, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Masthead, FieldSheet, Field, Panel, Serial } from "@/components/dossier/Dossier";
import {
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

  useEffect(() => {
    Promise.all([getBillingSummary(), getPlans()])
      .then(([s, p]) => {
        setSummary(s);
        setPlans(p.plans);
        setBillingEnabled(p.billingEnabled);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

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
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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
            <span className="text-primary">∞</span>
          ) : (
            <span className={cn(overQuota && "text-destructive")}>
              {summary.used}/{summary.limit}
            </span>
          ),
        },
      ]
    : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
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

      {/* Account statement — margin-label fields */}
      {summary && (
        <FieldSheet>
          <Field label={t("billing.currentPlan")} align="center">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="t-h4 font-mono">{summary.planName}</span>
              <span className="badge-success">{summary.status}</span>
            </div>
          </Field>

          <Field label={t("billing.usageThisMonth")}>
            {summary.unlimited ? (
              <div className="flex items-center gap-1.5 font-mono text-lg font-semibold text-foreground">
                <Zap className="h-4 w-4 text-primary" /> {t("billing.unlimited")}
              </div>
            ) : (
              <div className="max-w-sm">
                <div className="flex items-baseline gap-2 font-mono tabular-nums">
                  <span className="text-2xl font-semibold text-foreground">{summary.used}</span>
                  <span className="text-sm text-muted-foreground">
                    {t("billing.of")} {summary.limit}
                  </span>
                  <span
                    className={cn(
                      "ms-auto text-sm font-semibold",
                      overQuota ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {usagePct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                  <div
                    className={cn("h-full transition-all", overQuota ? "bg-destructive" : "bg-primary")}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                {summary.remaining !== null && (
                  <div className="mt-1.5 font-mono text-xs text-muted-foreground">
                    {t("billing.remaining", { count: summary.remaining })}
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field
            label={t("billing.period", { defaultValue: "Billing period" })}
            align="center"
          >
            <div className="font-mono text-sm text-foreground">
              {summary.period}
              {renewsOn && (
                <span className="ms-2 text-muted-foreground">
                  {t("billing.renewsOn", { defaultValue: "renews" })} {renewsOn}
                </span>
              )}
            </div>
          </Field>
        </FieldSheet>
      )}

      {!billingEnabled && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("billing.billingDisabled")}</span>
        </div>
      )}

      {/* Plans — a comparison ledger, one ruled row per tier */}
      <Panel label={t("billing.availablePlans")} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-border t-label [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-normal">
                <th className="w-10">#</th>
                <th>{t("billing.colTier", { defaultValue: "Tier" })}</th>
                <th>{t("billing.colPrice", { defaultValue: "Price" })}</th>
                <th>{t("billing.usageThisMonth")}</th>
                <th className="text-end" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((plan, i) => {
                const isCurrent = summary?.plan === plan.code;
                const isFree = plan.code === "free";
                const isUpgrade = currentIndex >= 0 && i > currentIndex;
                return (
                  <tr
                    key={plan.code}
                    className={cn("[&>td]:px-5 [&>td]:py-4 [&>td]:align-middle", isCurrent && "bg-primary/5")}
                  >
                    <td>
                      <Serial tone={isCurrent ? "primary" : "muted"}>{i + 1}</Serial>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="t-h4 font-mono">{plan.name}</span>
                        {isCurrent && (
                          <span className="badge-success flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> {t("billing.current")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-baseline gap-1 font-mono tabular-nums">
                        <span className="t-stat text-xl">
                          {plan.priceCents === 0
                            ? t("billing.free")
                            : `$${(plan.priceCents / 100).toFixed(0)}`}
                        </span>
                        {plan.priceCents > 0 && (
                          <span className="text-sm font-normal text-muted-foreground">
                            {t("billing.perMonth")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono tabular-nums text-foreground">
                      {plan.unlimited ? t("billing.unlimited") : plan.monthlyAnalysisQuota}
                    </td>
                    <td className="text-end">
                      {!isCurrent && !isFree && (
                        isUpgrade ? (
                          <Button
                            onClick={() => handleChoose(plan.code)}
                            disabled={checkingOut === plan.code}
                            className="h-9 gap-2"
                          >
                            {checkingOut === plan.code ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>{t("billing.choose")}</>
                            )}
                          </Button>
                        ) : (
                          // Lower tier than the current plan — a downgrade, so its
                          // subscribe button is disabled (its features are already included).
                          <Button variant="outline" disabled className="h-9 opacity-60">
                            {t("billing.includedInPlan")}
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default Billing;
