import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { ControlStrip, OverprintMeter, RegMark, Serial, Stamp } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const engineLabels = ["AST", "Fingerprint", "Neural"];

/* The signals index prints each capability as an ink in the legend —
   the same palette the whole instrument reads in. */
const featureInks = [
  "hsl(var(--plate-a))",
  "hsl(var(--plate-b))",
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
];

const DEMO_SCORE = 87;

const Home = () => {
  const { isAuthenticated } = useAuth();
  const { formatNumber } = useLanguage();
  const { t } = useTranslation("common");
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <PageLoader />;
  if (error) return <PageError message={error} onRetry={fetchHome} />;

  const trustSignals = t("home.trustSignals", { returnObjects: true }) as string[];

  const features = (
    t("home.features", { returnObjects: true }) as Array<{ title: string; description: string }>
  ).map((feat, i) => ({ ...feat, ink: featureInks[i % featureInks.length] }));

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  const counters = home
    ? [
        { k: t("home.stats.analysesRun"), v: formatNumber(home.totalAnalyses) },
        { k: t("home.stats.languagesSupported"), v: formatNumber(home.languagesSupported) },
        ...(home.userAnalyses > 0
          ? [{ k: t("home.stats.currentUserAnalyses"), v: formatNumber(home.userAnalyses) }]
          : []),
      ]
    : [];

  return (
    <div className="mx-auto max-w-[76rem]">
      {/* ── Sheet slug: job line along the top edge ── */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
        <span className="press-slug flex items-center gap-2 text-foreground">
          <RegMark className="h-3.5 w-3.5 text-primary" />
          Clone Lens · {t("home.pairwise")}
        </span>
        <span className="press-slug hidden sm:inline">{engineLabels.join(" / ")}</span>
      </div>

      {/* ── The registration moment ── */}
      <section className="pt-10 lg:pt-16">
        <h1
          className="font-display font-extrabold uppercase leading-[0.94] text-foreground"
          style={{ fontSize: "clamp(2.4rem, 6.4vw, 5.5rem)", fontStretch: "122%", letterSpacing: "-0.01em", textWrap: "balance" }}
        >
          {t("home.titlePrefix")}{" "}
          {/* The key phrase prints three times — cyan plate, magenta plate,
              and the black impression on top, sliding into register. */}
          {/* Layers wrap identically (same text, same width), so line breaks stay in register. */}
          <span className="relative inline-block">
            <span aria-hidden className="absolute inset-0 animate-register-a text-plate-a motion-reduce:translate-x-[-0.045em]">
              {t("home.titleHighlight")}
            </span>
            <span aria-hidden className="absolute inset-0 animate-register-b text-plate-b motion-reduce:translate-x-[0.045em]">
              {t("home.titleHighlight")}
            </span>
            <span className="relative">{t("home.titleHighlight")}</span>
          </span>
        </h1>

        <div className="mt-10 grid gap-9 border-t-2 border-foreground pt-8 lg:grid-cols-[1fr_18rem] lg:gap-14">
          {/* Lead */}
          <div>
            <p className="max-w-[54ch] text-[1.13rem] leading-[1.7] text-foreground">
              {t("home.description")}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button asChild size="lg" className="h-12 gap-2 px-7 text-[0.95rem]">
                <Link to={primaryHref}>
                  {isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-6 text-[0.95rem]">
                <Link to={secondaryHref}>{t("home.secondary")}</Link>
              </Button>
            </div>
          </div>

          {/* The impression counter — live figures in counter cells */}
          {counters.length > 0 && (
            <aside>
              <div className="t-label mb-3">{t("analytics.eyebrow")}</div>
              <div className="divide-y divide-border border border-border">
                {counters.map((row) => (
                  <div key={row.k} className="flex items-center justify-between gap-3 bg-card px-4 py-3.5">
                    <span className="press-slug">{row.k}</span>
                    <span
                      className="font-display text-2xl font-extrabold tabular-nums text-foreground"
                      style={{ fontStretch: "118%" }}
                    >
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </section>

      {/* ── The overlay: what a press check looks like ── */}
      <section className="mt-20 lg:mt-28">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2.5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground" style={{ fontStretch: "114%" }}>
            {t("home.pairwise")}
          </h2>
          <span className="press-slug">
            {t("home.exhibitA")} ⊕ {t("home.exhibitB")}
          </span>
        </div>

        <Link
          to={primaryHref}
          className="group block"
          aria-label={isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
        >
          <figure className="overflow-hidden border border-border bg-card transition-colors group-hover:border-foreground/40">
            <figcaption className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
              <span className="t-label flex items-center gap-2 text-foreground">{t("home.pairwise")}</span>
              <span className="press-slug">{t("home.pasteCode")}</span>
            </figcaption>

            <div className="grid items-stretch gap-5 p-6 sm:grid-cols-[1fr_auto_1fr] sm:p-9">
              {/* Plate A — loaded */}
              <div className="border border-plate-a/45 bg-plate-a/[0.05] p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Serial tone="plate-a">A</Serial>
                  <span className="t-label text-plate-a-deep">{t("home.exhibitA")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 shrink-0 text-plate-a-deep" />
                  <div className="min-w-0 text-start">
                    <div className="truncate font-mono text-[0.95rem] font-semibold text-foreground">solution_v3.py</div>
                    <div className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                      4.2 KB · 118 lines · Python
                    </div>
                  </div>
                </div>
              </div>

              {/* The registration seam */}
              <div className="flex items-center justify-center px-1" aria-hidden>
                <RegMark className="h-7 w-7 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>

              {/* Plate B — awaiting */}
              <div className="border border-dashed border-plate-b/50 p-6 transition-colors group-hover:border-plate-b group-hover:bg-plate-b/[0.04]">
                <div className="mb-4 flex items-center gap-2">
                  <Serial tone="plate-b">B</Serial>
                  <span className="t-label text-plate-b-deep">{t("home.exhibitB")}</span>
                </div>
                <div className="text-center">
                  <Upload className="mx-auto mb-2.5 h-7 w-7 text-muted-foreground" />
                  <div className="font-semibold text-foreground">{t("home.dropTitle")}</div>
                  <div className="t-xs mt-1">{t("home.dropHint")}</div>
                </div>
              </div>
            </div>

            {/* The readout this pair would print */}
            <div className="border-t border-border px-6 py-5 sm:px-9">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <span
                  className="font-display text-3xl font-extrabold tabular-nums leading-none text-foreground"
                  style={{ fontStretch: "120%" }}
                >
                  {DEMO_SCORE}%
                </span>
                <OverprintMeter value={DEMO_SCORE} className="min-w-40 flex-1" label={`${DEMO_SCORE}%`} />
                <Stamp band="flag">{t("results.similarity.high", { ns: "results" })}</Stamp>
              </div>
            </div>

            {/* Chain-of-custody — trust annotations */}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-border px-6 py-3.5">
              {trustSignals.map((item) => (
                <div key={item} className="press-slug flex items-center gap-1.5 normal-case tracking-normal">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  {item}
                </div>
              ))}
            </div>
          </figure>
        </Link>
      </section>

      {/* ── The signals: every ink in the legend ── */}
      <section className="mt-20 lg:mt-28">
        <div className="mb-1 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2.5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground" style={{ fontStretch: "114%" }}>
            {t("home.featuresTitle")}
          </h2>
          <ControlStrip className="hidden sm:inline-flex" />
        </div>
        <div className="grid gap-x-14 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-4 border-b border-border py-6 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <span aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 border border-foreground/20" style={{ background: feature.ink }} />
              <div className="min-w-0">
                <h3 className="t-h5 text-foreground">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Colophon: the drenched overprint band ── */}
      <section className="mt-20 lg:mt-28">
        <div className="relative bg-primary px-7 py-10 text-primary-foreground sm:px-10 sm:py-12">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2
                className="font-display font-extrabold uppercase leading-[1.02]"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontStretch: "118%", textWrap: "balance" }}
              >
                {t("home.ctaTitle")}
              </h2>
              <p className="mt-3.5 max-w-[52ch] text-[0.98rem] leading-relaxed text-primary-foreground/85">
                {t("home.ctaDescription")}
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="h-12 shrink-0 gap-2 border border-primary-foreground bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/15"
            >
              <Link to={primaryHref}>
                {isAuthenticated ? t("home.ctaSignedIn") : t("home.ctaSignedOut")}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          </div>
          <div className="mt-8 flex items-center justify-between border-t border-primary-foreground/25 pt-4">
            <span className="press-slug text-primary-foreground/70">Clone Lens · {engineLabels.join(" / ")}</span>
            <RegMark className="h-4 w-4 text-primary-foreground/70" />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
