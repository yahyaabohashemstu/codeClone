import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Settings, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
      const url = await startCheckout(planCode);
      window.location.href = url;
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

  // Upgrade-only: a plan is choosable only if it ranks strictly above the current
  // plan (plans arrive ordered free < pro < team). Applies whatever the source of
  // the current plan — Stripe payment or an admin grant.
  const currentIndex = plans.findIndex((p) => p.code === summary?.plan);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
          style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
        >
          <CreditCard className="h-3 w-3" />
          {t("nav.billing")}
        </div>
        <h1 className="mt-3 t-h2">{t("billing.title")}</h1>
        <p className="mt-1 max-w-[60ch] t-body">{t("billing.subtitle")}</p>
      </div>

      {/* Current plan + usage */}
      {summary && (
        <section
          className="rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="t-label">{t("billing.currentPlan")}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">{summary.planName}</span>
                <span
                  className="rounded-full border px-2 py-0.5 text-xs"
                  style={{ borderColor: "hsl(var(--success) / 0.3)", background: "hsl(var(--success) / 0.08)", color: "hsl(var(--success))" }}
                >
                  {summary.status}
                </span>
              </div>
            </div>
            {billingEnabled && summary.plan !== "free" && (
              <Button
                variant="outline"
                onClick={handlePortal}
                disabled={openingPortal}
                className="h-9 gap-2"
              >
                {openingPortal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
                {t("billing.manageSubscription")}
              </Button>
            )}
            <div className="min-w-[220px]">
              <div className="t-label">{t("billing.usageThisMonth")}</div>
              {summary.unlimited ? (
                <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-foreground">
                  <Zap className="h-4 w-4 text-primary" /> {t("billing.unlimited")}
                </div>
              ) : (
                <>
                  <div className="mt-1 font-mono text-lg font-semibold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {summary.used} <span className="text-muted-foreground">{t("billing.of")} {summary.limit}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usagePct}%`,
                        background: usagePct >= 100 ? "hsl(var(--destructive))" : "var(--gradient-brand)",
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {!billingEnabled && (
        <div
          className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{ background: "hsl(var(--warning) / 0.08)", borderColor: "hsl(var(--warning) / 0.3)", color: "hsl(var(--warning))" }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("billing.billingDisabled")}</span>
        </div>
      )}

      {/* Plans */}
      <section>
        <h2 className="t-h3 mb-4">{t("billing.availablePlans")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan, i) => {
            const isCurrent = summary?.plan === plan.code;
            const isFree = plan.code === "free";
            const isUpgrade = currentIndex >= 0 && i > currentIndex;
            return (
              <div
                key={plan.code}
                className={cn(
                  "rounded-2xl border bg-card p-6 transition-all",
                  isCurrent ? "border-primary" : "border-border hover:-translate-y-0.5",
                )}
                style={{ boxShadow: "var(--card-shadow-rest)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-foreground">{plan.name}</span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t("billing.current")}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">
                  {plan.priceCents === 0 ? t("billing.free") : `$${(plan.priceCents / 100).toFixed(0)}`}
                  {plan.priceCents > 0 && <span className="text-sm font-normal text-muted-foreground">{t("billing.perMonth")}</span>}
                </div>
                <div className="mt-3 t-sm">
                  {plan.unlimited
                    ? t("billing.unlimited")
                    : `${plan.monthlyAnalysisQuota} ${t("billing.usageThisMonth").toLowerCase()}`}
                </div>
                {!isCurrent && !isFree && (
                  isUpgrade ? (
                    <Button
                      onClick={() => handleChoose(plan.code)}
                      disabled={checkingOut === plan.code}
                      className="mt-5 h-10 w-full gap-2 text-white"
                      style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
                    >
                      {checkingOut === plan.code
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <>{t("billing.choose")}</>}
                    </Button>
                  ) : (
                    // Lower tier than the current plan — a downgrade, so its
                    // subscribe button is disabled (its features are already included).
                    <Button variant="outline" disabled className="mt-5 h-10 w-full opacity-60">
                      {t("billing.includedInPlan")}
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Billing;
