import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Copy,
  FileText,
  Gauge,
  GitCompare,
  MessageSquare,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { Serial } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const featureIcons = [GitCompare, BarChart3, MessageSquare, Copy, Gauge, Code2];
const engineLabels = ["AST", "Fingerprint", "Neural"];

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
  ).map((feat, i) => ({ ...feat, Icon: featureIcons[i] }));

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  const marginalia = home
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
      {/* ── Running head: masthead line + folio, a document header ── */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Clone Lens · {t("home.pairwise")}</span>
        <span className="hidden sm:inline">Nº 001 — {engineLabels.join(" / ")}</span>
      </div>

      {/* ── Cover: the case headline + a magazine grid (lead prose | ruled spec sheet) ── */}
      <section className="pt-9 lg:pt-14">
        <div className="t-label flex items-center gap-2.5 text-muted-foreground">
          <span className="h-px w-10 bg-primary" />
          {engineLabels.join("  ·  ")}
        </div>

        <h1
          className="mt-6 font-display font-bold uppercase leading-[0.9] tracking-[-0.03em] text-foreground"
          style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", textWrap: "balance" }}
        >
          {t("home.titlePrefix")}{" "}
          <mark className="box-decoration-clone bg-primary/25 px-2 text-foreground">
            {t("home.titleHighlight")}
          </mark>
        </h1>

        <div className="mt-11 grid gap-9 border-t-2 border-foreground pt-8 lg:grid-cols-[1fr_16rem] lg:gap-14">
          {/* Lead — the opening statement, set large in ink */}
          <div>
            <p className="max-w-[52ch] text-[1.15rem] leading-[1.68] text-foreground">
              {t("home.description")}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button asChild size="lg" className="h-12 gap-2 px-7 text-[0.95rem]">
                <Link to={primaryHref}>
                  {isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-6 text-[0.95rem]">
                <Link to={secondaryHref}>{t("home.secondary")}</Link>
              </Button>
            </div>
          </div>

          {/* Marginalia — a mono spec sheet of live figures, ruled like a case index */}
          {marginalia.length > 0 && (
            <aside className="lg:border-s lg:border-border lg:ps-8">
              <div className="t-label mb-2.5 text-muted-foreground">{t("analytics.eyebrow")}</div>
              <dl className="divide-y divide-border">
                {marginalia.map((row) => (
                  <div key={row.k} className="flex items-baseline justify-between gap-3 py-3">
                    <dt className="font-mono text-[11px] uppercase leading-tight tracking-[0.1em] text-muted-foreground">
                      {row.k}
                    </dt>
                    <dd className="font-mono text-xl font-bold tabular-nums text-foreground">{row.v}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      </section>

      {/* ── The exhibit: the pairwise specimen, framed as the dominant piece of evidence ── */}
      <section className="mt-20 lg:mt-28">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2.5">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
            <span className="text-muted-foreground">§</span> {t("home.pairwise")}
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("home.exhibitA", { defaultValue: "Exhibit A" })} / {t("home.exhibitB", { defaultValue: "Exhibit B" })}
          </span>
        </div>

        <Link
          to={primaryHref}
          className="group block"
          aria-label={isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
        >
          <figure className="overflow-hidden rounded-lg border border-border bg-card transition-colors group-hover:border-foreground/30">
            <figcaption className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
              <span className="t-label flex items-center gap-2 text-muted-foreground">
                <span className="text-foreground">SPEC.01</span>
                {t("home.pairwise")}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{t("home.pasteCode")}</span>
            </figcaption>

            <div className="grid items-stretch gap-5 p-6 sm:grid-cols-[1fr_auto_1fr] sm:p-9">
              {/* Exhibit A — a resolved specimen */}
              <div className="rounded-md border border-success/40 bg-success/[0.06] p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Serial tone="primary">A</Serial>
                  <span className="t-label text-foreground">{t("home.exhibitA", { defaultValue: "Exhibit A" })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 shrink-0 text-success" />
                  <div className="min-w-0 text-start">
                    <div className="truncate font-mono text-[0.95rem] font-semibold text-foreground">solution_v3.py</div>
                    <div className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                      4.2 KB · 118 lines · Python
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center px-1">
                <span className="rounded-sm bg-primary px-3 py-1.5 font-display text-sm font-bold text-primary-foreground">
                  vs
                </span>
              </div>

              {/* Exhibit B — awaiting specimen */}
              <div className="rounded-md border border-dashed border-border p-6 transition-colors group-hover:border-primary/60">
                <div className="mb-4 flex items-center gap-2">
                  <Serial>B</Serial>
                  <span className="t-label">{t("home.exhibitB", { defaultValue: "Exhibit B" })}</span>
                </div>
                <div className="text-center">
                  <Upload className="mx-auto mb-2.5 h-7 w-7 text-muted-foreground" />
                  <div className="font-semibold text-foreground">{t("home.dropTitle")}</div>
                  <div className="mt-1 t-xs">{t("home.dropHint")}</div>
                </div>
              </div>
            </div>

            {/* Chain-of-custody — trust signals as mono annotations */}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-border px-6 py-3.5">
              {trustSignals.map((item) => (
                <div key={item} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  {item}
                </div>
              ))}
            </div>
          </figure>
        </Link>
      </section>

      {/* ── §01 What it measures — an editorial index, ruled, two columns ── */}
      <section className="mt-20 lg:mt-28">
        <div className="mb-1 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2.5">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
            <span className="text-muted-foreground">§01</span> {t("home.featuresTitle")}
          </h2>
          <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
            {String(features.length).padStart(2, "0")}
          </span>
        </div>
        <div className="grid gap-x-14 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.Icon;
            return (
              <div
                key={feature.title}
                className="flex items-start gap-4 border-b border-border py-6 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="font-mono text-[0.95rem] font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Colophon: the closing disposition — a heavy rule, one decisive action ── */}
      <section className="mt-20 border-t-2 border-foreground pt-9 lg:mt-28">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(1.6rem,3vw,2.25rem)] font-bold uppercase leading-[1.05] tracking-[-0.02em] text-foreground">
              {t("home.ctaTitle")}
            </h2>
            <p className="mt-3 max-w-[52ch] text-[0.98rem] leading-relaxed text-muted-foreground">
              {t("home.ctaDescription")}
            </p>
          </div>
          <Button asChild size="lg" className="h-12 shrink-0 gap-2 px-7">
            <Link to={primaryHref}>
              {isAuthenticated ? t("home.ctaSignedIn") : t("home.ctaSignedOut")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Home;
