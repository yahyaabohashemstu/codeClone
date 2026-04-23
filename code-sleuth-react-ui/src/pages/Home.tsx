import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  GitCompare,
  MessageSquare,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const featureIcons = [GitCompare, BarChart3, MessageSquare, Shield, Zap, Code2];
const featureColors = [
  { color: "text-primary", bg: "bg-primary/10" },
  { color: "text-accent", bg: "bg-accent/10" },
  { color: "text-success", bg: "bg-success/10" },
  { color: "text-warning", bg: "bg-warning/10" },
  { color: "text-primary", bg: "bg-primary/10" },
  { color: "text-accent", bg: "bg-accent/10" },
];

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
  ).map((feat, i) => ({
    ...feat,
    icon: featureIcons[i],
    ...featureColors[i],
  }));

  const stats = [
    { label: t("home.stats.analysesRun"), value: home ? formatNumber(home.totalAnalyses) : "\u2014", icon: BarChart3 },
    { label: t("home.stats.languagesSupported"), value: home ? formatNumber(home.languagesSupported) : "\u2014", icon: Code2 },
    { label: t("home.stats.currentUserAnalyses"), value: home ? formatNumber(home.userAnalyses) : "\u2014", icon: Clock },
    {
      label: t("home.stats.historyReady"),
      value: home?.latestAnalysisId ? t("home.stats.yes") : t("home.stats.awaiting"),
      icon: TrendingUp,
    },
  ];

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  return (
    <div className="space-y-16 animate-fade-in">
      <section className="relative pt-8 pb-4">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary)), transparent)" }}
        />

        <div className="relative mx-auto max-w-4xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-5 py-2 text-sm font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {t("home.badge")}
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.08]">
            {t("home.titlePrefix")} <span className="text-gradient-brand">{t("home.titleHighlight")}</span>
          </h1>

          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t("home.description")}
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild size="lg" className="h-12 gap-2 px-7 text-base shadow-glow-sm">
              <Link to={primaryHref}>
                {isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 gap-2 border-border/60 px-7 text-base hover:border-primary/40">
              <Link to={secondaryHref}>{t("home.secondary")}</Link>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 pt-4 text-sm text-muted-foreground">
            {trustSignals.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card text-center">
              <Icon className="mx-auto mb-2 h-5 w-5 text-primary/60" />
              <div className="text-3xl font-bold tracking-tight text-foreground">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          );
        })}
      </section>

      <section className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("home.featuresTitle")}</h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t("home.featuresDescription")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="card-premium group p-5 hover:-translate-y-0.5">
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${feature.bg}`}>
                  <Icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold sm:text-3xl">{t("home.ctaTitle")}</h2>
        <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
          {t("home.ctaDescription")}
        </p>
        <Button asChild size="lg" className="h-12 gap-2 px-7 text-base shadow-glow-sm">
          <Link to={primaryHref}>
            {isAuthenticated ? t("home.ctaSignedIn") : t("home.ctaSignedOut")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
};

export default Home;
