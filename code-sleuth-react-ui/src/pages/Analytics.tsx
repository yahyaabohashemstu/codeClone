import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Figure, Panel, PlatePair } from "@/components/dossier/Dossier";
import { PageHeader, Reading, Scale, Tag } from "@/components/bench/Bench";
import { toneForScore } from "@/lib/bands";
import { IconArrowRight, IconFilePlus } from "@/components/bench/icons";
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

/* Categorical palette: signal first, then the bench greys (the --chart-* tokens). */
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const SIGNAL = "var(--signal-base)";
const GRID = "var(--bench-hair)";
const AXIS_TICK = { fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" };

const CHART_TOOLTIP_STYLE = {
  background: "var(--bench-raised)",
  border: "1px solid var(--bench-hair)",
  borderRadius: 2,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--text-primary)",
};
const CHART_TOOLTIP_LABEL_STYLE = { color: "var(--text-primary)" };
const CHART_TOOLTIP_ITEM_STYLE = { color: "var(--text-secondary)" };

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

/** Similarity bands take the tag tones: flagged reads in signal, the rest in bench greys. */
function bandFill(range: string) {
  if (range === "75-100") return SIGNAL;
  if (range === "50-75") return "hsl(var(--chart-3))";
  return "hsl(var(--chart-4))";
}

