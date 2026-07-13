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
import { Masthead, Figure, Panel, Serial, SpecList } from "@/components/dossier/Dossier";
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

// Warm "dossier" categorical palette — sourced from the --chart-* tokens so it
// tracks light/dark and never drifts from the design system (no raw HSL, no
// cyan/violet). Cycles for the rare >5-category chart.
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 4,
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
          meta={[{ label: "STATUS", value: <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-foreground">NO DATA</span> }]}
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
    <div className="animate-fade-in">
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

      {/* Summary readings — a ruled evidence readout, not a 4-up card band */}
      <Panel
        bare
        marker="§"
        label={t("analytics.summary", { defaultValue: "Summary readings" })}
        className="mt-10"
      >
        <SpecList
          rows={readings.map((r) => ({
            label: (
              <span className="block">
                {r.label}
                <span className="mt-0.5 block font-sans text-[10px] normal-case tracking-normal text-muted-foreground/70">
                  {r.sub}
                </span>
              </span>
            ),
            value: r.value,
          }))}
        />
      </Panel>

      {/* Exhibits — figure-framed charts under a ruled § break */}
      <Panel
        bare
        marker="§"
        label={t("analytics.figures", { defaultValue: "Figures" })}
        actions={<Reading>{data.clone_dist.length > 0 ? 4 : 3} FIG</Reading>}
        className="mt-14"
      >
        <div className="space-y-5">
      {/* FIG.01 — Daily activity */}
      <Figure n={1} label={t("analytics.activity")} actions={<Reading>Σ {totalActivity}</Reading>}>
        <div role="img" aria-label={`${t("analytics.activity")}: ${activityData.map((d) => `${d.date} ${d.count}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
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
              fill="hsl(var(--primary))"
              fillOpacity={0.08}
              name={t("analytics.analyses")}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </Figure>

      {/* FIG.02 / FIG.03 — distributions */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Language distribution */}
        <Figure n={2} label={t("analytics.langDist")} actions={<Reading>{uniqueLangs}</Reading>}>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div role="img" aria-label={`${t("analytics.langDist")}: ${data.language_dist.slice(0, 7).map((d) => `${d.language} ${d.count}`).join(", ")}`} className="w-full sm:w-[45%]">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.language_dist.slice(0, 7)}
                  dataKey="count"
                  nameKey="language"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  strokeWidth={0}
                >
                  {data.language_dist.slice(0, 7).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            </div>
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
          <div role="img" aria-label={`${t("analytics.simDist")}: ${data.similarity_dist.map((d) => `${d.range}: ${d.count}`).join(", ")}`}>
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
              <Bar dataKey="count" radius={0} name={t("analytics.count")}>
                {data.similarity_dist.map((d) => (
                  <Cell
                    key={d.range}
                    fill={
                      d.range === "75-100"
                        ? "hsl(var(--destructive))"
                        : d.range === "50-75"
                        ? "hsl(var(--warning))"
                        : "hsl(var(--success))"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </Figure>
      </div>

      {/* FIG.04 — clone type frequency */}
      {data.clone_dist.length > 0 && (
        <Figure n={4} label={t("analytics.cloneDist")} actions={<Reading>{data.clone_dist.length}</Reading>}>
          <div role="img" aria-label={`${t("analytics.cloneDist")}: ${data.clone_dist.map((d) => `${d.name}: ${d.count}`).join(", ")}`}>
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
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickLine={false}
              />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={0} name={t("analytics.count")} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </Figure>
      )}
        </div>
      </Panel>

      {/* Exhibit ledger — top analyses by similarity, as a heavy-rule ledger */}
      {data.top_analyses.length > 0 && (
        <Panel
          bare
          marker="§"
          label={t("analytics.topAnalyses")}
          actions={<Reading>{data.top_analyses.length}</Reading>}
          className="mt-14"
          bodyClassName="overflow-x-auto scrollbar-thin"
        >
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b-2 border-foreground">
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
                    a.similarity >= 80 ? "hsl(var(--destructive))"
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
                        {/* Ink value + a band-coloured dot (the dot carries the scale, the number stays legible). */}
                        <span className="inline-flex items-center justify-end gap-1.5 font-mono text-sm font-bold tabular-nums text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: scoreColorValue }} />
                          {a.similarity.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </Panel>
      )}
    </div>
  );
};

export default Analytics;
