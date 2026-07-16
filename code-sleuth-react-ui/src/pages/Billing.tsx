import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Infinity, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Masthead,
  FieldSheet,
  Field,
  Serial,
  SectionRule,
  Figure,
  Notice,
  StatusTag,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
} from "@/components/dossier/Dossier";
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

// Subscription status is free-form (active|trialing|past_due|unpaid|canceled|…).
// One helper maps it to a semantic tone; the mono STATUS reading and the status
// stamp both read from it, so their colour tracks the real state — never a fixed
// hue. Colour encodes meaning only.
type BillingStatusTone = "success" | "warning" | "danger" | "neutral";

const billingStatusTone = (status: string): BillingStatusTone => {
  const v = status.toLowerCase();
  if (v === "active" || v === "trialing") return "success";
  if (v === "past_due" || v === "unpaid") return "warning";
  if (v === "canceled") return "danger";
  return "neutral";
};

// Ink for a plain-text status reading. Amber text fails AA on warm paper, so the
// warning state reads in ink (text-foreground), matching the warning-band rule.
const billingStatusInk = (tone: BillingStatusTone): string =>
  tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";

const Billing = () => {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([getBillingSummary(), getPlans()])
      .then(([s, p]) => {
        setSummary(s);
        setPlans(p.plans);
        setBillingEnabled(p.billingEnabled);
      })
      .catch(() => {
        setLoadError(true);
        toast.error(t("billing.loadError"));
      })
      .finally(() => setLoading(false));
  }, [t]);

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
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">{t("billing.loading")}</span>
      </div>
    );
  }

  if (loadError && !summary) {
    return (
      <div className="animate-fade-in space-y-4">
        <Notice tone="danger" label={t("nav.billing")}>
          {t("billing.loadError")}
        </Notice>
        <Button variant="outline" size="sm" onClick={load}>
          {t("billing.retry")}
        </Button>
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
          value: (
            <span className={cn("uppercase", billingStatusInk(billingStatusTone(summary.status)))}>
              {summary.status}
            </span>
          ),
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t("billing.manageSubscription")}
            </Button>
          ) : undefined
        }
      />

      {/* Statement — usage instrument (left) + account record (right).
          The period lives in the masthead reading strip, so it is not repeated here. */}
      {summary && (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          {/* Usage — a calibrated quota gauge, not a flat progress bar */}
          <Figure n={1} label={t("billing.usageThisMonth")}>
            {summary.unlimited ? (
              <div className="flex items-center gap-2.5 py-2">
                <Infinity className="h-7 w-7 text-primary" aria-hidden="true" />
                <span className="t-stat text-2xl text-foreground">{t("billing.unlimited")}</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 font-mono tabular-nums">
                  <div className="flex items-baseline gap-2">
                    <span className="t-stat text-3xl text-foreground">{summary.used}</span>
                    <span className="text-sm text-muted-foreground">
                      {t("billing.of")} {summary.limit}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      overQuota ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {usagePct}%
                  </span>
                </div>
                {/* Calibrated quota gauge — a labeled bar read against a 0–100
                    face, with a live ticker at the current draw. Over the
                    allowance the fill reads destructive. The axis stays LTR
                    inside RTL, like data. */}
                <div dir="ltr" className="select-none">
                  <div
                    className="relative"
                    role="progressbar"
                    aria-valuenow={usagePct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("billing.usageThisMonth")}
                  >
                    <div className="h-2.5 w-full overflow-hidden rounded-sm bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-[1px] transition-[width] duration-500 motion-reduce:transition-none",
                          overQuota ? "bg-destructive" : "bg-primary",
                        )}
                        style={{ width: `${usagePct}%` }}
                      />
                    </div>
                    {[25, 50, 75].map((mark) => (
                      <span
                        key={mark}
                        className="absolute top-0 h-2.5 w-px bg-background/70"
                        style={{ left: `${mark}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    <span
                      className="absolute -top-1.5 h-[1.375rem] w-[3px] -translate-x-1/2 rounded-[1px] bg-foreground shadow-[0_0_0_2px_hsl(var(--card))]"
                      style={{ left: `${usagePct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="relative mt-1.5 h-3 font-mono text-[10px] tabular-nums text-muted-foreground">
                    <span className="absolute left-0">0</span>
                    <span className="absolute left-1/2 -translate-x-1/2">50</span>
                    <span className="absolute right-0">100</span>
                  </div>
                </div>
                {summary.remaining !== null && (
                  <div className="font-mono text-xs tabular-nums text-muted-foreground">
                    {t("billing.remaining", { count: summary.remaining })}
                  </div>
                )}
              </div>
            )}
          </Figure>

          {/* Account record — margin-label statement */}
          <FieldSheet>
            <Field label={t("billing.currentPlan")} align="center">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="t-h4">{summary.planName}</span>
                <StatusTag tone={billingStatusTone(summary.status)}>{summary.status}</StatusTag>
              </div>
            </Field>
            <Field label={t("billing.resets", { defaultValue: "Resets" })} align="center">
              <span className="font-mono text-sm tabular-nums text-foreground">{renewsOn ?? "—"}</span>
            </Field>
            <Field label={t("billing.analysesLeft", { defaultValue: "Analyses left" })} align="center">
              {summary.unlimited ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-sm text-primary">
                  <Infinity className="h-4 w-4" aria-hidden="true" /> {t("billing.unlimited")}
                </span>
              ) : (
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    overQuota ? "text-destructive" : "text-foreground",
                  )}
                >
                  {summary.remaining ?? 0}
                </span>
              )}
            </Field>
          </FieldSheet>
        </div>
      )}

      {!billingEnabled && (
        <Notice tone="warning" label={t("billing.systemNotice", { defaultValue: "System notice" })}>
          {t("billing.billingDisabled")}
        </Notice>
      )}

      {/* Plans — a comparison ledger, one ruled row per tier */}
      <section className="space-y-3">
        <SectionRule>{t("billing.availablePlans")}</SectionRule>
        <Ledger columns="2.75rem minmax(0,1fr) 6.5rem 6rem 6.5rem auto">
          <LedgerHead
            cells={[
              "#",
              t("billing.colTier", { defaultValue: "Tier" }),
              t("billing.colPrice", { defaultValue: "Price" }),
              t("billing.colQuota", { defaultValue: "Analyses / mo" }),
              t("billing.colPerAnalysis", { defaultValue: "Per analysis" }),
              "",
            ]}
            aligns={["start", "start", "end", "end", "end", "end"]}
          />
          {plans.length === 0 ? (
            <LedgerEmpty>{t("billing.noPlans")}</LedgerEmpty>
          ) : (
            plans.map((plan, i) => {
              const isCurrent = summary?.plan === plan.code;
              const isFree = plan.code === "free";
              const isUpgrade = currentIndex >= 0 && i > currentIndex;
              // Derived comparator: monthly cost amortised per analysis (cents).
              const perAnalysis =
                plan.priceCents === 0 || plan.unlimited || plan.monthlyAnalysisQuota === 0
                  ? "—"
                  : `${(plan.priceCents / plan.monthlyAnalysisQuota).toFixed(1)}¢`;
              return (
                <LedgerRow
                  key={plan.code}
                  className={cn(isCurrent && "border-s-2 border-primary bg-primary/5")}
                >
                  <LedgerCell>
                    <Serial tone={isCurrent ? "primary" : "muted"}>{i + 1}</Serial>
                  </LedgerCell>
                  <LedgerCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="t-h5">{plan.name}</span>
                      {isCurrent && <StatusTag tone="success">{t("billing.current")}</StatusTag>}
                    </div>
                  </LedgerCell>
                  <LedgerCell align="end" mono>
                    <span className="text-base font-semibold text-foreground">
                      {plan.priceCents === 0
                        ? t("billing.free")
                        : `$${(plan.priceCents / 100).toFixed(0)}`}
                    </span>
                    {plan.priceCents > 0 && (
                      <span className="ms-1 text-xs font-normal text-muted-foreground">
                        {t("billing.perMonth")}
                      </span>
                    )}
                  </LedgerCell>
                  <LedgerCell align="end" mono>
                    {plan.unlimited ? t("billing.unlimited") : plan.monthlyAnalysisQuota}
                  </LedgerCell>
                  <LedgerCell align="end" mono className="text-muted-foreground">
                    {perAnalysis}
                  </LedgerCell>
                  <LedgerCell align="end">
                    {!isCurrent && !isFree && (
                      isUpgrade ? (
                        <Button
                          onClick={() => handleChoose(plan.code)}
                          disabled={checkingOut === plan.code}
                          aria-label={t("billing.choose")}
                          className="h-9 gap-2"
                        >
                          {checkingOut === plan.code ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              <span className="sr-only">{t("billing.processing")}</span>
                            </>
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
                  </LedgerCell>
                </LedgerRow>
              );
            })
          )}
          {plans.length > 0 && (
            <LedgerFooter left={t("billing.currentPlan")} right={summary ? summary.planName : "—"} />
          )}
        </Ledger>
      </section>
    </div>
  );
};

export default Billing;