/** A compact mono reading for a Figure's caption slot. */
function Caption({ children }: { children: React.ReactNode }) {
  return <span className="mono-meta text-txt-muted">{children}</span>;
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

  const kicker = t("analytics.kicker", { defaultValue: "Readings" });

  if (data.total === 0) {
    return (
      <div className="pt-7">
        <PageHeader kicker={kicker} title={t("analytics.title")} />
        <p className="body-lg mt-3 max-w-[64ch] text-txt-secondary">{t("analytics.description")}</p>
        <div className="mt-10 flex flex-col items-center gap-4 border-y border-bench-hair px-6 py-20 text-center">
          <IconFilePlus className="text-txt-muted" />
          <p className="text-[15px] text-txt-primary">{t("analytics.noData")}</p>
          <Button asChild className="mt-2">
            <Link to="/analysis">
              {t("analytics.startAnalysis")}
              <IconArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const topScore = data.top_analyses[0]?.similarity ?? 0;
  const uniqueLangs = data.language_dist.length;
  const totalActivity = data.activity.reduce((sum, d) => sum + d.count, 0);
  const figureCount = data.clone_dist.length > 0 ? 4 : 3;

  // Shorten dates to MM-DD for the activity chart
  const activityData = data.activity.map((d) => ({
    ...d,
    date: d.date.slice(5),
  }));

  const langs = data.language_dist.slice(0, 7);
  const langTotal = langs.reduce((sum, d) => sum + d.count, 0) || 1;

  return (
    <div className="pt-7">
      <PageHeader
        kicker={kicker}
        title={t("analytics.title")}
        actions={
          <Button asChild>
            <Link to="/analysis">
              {t("analytics.startAnalysis")}
              <IconArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        }
      />
      <p className="body-lg mt-3 max-w-[64ch] text-txt-secondary">{t("analytics.description")}</p>

      {/* Readings */}
      <div className={cn(READINGS_ROW, "mt-8")}>
        <Reading label={t("analytics.totalAnalyses")} value={String(data.total)} note={t("analytics.totalDesc")} />
        <Reading label={t("analytics.languages")} value={String(uniqueLangs)} note={t("analytics.languagesDesc")} />
        <Reading label={t("analytics.topScore")} value={topScore.toFixed(1)} note={t("analytics.topScoreDesc")} />
        <Reading label={t("analytics.last7Days", { defaultValue: "Last 7 days" })} value={String(totalActivity)} note={t("analytics.analyses")} />
      </div>

      <div className="mt-8 space-y-5">
        {/* Figures — each already sits in its own hairline frame */}
        <section>
          <div className="flex items-center justify-between gap-4 pb-4">
            <h2 className="label text-txt-muted">{t("analytics.figures", { defaultValue: "Figures" })}</h2>
            <Caption>{String(figureCount).padStart(2, "0")}</Caption>
          </div>
          <div className="space-y-5">
            {/* FIG.01 — Daily activity */}
            <Figure n={1} label={t("analytics.activity")} actions={<Caption>Σ {totalActivity}</Caption>}>
              <div role="img" aria-label={`${t("analytics.activity")}: ${activityData.map((d) => `${d.date} ${d.count}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={4} />
                    <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={{ stroke: "var(--bench-hair-strong)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={SIGNAL}
                      strokeWidth={2}
                      fill={SIGNAL}
                      fillOpacity={0.12}
                      name={t("analytics.analyses")}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Figure>

            {/* FIG.02 / FIG.03 — distributions */}
            <div className="grid gap-5 xl:grid-cols-2">
              {/* Language distribution — one proportional bar + a ruled ledger */}
              <Figure n={2} label={t("analytics.langDist")} actions={<Caption>{uniqueLangs}</Caption>}>
                <div role="img" aria-label={`${t("analytics.langDist")}: ${langs.map((d) => `${d.language} ${d.count}`).join(", ")}`}>
                  <div className="flex h-3 w-full overflow-hidden border border-bench-hair" aria-hidden>
                    {langs.map((d, i) => (
                      <span
                        key={d.language}
                        className="h-full border-e border-bench-base last:border-e-0"
                        style={{ width: `${(d.count / langTotal) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    ))}
                  </div>
                  <dl className="mt-3 divide-y divide-bench-hair" aria-hidden>
                    {langs.map((d, i) => (
                      <div key={d.language} className="flex h-9 items-center justify-between gap-2">
                        <dt className="flex items-center gap-2.5">
                          <span className="h-2.5 w-2.5 shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="text-[12.5px] capitalize text-txt-primary" dir="ltr">{d.language}</span>
                        </dt>
                        <dd className="mono-meta text-txt-muted" dir="ltr">
                          {d.count} · {Math.round((d.count / langTotal) * 100)}%
                        </dd>
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
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="range" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                        cursor={{ fill: "var(--bench-raised)" }}
                      />
                      <Bar dataKey="count" radius={0} name={t("analytics.count")}>
                        {data.similarity_dist.map((d) => (
                          <Cell key={d.range} fill={bandFill(d.range)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Figure>
            </div>

            {/* FIG.04 — clone type frequency */}
            {data.clone_dist.length > 0 && (
              <Figure n={4} label={t("analytics.cloneDist")} actions={<Caption>{data.clone_dist.length}</Caption>}>
                <div role="img" aria-label={`${t("analytics.cloneDist")}: ${data.clone_dist.map((d) => `${d.name}: ${d.count}`).join(", ")}`}>
                  <ResponsiveContainer width="100%" height={Math.max(200, data.clone_dist.length * 28)}>
                    <BarChart data={data.clone_dist} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis type="category" dataKey="name" width={160} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                        cursor={{ fill: "var(--bench-raised)" }}
                      />
                      <Bar dataKey="count" fill={SIGNAL} radius={0} name={t("analytics.count")} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Figure>
            )}
          </div>
        </section>

        {/* Top analyses — a hairline ledger */}
        {data.top_analyses.length > 0 && (
          <Panel label={t("analytics.topAnalyses")} actions={<Caption>{data.top_analyses.length}</Caption>} bodyClassName="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="h-9 border-b border-bench-hair">
                    <th className="label w-12 ps-5 text-start font-semibold text-txt-muted">#</th>
                    <th className="label ps-3 text-start font-semibold text-txt-muted">{t("analytics.source")}</th>
                    <th className="label w-32 ps-3 text-start font-semibold text-txt-muted">{t("analytics.language")}</th>
                    <th className="label w-[220px] ps-3 text-start font-semibold text-txt-muted">{t("analytics.similarity")}</th>
                    <th className="label w-[140px] ps-3 pe-5 text-start font-semibold text-txt-muted">{t("history.columns.verdict")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_analyses.map((a, i) => (
                    <tr key={a.id} className="border-b border-bench-hair last:border-b-0 hover:bg-bench-raised/60">
                      <td className="ps-5 py-3 align-middle">
                        <span className="mono-ordinal text-txt-muted">{String(i + 1).padStart(2, "0")}</span>
                      </td>
                      <td className="max-w-[320px] ps-3 py-3 align-middle">
                        <PlatePair mono a={a.sourceA} b={a.sourceB} />
                      </td>
                      <td className="ps-3 py-3 align-middle">
                        <span className="text-[12.5px] text-txt-secondary" dir="ltr">{a.language}</span>
                      </td>
                      <td className="ps-3 py-3 align-middle">
                        <span className="flex items-center gap-3">
                          <Scale value={a.similarity} quiet={a.similarity < 50} className="w-[110px]" />
                          <span className="mono-value text-txt-primary" dir="ltr">{a.similarity.toFixed(1)}</span>
                        </span>
                      </td>
                      <td className="ps-3 pe-5 py-3 align-middle">
                        <Tag tone={toneForScore(a.similarity)}>{t(`history.verdicts.${a.severity}`)}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default Analytics;
