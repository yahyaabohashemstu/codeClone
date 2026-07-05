import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, TrendingUp, GitCompare, Activity, Plus } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { apiFetch } from "@/lib/api";
import type { HistorySummary } from "@/types/api";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  total: number;
  activity: { date: string; count: number }[];
  language_dist: { language: string; count: number }[];
  similarity_dist: { range: string; count: number }[];
  clone_dist: { name: string; count: number }[];
  top_analyses: HistorySummary[];
}

const PALETTE = [
  "hsl(235 84% 59%)",
  "hsl(190 78% 42%)",
  "hsl(150 62% 39%)",
  "hsl(35 88% 48%)",
  "hsl(0 72% 52%)",
  "hsl(270 70% 55%)",
  "hsl(195 80% 50%)",
];

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5"
      style={{ boxShadow: "var(--card-shadow-rest)" }}
    >
      <div className="flex items-center justify-between">
        <span className="t-label">{label}</span>
        <Icon className={cn("h-4 w-4", color ?? "text-muted-foreground/70")} />
      </div>
      <div
        className="mt-3 text-3xl font-bold tracking-tight text-foreground"
        style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 t-xs">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={{ boxShadow: "var(--card-shadow-rest)" }}
    >
      <div
        className="border-b border-border px-5 py-3"
        style={{ background: "hsl(var(--surface-2))" }}
      >
        <h3 className="t-label text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const Analytics = () => {
  const { t } = useTranslation("common");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");

  const loadData = () => {
    setError("");
    apiFetch<AnalyticsData>("/api/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("analytics.loadError")));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <PageError message={error} onRetry={loadData} />;
  }

  if (!data) {
    return <PageLoader />;
  }

  if (data.total === 0) {
    return (
      <div
        className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-12 text-center"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
        >
          <BarChart3 className="h-7 w-7" />
        </div>
        <h2 className="t-h3">{t("analytics.title")}</h2>
        <p className="mt-3 t-body">{t("analytics.noData")}</p>
        <Button
          asChild
          size="lg"
          className="mt-6 h-11 gap-2 px-5 text-white"
          style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
        >
          <Link to="/analysis">
            <Plus className="h-4 w-4" />
            {t("analytics.startAnalysis")}
          </Link>
        </Button>
      </div>
    );
  }

  const topScore = data.top_analyses[0]?.similarity ?? 0;
  const uniqueLangs = data.language_dist.length;
  const totalActivity = data.activity.reduce((sum, d) => sum + d.count, 0);

  // Shorten dates to MM/DD for activity chart
  const activityData = data.activity.map((d) => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero header card */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-56 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.28), transparent 70%)" }}
        />
        <div className="relative p-6">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <BarChart3 className="h-3 w-3" />
            {t("analytics.eyebrow", { defaultValue: "Insights overview" })}
          </div>
          <h1 className="mt-3 t-h2">{t("analytics.title")}</h1>
          <p className="mt-1 max-w-[60ch] t-body">{t("analytics.description")}</p>
        </div>
      </section>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={Activity}
          label={t("analytics.totalAnalyses")}
          value={data.total}
          sub={t("analytics.totalDesc")}
          color="text-primary"
        />
        <StatCard
          icon={GitCompare}
          label={t("analytics.languages")}
          value={uniqueLangs}
          sub={t("analytics.languagesDesc")}
          color="text-accent"
        />
        <StatCard
          icon={TrendingUp}
          label={t("analytics.topScore")}
          value={`${topScore.toFixed(1)}%`}
          sub={t("analytics.topScoreDesc")}
          color="text-warning"
        />
        <StatCard
          icon={Clock7Icon}
          label={t("analytics.last7Days", { defaultValue: "Last 7 days" })}
          value={totalActivity}
          sub={t("analytics.analyses")}
          color="text-success"
        />
      </div>

      {/* Activity chart */}
      <ChartCard title={t("analytics.activity")}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(235 84% 59%)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(235 84% 59%)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "var(--card-shadow-rest)",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(235 84% 59%)"
              strokeWidth={2}
              fill="url(#actGrad)"
              name={t("analytics.analyses")}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Two-column row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Language distribution */}
        <ChartCard title={t("analytics.langDist")}>
          <div className="flex items-center justify-center gap-4">
            <ResponsiveContainer width="45%" height={200}>
              <PieChart>
                <Pie
                  data={data.language_dist}
                  dataKey="count"
                  nameKey="language"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  strokeWidth={0}
                >
                  {data.language_dist.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: "var(--card-shadow-rest)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.language_dist.slice(0, 7).map((d, i) => (
                <div key={d.language} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="font-medium capitalize text-foreground">{d.language}</span>
                  </span>
                  <span
                    className="tabular-nums text-muted-foreground"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        {/* Similarity distribution */}
        <ChartCard title={t("analytics.simDist")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.similarity_dist} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "var(--card-shadow-rest)",
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name={t("analytics.count")}>
                {data.similarity_dist.map((d) => (
                  <Cell
                    key={d.range}
                    fill={
                      d.range === "75-100"
                        ? "hsl(var(--destructive))"
                        : d.range === "50-75"
                        ? "hsl(var(--warning))"
                        : d.range === "25-50"
                        ? "hsl(235 84% 59%)"
                        : "hsl(var(--success))"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Clone type frequency */}
      {data.clone_dist.length > 0 && (
        <ChartCard title={t("analytics.cloneDist")}>
          <ResponsiveContainer width="100%" height={Math.max(200, data.clone_dist.length * 28)}>
            <BarChart data={data.clone_dist} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "var(--card-shadow-rest)",
                }}
              />
              <Bar dataKey="count" fill="hsl(235 84% 59%)" radius={[0, 6, 6, 0]} name={t("analytics.count")} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Top analyses table */}
      {data.top_analyses.length > 0 && (
        <div
          className="overflow-hidden rounded-2xl border border-border bg-card"
          style={{ boxShadow: "var(--card-shadow-rest)" }}
        >
          <div
            className="border-b border-border px-5 py-3"
            style={{ background: "hsl(var(--surface-2))" }}
          >
            <h3 className="t-label text-foreground">{t("analytics.topAnalyses")}</h3>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr style={{ background: "hsl(var(--surface-2))" }}>
                  <th className="border-b border-border px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.source")} A
                  </th>
                  <th className="border-b border-border px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.source")} B
                  </th>
                  <th className="border-b border-border px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.language")}
                  </th>
                  <th className="border-b border-border px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.similarity")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.top_analyses.map((a) => {
                  const scoreColorValue =
                    a.similarity >= 75 ? "hsl(var(--destructive))"
                      : a.similarity >= 50 ? "hsl(var(--warning))"
                      : "hsl(var(--success))";
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border/40 transition-colors last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-foreground">{a.sourceA}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-foreground">{a.sourceB}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize"
                          style={{
                            fontFamily: "var(--font-mono)",
                            background: "hsl(var(--primary) / 0.1)",
                            color: "hsl(var(--primary))",
                            borderColor: "hsl(var(--primary) / 0.25)",
                          }}
                        >
                          {a.language}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{ fontFamily: "var(--font-mono)", color: scoreColorValue }}
                        >
                          {a.similarity.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Small inline clock icon (Activity used above; rename for semantic clarity)
function Clock7Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx={12} cy={12} r={10} />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default Analytics;
