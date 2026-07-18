import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
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
import { DocSection, Figure, IndexRow, MetaStrip, Serial } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const featureIcons = [GitCompare, BarChart3, MessageSquare, Copy, Gauge, Code2];
// Forensic cross-reference codes — the ledger's right-margin catalogue glyphs,
// mono notation like the engine labels below (not translatable prose).
const featureRefs = ["TOKEN·AST", "METRICS", "AI·REVIEW", "CLONE·TYPE", "GRAPHS·LOG", "INGEST"];
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
  ).map((feat, i) => ({ ...feat, Icon: featureIcons[i], ref: featureRefs[i] }));

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  return (
    <div className="space-y-8">
      {/* ── Cover exhibit — the ink-&-ember hero slab: a fluid case title struck
             over engineering graph paper, the way a lab notebook opens a file. ── */}
      <section className="ink-panel relative overflow-hidden rounded-lg border border-border">
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 select-none font-mono text-[6.5rem] font-bold leading-none tracking-tighter text-foreground/[0.04] end-6 sm:text-[9rem]"
        >
          №01
        </span>
        <div className="relative flex flex-col gap-7 px-6 py-12 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          {/* engine signature — the three detection stages struck as printer's stamps */}
          <div className="flex flex-wrap items-center gap-2.5">
            {engineLabels.map((label) => (
              <span key={label} className="stamp">
                {label}
              </span>
            ))}
          </div>

          <h1 className="t-display max-w-[16ch] [overflow-wrap:anywhere]">
            {t("home.titlePrefix")} <span className="text-primary">{t("home.titleHighlight")}</span>
          </h1>

          <p className="max-w-[54ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("home.description")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 px-7">
              <Link to={primaryHref}>{isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-6">
              <Link to={secondaryHref}>{t("home.secondary")}</Link>
            </Button>
          </div>

          {/* live register readings — a restrained document header line, not a big-number wall */}
          <MetaStrip
            className="border-t border-border pt-6"
            items={[
              { label: t("home.stats.analysesRun"), value: home ? formatNumber(home.totalAnalyses) : "—" },
              { label: t("home.stats.languagesSupported"), value: home ? formatNumber(home.languagesSupported) : "—" },
              { label: t("home.stats.currentUserAnalyses"), value: home ? formatNumber(home.userAnalyses) : "—" },
              {
                label: t("home.stats.historyReady"),
                value: home?.latestAnalysisId ? (
                  <span className="text-success">{t("home.stats.yes")}</span>
                ) : (
                  <span className="text-warning">{t("home.stats.awaiting")}</span>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* ── SPEC.01 — the pairwise A-vs-B specimen, framed as the dominant exhibit ── */}
      <Link
        to={primaryHref}
        className="tick-frame group relative block"
        aria-label={isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
      >
        <Figure
          prefix="FIG"
          n={1}
          label={t("home.pairwise")}
          actions={<span className="font-mono text-[11px] text-muted-foreground">{t("home.pasteCode")}</span>}
          className="transition-colors group-hover:border-foreground/25"
        >
          <div className="grid items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
            {/* Exhibit A — a resolved specimen: margin-accent card + instrument readings */}
            <div className="rounded-sm border-s-2 border-s-border bg-transparent p-5">
              <div className="mb-3 flex items-center gap-2">
                <Serial tone="primary">A</Serial>
                <span className="t-label text-foreground">{t("home.exhibitA", { defaultValue: "Source A" })}</span>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 truncate text-start font-mono font-semibold text-foreground">
                  solution_v3.py
                </div>
              </div>
              <MetaStrip
                className="mt-3"
                items={[
                  { label: "SIZE", value: "4.2 KB" },
                  { label: "LINES", value: "118" },
                  { label: "LANG", value: "Python" },
                ]}
              />
            </div>

            {/* 'vs' — a hairline instrument divider, not a filled pill */}
            <div className="flex items-stretch justify-center">
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span className="hidden w-px flex-1 bg-border sm:block" aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">vs</span>
                <span className="hidden w-px flex-1 bg-border sm:block" aria-hidden="true" />
              </div>
            </div>

            {/* Exhibit B — awaiting specimen, left-anchored to mirror A */}
            <div className="rounded-sm border border-dashed border-border p-5 transition-colors group-hover:border-primary/60">
              <div className="mb-3 flex items-center gap-2">
                <Serial>B</Serial>
                <span className="t-label">{t("home.exhibitB", { defaultValue: "Source B" })}</span>
              </div>
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 text-start">
                  <div className="font-semibold text-foreground">{t("home.dropTitle")}</div>
                  <div className="mt-0.5 t-xs">{t("home.dropHint")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Chain-of-custody notes — trust signals as mono annotations, edge-ruled */}
          <div className="-mx-4 -mb-4 mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3">
            {trustSignals.map((item) => (
              <div key={item} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                {item}
              </div>
            ))}
          </div>
        </Figure>
      </Link>

      {/* ── §01 Capability index — a numbered, hairline-ruled register with catalogue refs ── */}
      <DocSection n="01" title={t("home.featuresTitle")} note={`${features.length} MODULES`}>
        <ul className="divide-y divide-border border-t border-border">
          {features.map((feature, i) => {
            const Icon = feature.Icon;
            return (
              <li key={feature.title}>
                <IndexRow
                  serial={<Serial>{String(i + 1).padStart(2, "0")}</Serial>}
                  icon={<Icon className="h-4 w-4" />}
                  title={feature.title}
                  meta={feature.ref}
                >
                  {feature.description}
                </IndexRow>
              </li>
            );
          })}
        </ul>
      </DocSection>

      {/* ── §02 Disposition — the closing call to open a case, with input readings ── */}
      <DocSection
        n="02"
        title={t("home.ctaTitle")}
        note={t("home.badge")}
        actions={
          <Button asChild size="lg" className="h-11 shrink-0 px-6">
            <Link to={primaryHref}>{isAuthenticated ? t("home.ctaSignedIn") : t("home.ctaSignedOut")}</Link>
          </Button>
        }
      >
        <div className="max-w-xl">
          <p className="t-body">{t("home.ctaDescription")}</p>
          <MetaStrip
            className="mt-4"
            items={[
              { label: "INPUTS", value: "PASTE · FILE" },
              { label: "BUNDLES", value: "ZIP · XLSX" },
            ]}
          />
        </div>
      </DocSection>
    </div>
  );
};

export default Home;
