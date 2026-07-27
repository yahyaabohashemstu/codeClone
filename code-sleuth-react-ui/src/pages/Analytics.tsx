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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/common/PageLoader";
import { PageError } from "@/components/common/PageError";
import { Masthead, Figure, Panel, PlatePair } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
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

      {/* The gauge bank — one instrument band, four readings behind shared rules */}
      <Panel
        bare
        marker="§"
        label={t("analytics.summary", { defaultValue: "Summary readings" })}
        className="mt-10"
      >
        <div className="grid grid-cols-2 border border-border bg-card lg:grid-cols-4">
          {readings.map((r, i) => (
            <div
              key={r.label}
              className={cn(
                "border-border p-4 sm:p-5",
                i % 2 === 0 ? "border-e" : "",
                i < 2 ? "border-b lg:border-b-0" : "",
                "lg:border-b-0 lg:border-e lg:last:border-e-0",
              )}
            >
              <span className="press-slug block">{r.label}</span>
              <span
                className="mt-2 block font-display text-[2.1rem] font-extrabold leading-none tabular-nums text-foreground"
                style={{ fontStretch: "118%" }}
              >
                {r.value}
              </span>
              <span className="mt-1.5 block text-[10px] leading-snug text-muted-foreground">{r.sub}</span>
            </div>
          ))}
        </div>
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
        {/* Language distribution — ink coverage: one proportional bar + a ruled ledger */}
        <Figure n={2} label={t("analytics.langDist")} actions={<Reading>{uniqueLangs}</Reading>}>
          {(() => {
            const langs = data.language_dist.slice(0, 7);
            const langTotal = langs.reduce((sum, d) => sum + d.count, 0) || 1;
            return (
              <div
                role="img"
                aria-label={`${t("analytics.langDist")}: ${langs.map((d) => `${d.language} ${d.count}`).join(", ")}`}
              >
                {/* The coverage bar — each language's share of the printed record */}
                <div className="flex h-6 w-full overflow-hidden border border-border" aria-hidden>
                  {langs.map((d, i) => (
                    <span
                      key={d.language}
                      className="h-full border-e border-card last:border-e-0"
                      style={{ width: `${(d.count / langTotal) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                    />
                  ))}
                </div>
                <dl className="mt-3 divide-y divide-border/60" aria-hidden>
                  {langs.map((d, i) => (
                    <div key={d.language} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <dt className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="font-medium capitalize text-foreground">{d.language}</span>
                      </dt>
                      <dd className="press-slug tabular-nums">
                        {d.count} · {Math.round((d.count / langTotal) * 100)}%
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}
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
                  <th className="press-slug w-12 px-4 py-2.5 text-start">#</th>
                  <th className="press-slug px-4 py-2.5 text-start">
                    {t("analytics.source")} A ⊕ B
                  </th>
                  <th className="press-slug px-4 py-2.5 text-start">{t("analytics.language")}</th>
                  <th className="press-slug px-4 py-2.5 text-end">{t("analytics.similarity")}</th>
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
                      <td className="px-4 py-3 align-top">
                        <span
                          className="font-display text-lg font-extrabold tabular-nums leading-none text-muted-foreground"
                          style={{ fontStretch: "118%" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="max-w-[320px] px-4 py-3">
                        <PlatePair mono a={a.sourceA} b={a.sourceB} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="badge-info capitalize">{a.language}</span>
                      </td>
                      <td className="px-4 py-3 text-end align-middle">
                        {/* Ink value + a band-coloured square (the square carries the scale, the number stays legible). */}
                        <span
                          className="inline-flex items-center justify-end gap-1.5 font-display text-sm font-bold tabular-nums text-foreground"
                          style={{ fontStretch: "108%" }}
                        >
                          <span className="h-2 w-2" style={{ background: scoreColorValue }} />
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
