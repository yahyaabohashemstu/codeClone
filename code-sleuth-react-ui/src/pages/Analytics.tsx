import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
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
import { Masthead, Figure, Panel, Serial } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import type { HistorySummary } from "@/types/api";

interface AnalyticsData {
  total: number;
  activity: { date: string; count: number }[];
  language_dist: { language: string; count: number }[];
  similarity_dist: { range: string; count: number }[];
  clone_dist: { name: string; count: number }[];
  top_analyses: HistorySummary[];
}

// Warm "dossier" categorical palette — amber, oxblood, olive, ochre… no cyan/violet.
const PALETTE = [
  "hsl(var(--primary))",
  "hsl(8 60% 46%)",
  "hsl(130 30% 36%)",
  "hsl(28 48% 44%)",
  "hsl(40 10% 46%)",
  "hsl(18 55% 52%)",
  "hsl(46 68% 42%)",
];

const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 12,
};

/** A compact mono reading for a Figure's caption/actions slot. */
function Reading({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{children}</span>
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
      <div className="space-y-6 animate-fade-in">
        <Masthead
          kicker={t("analytics.eyebrow", { defaultValue: "Figures report" })}
          title={t("analytics.title")}
          description={t("analytics.description")}
          meta={[{ label: "STATUS", value: <span className="text-warning">NO DATA</span> }]}
        />
        <Panel label={t("analytics.title")}>
          <p className="max-w-[52ch] t-body">{t("analytics.noData")}</p>
          <Button asChild size="lg" className="mt-5 gap-2">
            <Link to="/analysis">
              <Plus className="h-4 w-4" />
              {t("analytics.startAnalysis")}
            </Link>
          </Button>
        </Panel>
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

  // Headline readings, laid as a ruled spec band — not a 4-up card grid.
  const readings = [
    { label: t("analytics.totalAnalyses"), value: String(data.total), sub: t("analytics.totalDesc") },
    { label: t("analytics.languages"), value: String(uniqueLangs), sub: t("analytics.languagesDesc") },
    {
      label: t("analytics.topScore"),
      value: `${topScore.toFixed(1)}%`,
      sub: t("analytics.topScoreDesc"),
    },
    {
      label: t("analytics.last7Days", { defaultValue: "Last 7 days" }),
      value: String(totalActivity),
      sub: t("analytics.analyses"),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Case-file masthead + document meta strip */}
      <Masthead
        kicker={t("analytics.eyebrow", { defaultValue: "Figures report" })}
        title={t("analytics.title")}
        description={t("analytics.description")}
        meta={[
          { label: "PERIOD", value: "30D" },
          { label: "RECORDS", value: data.total },
          { label: "LANGS", value: uniqueLangs },
          { label: "FIGURES", value: data.clone_dist.length > 0 ? 4 : 3 },
        ]}
        actions={
          <Button asChild size="sm" className="h-9 gap-2">
            <Link to="/analysis">
              <Plus className="h-4 w-4" />
              {t("analytics.startAnalysis")}
            </Link>
          </Button>
        }
      />

      {/* Spec band — one ruled readout, hairline-divided columns */}
      <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x">
        {readings.map((r, i) => (
          <div
            key={r.label}
            className={i < 2 ? "border-b border-border p-5 sm:border-b-0" : "p-5"}
          >
            <div className="t-label">{r.label}</div>
            <div className="mt-2.5 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {r.value}
            </div>
            <div className="mt-1 t-xs">{r.sub}</div>
          </div>
        ))}
      </div>

      {/* FIG.01 — Daily activity */}
      <Figure n={1} label={t("analytics.activity")} actions={<Reading>Σ {totalActivity}</Reading>}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
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
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--foreground))" }} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#actGrad)"
              name={t("analytics.analyses")}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Figure>

      {/* FIG.02 / FIG.03 — distributions */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Language distribution */}
        <Figure n={2} label={t("analytics.langDist")} actions={<Reading>{uniqueLangs}</Reading>}>
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
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <dl className="flex-1 space-y-2">
              {data.language_dist.slice(0, 7).map((d, i) => (
                <div key={d.language} className="flex items-center justify-between gap-2 text-xs">
                  <dt className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="font-medium capitalize text-foreground">{d.language}</span>
                  </dt>
                  <dd className="font-mono tabular-nums text-muted-foreground">{d.count}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Figure>

        {/* Similarity distribution */}
        <Figure n={3} label={t("analytics.simDist")}>
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
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
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
                        ? "hsl(var(--primary))"
                        : "hsl(var(--success))"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Figure>
      </div>

      {/* FIG.04 — clone type frequency */}
      {data.clone_dist.length > 0 && (
        <Figure n={4} label={t("analytics.cloneDist")} actions={<Reading>{data.clone_dist.length}</Reading>}>
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
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} name={t("analytics.count")} />
            </BarChart>
          </ResponsiveContainer>
        </Figure>
      )}

      {/* Exhibit ledger — top analyses by similarity */}
      {data.top_analyses.length > 0 && (
        <Panel label={t("analytics.topAnalyses")} bodyClassName="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-12 px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.source")} A
                  </th>
                  <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.source")} B
                  </th>
                  <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.language")}
                  </th>
                  <th className="px-4 py-2.5 text-end text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("analytics.similarity")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.top_analyses.map((a, i) => {
                  const scoreColorValue =
                    a.similarity >= 75 ? "hsl(var(--destructive))"
                      : a.similarity >= 50 ? "hsl(var(--warning))"
                      : "hsl(var(--success))";
                  return (
                    <tr key={a.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Serial tone={i === 0 ? "primary" : "muted"}>{i + 1}</Serial>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-foreground">{a.sourceA}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-foreground">{a.sourceB}</td>
                      <td className="px-4 py-3">
                        <span className="badge-info capitalize">{a.language}</span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span
                          className="font-mono text-sm font-bold tabular-nums"
                          style={{ color: scoreColorValue }}
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
        </Panel>
      )}
    </div>
  );
};

export default Analytics;
