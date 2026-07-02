import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  FileText,
  GitCompare,
  MessageSquare,
  Shield,
  Sparkles,
  TrendingUp,
  Upload,
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
const featureAccent = [
  "text-primary bg-primary/10",
  "text-accent bg-accent/10",
  "text-success bg-success/10",
  "text-warning bg-warning/10",
  "text-primary bg-primary/10",
  "text-accent bg-accent/10",
];

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
  ).map((feat, i) => ({
    ...feat,
    Icon: featureIcons[i],
    accent: featureAccent[i],
  }));

  const stats = [
    { label: t("home.stats.analysesRun"), value: home ? formatNumber(home.totalAnalyses) : "\u2014", Icon: BarChart3 },
    { label: t("home.stats.languagesSupported"), value: home ? formatNumber(home.languagesSupported) : "\u2014", Icon: Code2 },
    { label: t("home.stats.currentUserAnalyses"), value: home ? formatNumber(home.userAnalyses) : "\u2014", Icon: Clock },
    {
      label: t("home.stats.historyReady"),
      value: home?.latestAnalysisId ? t("home.stats.yes") : t("home.stats.awaiting"),
      Icon: TrendingUp,
    },
  ];

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  return (
    <div className="space-y-12 animate-fade-in">
      {/* ── Hero + Upload-pair preview card ── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border/70 bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.28), transparent 70%)" }}
        />

        <div className="relative px-6 pt-12 pb-6 text-center sm:px-10 md:pt-16">
          {/* Eyebrow pill */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-primary"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {engineLabels.join(" · ")}
          </div>

          <h1 className="mt-6 t-hero leading-[1.04] tracking-tight" style={{ fontSize: "clamp(2.25rem, 6vw, 4.5rem)" }}>
            {t("home.titlePrefix")}{" "}
            <span className="text-gradient-brand">{t("home.titleHighlight")}</span>
          </h1>

          <p className="mx-auto mt-4 max-w-[62ch] t-body" style={{ fontSize: "1.05rem" }}>
            {t("home.description")}
          </p>
        </div>

        {/* Upload-pair visual preview (links to /analysis) */}
        <div className="relative px-6 pb-6 sm:px-10">
          <Link
            to={primaryHref}
            className="group block rounded-xl"
            aria-label={isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
          >
            <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
              {/* Left: filled-like preview */}
              <div
                className="rounded-2xl border bg-background/40 p-5 transition-all duration-200 group-hover:border-primary/40"
                style={{ borderColor: "hsl(var(--success) / 0.3)", background: "hsl(var(--success) / 0.05)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "hsl(var(--success) / 0.15)", color: "hsl(var(--success))" }}
                  >
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 text-start">
                    <div className="truncate font-semibold text-foreground">solution_v3.py</div>
                    <div className="truncate t-xs">4.2 KB · 118 lines · Python</div>
                  </div>
                </div>
              </div>

              {/* vs cross */}
              <div
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-glow-sm)" }}
              >
                vs
              </div>

              {/* Right: empty-drop preview */}
              <div className="rounded-2xl border-2 border-dashed border-border/60 bg-card p-5 text-center transition-all duration-200 group-hover:border-primary/50 group-hover:bg-primary/5">
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ background: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))" }}
                >
                  <Upload className="h-6 w-6" />
                </div>
                <div className="font-semibold text-foreground">{t("home.dropTitle")}</div>
                <div className="mt-1 t-xs">{t("home.dropHint")}</div>
              </div>
            </div>
          </Link>

          {/* Actions row */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-primary"
                style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.25)" }}
              >
                {t("home.pairwise")}
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link to={primaryHref}>{t("home.pasteCode")}</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="lg" className="h-11 gap-2 px-5">
                <Link to={secondaryHref}>{t("home.secondary")}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="h-11 gap-2 px-6 text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
                <Link to={primaryHref}>
                  <Sparkles className="h-4 w-4" />
                  {isAuthenticated ? t("home.primarySignedIn") : t("home.primarySignedOut")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trustSignals.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats row ── */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.Icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5"
              style={{ boxShadow: "var(--card-shadow-rest)" }}
            >
              <div className="flex items-center justify-between">
                <span className="t-label">{stat.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground/70" />
              </div>
              <div
                className="mt-3 text-3xl font-bold tracking-tight text-foreground"
                style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)" }}
              >
                {stat.value}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Features grid ── */}
      <section className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="t-h2">{t("home.featuresTitle")}</h2>
          <p className="mx-auto max-w-2xl t-body">{t("home.featuresDescription")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.Icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: "var(--card-shadow-rest)" }}
              >
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${feature.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-primary/20 p-8 text-center"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.12), transparent 40%), radial-gradient(circle at 80% 80%, hsl(var(--accent) / 0.10), transparent 45%), hsl(var(--card))",
        }}
      >
        <h2 className="h-3">{t("home.ctaTitle")}</h2>
        <p className="mx-auto mt-3 max-w-xl t-body">{t("home.ctaDescription")}</p>
        <div className="mt-5 flex justify-center">
          <Button
            asChild
            size="lg"
            className="h-11 gap-2 px-6 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
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
