import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { Reading, ScaleTicks } from "@/components/bench/Bench";
import { Panel } from "@/components/dossier/Dossier";
import { IconArrowRight } from "@/components/bench/icons";
import { apiFetch } from "@/lib/api";
import { formatPlanPrice, getPlans, type BillingPlan } from "@/lib/billingApi";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";
import { cn } from "@/lib/utils";

/** The instrument's nameplate: the build and the calibration run behind every reading. */
const INSTRUMENT_VERSION = "v1.0";
const CALIBRATION_DATE = "2026-07";

/* Ruled readings: two columns on small screens, N from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

/**
 * The nameplate page: what the comparator is, its live readings, the signals
 * it measures and the published rate card. Everything on it is backed by data
 * the page loads — nothing is a mock-up.
 */
const Home = () => {
  const { isAuthenticated } = useAuth();
  const { formatNumber } = useLanguage();
  const { t } = useTranslation("common");
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);

  const fetchHome = useCallback(() => {
    setLoading(true);
    setError(null);
    void apiFetch<HomeResponse>("/api/home")
      .then(setHome)
      .catch(() => setError(t("errors.generic")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    fetchHome();
  }, [fetchHome]);

  // The rate card is public on purpose: a visitor - and a payment provider
  // reviewing the business - must be able to read what the product costs
  // without creating an account. Reads the same catalogue Billing does, so
  // the public price can never drift from the charged one. A failure is
  // silent: the section simply does not print.
  useEffect(() => {
    void getPlans()
      .then((res) => setPlans(res.plans))
      .catch(() => setPlans([]));
  }, []);

  if (loading) return <PageLoader />;
  if (error) return <PageError message={error} onRetry={fetchHome} />;

  const features = t("home.features", { returnObjects: true }) as Array<{ title: string; description: string }>;

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const latestHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : null;
  const languages = home?.languagesSupported ?? 0;

  const readings = home
    ? [
        { label: t("home.stats.analysesRun"), value: formatNumber(home.totalAnalyses), note: t("history.readings.allTime") },
        { label: t("home.stats.languagesSupported"), value: formatNumber(home.languagesSupported), note: INSTRUMENT_VERSION },
        ...(home.userAnalyses > 0 ? [{ label: t("home.stats.currentUserAnalyses"), value: formatNumber(home.userAnalyses), note: undefined }] : []),
        {
          label: t("home.stats.historyReady"),
          value: home.latestAnalysisId ? t("home.stats.yes") : t("home.stats.awaiting"),
          note: home.latestAnalysisId ? `#${home.latestAnalysisId}` : undefined,
        },
      ]
    : [];

  return (
    <div className="pt-7">
      {/* Nameplate */}
      <section className="flex flex-col items-start gap-6 pb-10">
        <span className="label text-txt-muted">{t("home.kicker", { defaultValue: "Comparator" })}</span>
        <h1 className="t-statement max-w-[24ch] text-txt-primary">{t("home.statement", { defaultValue: "Code-similarity comparator." })}</h1>
        <p className="body-lg max-w-[58ch] text-txt-secondary">{t("home.lead", { defaultValue: t("home.description") })}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild size="lg">
            <Link to={primaryHref}>
              {isAuthenticated ? t("home.newComparison", { defaultValue: "New comparison" }) : t("home.primarySignedOut")}
              <IconArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/history">{t("home.openHistory", { defaultValue: "Open history" })}</Link>
          </Button>
          {latestHref && (
            <Link to={latestHref} className="link ms-1 text-[13px]">
              {t("home.secondary")}
            </Link>
          )}
        </div>

        {/* Calibration strip */}
        <div className="rule-t mt-4 flex w-full flex-wrap items-center gap-x-6 gap-y-3 pt-4">
          <div aria-hidden className="scale w-[240px]">
            <ScaleTicks />
          </div>
          <span className="mono-meta text-txt-muted">
            {t("home.calibration", {
              defaultValue: "{{version}} · {{count}} languages · calibration {{date}}",
              version: INSTRUMENT_VERSION,
              count: languages,
              date: CALIBRATION_DATE,
            })}
          </span>
        </div>
      </section>

      {/* Readings */}
      {readings.length > 0 && (
        <div className={cn(READINGS_ROW, readings.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {readings.map((r) => (
            <Reading key={r.label} label={r.label} value={r.value} note={r.note} />
          ))}
        </div>
      )}

      <div className="mt-8 space-y-5">
        {/* Signals */}
        <Panel
          label={t("home.featuresTitle")}
          actions={<span className="mono-meta hidden text-txt-muted sm:inline">{String(features.length).padStart(2, "0")}</span>}
          bodyClassName="p-0"
        >
          <div className="grid [&>*:first-child]:border-t-0 sm:grid-cols-2 sm:gap-x-12 sm:[&>*:nth-child(2)]:border-t-0">
            {features.map((feature, i) => (
              <div key={feature.title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-bench-hair px-5 py-5">
                <span className="mono-ordinal pt-1 text-txt-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <h3 className="t-h5 text-txt-primary">{feature.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-txt-secondary">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Rate card */}
        {plans.length > 0 && (
          <Panel
            label={t("home.pricingTitle")}
            actions={<span className="mono-meta hidden text-txt-muted sm:inline">USD</span>}
            bodyClassName="p-0"
          >
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="h-9 border-b border-bench-hair [&>*:last-child]:pe-5">
                    <th scope="col" className="label w-36 ps-5 text-start font-semibold text-txt-muted">
                      {t("billing.colTier")}
                    </th>
                    {plans.map((plan) => (
                      <th key={plan.code} scope="col" className="label border-s border-bench-hair ps-5 text-start font-semibold text-txt-primary">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-bench-hair [&>*:last-child]:pe-5">
                    <th scope="row" className="label ps-5 py-5 text-start font-semibold text-txt-muted">
                      {t("billing.colPrice")}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.code} className="border-s border-bench-hair ps-5 py-5 align-baseline">
                        <span className="flex items-baseline gap-1.5">
                          <span className="t-display text-[2.75rem] text-txt-primary" dir="ltr">
                            {plan.priceCents === 0 ? t("billing.free") : formatPlanPrice(plan.priceCents)}
                          </span>
                          {plan.priceCents > 0 && <span className="mono-meta text-txt-muted">{t("billing.perMonth")}</span>}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="h-[46px] [&>*:last-child]:pe-5">
                    <th scope="row" className="label ps-5 text-start font-semibold text-txt-muted">
                      {t("billing.colQuota")}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.code} className="mono-value border-s border-bench-hair ps-5 text-txt-primary">
                        {plan.unlimited ? t("billing.unlimited") : formatNumber(plan.monthlyAnalysisQuota)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-bench-hair px-5 py-4">
              <p className="max-w-[74ch] text-[13px] leading-relaxed text-txt-secondary">
                {t("home.pricingNote")}{" "}
                <Link to="/terms" className="link">
                  {t("home.pricingTerms")}
                </Link>
              </p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default Home;
