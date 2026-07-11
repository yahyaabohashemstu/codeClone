import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  FileText,
  GitCompare,
  MessageSquare,
  Shield,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { Masthead, Panel, Serial } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const featureIcons = [GitCompare, BarChart3, MessageSquare, Shield, Zap, Code2];
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

  return (
    <div className="space-y-8">
      {/* ── Masthead — the case-file intro + live register readings ── */}
      <Masthead
        kicker={engineLabels.join(" · ")}
        title={
          <>
            {t("home.titlePrefix")} <span className="text-primary">{t("home.titleHighlight")}</span>
          </>
        }
        description={t("home.description")}
        meta={[
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
        actions={
          <>
            <Button asChild size="lg" className="h-11 gap-2 px-6">
              <Link to={primaryHref}>
                {isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-5">
              <Link to={secondaryHref}>{t("home.secondary")}</Link>
            </Button>
          </>
        }
      />

      {/* ── The specimen — the pairwise A-vs-B this tool performs, framed as the dominant exhibit ── */}
      <Link
        to={primaryHref}
        className="group block"
        aria-label={isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
      >
        <figure className="overflow-hidden rounded-lg border border-border bg-card transition-colors group-hover:border-foreground/25">
          <figcaption className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <span className="t-label flex items-center gap-2 text-foreground">
              <span className="text-primary">SPEC.01</span>
              {t("home.pairwise")}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{t("home.pasteCode")}</span>
          </figcaption>

          <div className="grid items-stretch gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:p-6">
            {/* Exhibit A — a resolved specimen */}
            <div className="rounded-md border border-success/40 bg-success/[0.06] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Serial tone="primary">A</Serial>
                <span className="t-label text-foreground">{t("home.exhibitA", { defaultValue: "Exhibit A" })}</span>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 text-start">
                  <div className="truncate font-mono font-semibold text-foreground">solution_v3.py</div>
                  <div className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                    4.2 KB · 118 lines · Python
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center px-1">
              <span className="rounded-sm bg-primary px-2 py-1 font-display text-xs font-bold text-primary-foreground">
                vs
              </span>
            </div>

            {/* Exhibit B — awaiting specimen */}
            <div className="rounded-md border border-dashed border-border p-5 transition-colors group-hover:border-primary/60">
              <div className="mb-3 flex items-center gap-2">
                <Serial>B</Serial>
                <span className="t-label">{t("home.exhibitB", { defaultValue: "Exhibit B" })}</span>
              </div>
              <div className="text-center">
                <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <div className="font-semibold text-foreground">{t("home.dropTitle")}</div>
                <div className="mt-1 t-xs">{t("home.dropHint")}</div>
              </div>
            </div>
          </div>

          {/* Chain-of-custody notes — the trust signals as mono annotations */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3">
            {trustSignals.map((item) => (
              <div key={item} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {item}
              </div>
            ))}
          </div>
        </figure>
      </Link>

      {/* ── Capability ledger — a numbered, hairline-ruled index, not a card grid ── */}
      <Panel label={t("home.featuresTitle")} bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {features.map((feature, i) => {
            const Icon = feature.Icon;
            return (
              <li key={feature.title} className="flex items-start gap-4 px-5 py-4">
                <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="font-mono text-sm font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Case footer — left-anchored disposition line + action, not a centered hero ── */}
      <footer className="flex flex-col gap-4 border-t border-border pt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <h2 className="t-h3">{t("home.ctaTitle")}</h2>
          <p className="mt-2 t-body">{t("home.ctaDescription")}</p>
        </div>
        <Button asChild size="lg" className="h-11 shrink-0 gap-2 px-6">
          <Link to={primaryHref}>
            {isAuthenticated ? t("home.ctaSignedIn") : t("home.ctaSignedOut")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </footer>
    </div>
  );
};

export default Home;
