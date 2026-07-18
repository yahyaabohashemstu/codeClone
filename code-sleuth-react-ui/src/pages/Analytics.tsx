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
import {
  Masthead,
  Figure,
  Panel,
  Serial,
  MetaStrip,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  ScoreMeter,
  StatusTag,
  Tag,
  DocFrame,
  RailReadings,
  DocSection,
  scoreBand,
} from "@/components/dossier/Dossier";
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

// Languages are a categorical dimension, not a semantic scale — so they render
// in ONE neutral ink stepped only by opacity. The reserved similarity-band hues
// (success/olive · warning/amber · destructive/oxblood) stay exclusive to the
// similarity-distribution chart and never leak into categorical data. Slices are
// told apart by the legend label + tabular count, not by hue.
const LANG_RAMP = [
  "hsl(var(--muted-foreground))",
  "hsl(var(--muted-foreground) / 0.82)",
  "hsl(var(--muted-foreground) / 0.66)",
  "hsl(var(--muted-foreground) / 0.52)",
  "hsl(var(--muted-foreground) / 0.42)",
  "hsl(var(--muted-foreground) / 0.34)",
  "hsl(var(--muted-foreground) / 0.28)",
];

const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius-md)",
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
          meta={[{ label: "STATUS", value: <StatusTag tone="warning">NO DATA</StatusTag> }]}
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Case-file masthead — the numeric figures fold down into the margin rail
          instead of a 4-up stat-tile band. */}
      <Masthead
        kicker={t("analytics.eyebrow", { defaultValue: "Figures report" })}
        title={t("analytics.title")}
        description={t("analytics.description")}
        actions={
          <Button asChild size="sm" className="h-9 gap-2">
            <Link to="/analysis">
              <Plus className="h-4 w-4" />
              {t("analytics.startAnalysis")}
            </Link>
          </Button>
        }
      />

      {/* Instrument-document body — the headline figures read down the margin
          rail; the wide main column carries ruled §-sections of exhibits. */}
      <DocFrame
        rail={
          <RailReadings
            label={t("analytics.railFigures", { defaultValue: "Figures" })}
            items={[
              { label: t("analytics.totalAnalyses"), value: String(data.total) },
              { label: t("analytics.topScore"), value: `${topScore.toFixed(1)}%`, tone: scoreBand(topScore) },
              { label: t("analytics.languages"), value: String(uniqueLangs) },
              { label: t("analytics.last7Days", { defaultValue: "Last 7 days" }), value: String(totalActivity) },
            ]}
          />
        }
      >
        {/* NOTE: recharts is not RTL-aware — axis placement, category order, and
            the horizontal clone-census bar (§02) always render left-to-right even
            under Arabic. This is a known upstream limitation; a manual axis /
            orientation flip risks mislabelling the data, so the plots are
            deliberately left LTR. The enumerated per-point aria-labels below carry
            the full data order to assistive tech regardless of visual direction. */}

        {/* §01 — Daily activity: the page's one bold signature reading, framed
            with printer's corner registration ticks. */}
        <DocSection n="01" title={t("analytics.activity")}>
          <div className="tick-frame relative">
            <Figure n={1} label={t("analytics.activity")} actions={<Reading>Σ {totalActivity}</Reading>}>
              <div
                role="img"
                aria-label={`${t("analytics.activity")}: Σ ${totalActivity} — ${activityData
                  .map((d) => `${d.date} ${d.count}`)
                  .join(", ")}`}
              >
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
          </div>
        </DocSection>

        {/* §02 — Distributions: an asymmetric field of framed figures — language
            and similarity split unevenly, the clone-type census running full width. */}
        <DocSection n="02" title={t("analytics.distributions", { defaultValue: "Distributions" })}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* Language distribution */}
            <Figure n={2} label={t("analytics.langDist")} actions={<Reading>{uniqueLangs}</Reading>}>
              <div className="flex items-center justify-center gap-4">
                <div
                  role="img"
                  style={{ width: "45%" }}
                  aria-label={`${t("analytics.langDist")}: ${data.language_dist
                    .map((d) => `${d.language} ${d.count}`)
                    .join(", ")}`}
                >
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.language_dist}
                        dataKey="count"
                        nameKey="language"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        stroke="hsl(var(--card))"
                        strokeWidth={1}
                      >
                        {data.language_dist.map((_, i) => (
                          <Cell key={i} fill={LANG_RAMP[i % LANG_RAMP.length]} />
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
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LANG_RAMP[i % LANG_RAMP.length] }} />
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
              <div
                role="img"
                aria-label={`${t("analytics.simDist")}: ${data.similarity_dist
                  .map((d) => `${d.range} ${d.count}`)
                  .join(", ")}`}
              >
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

          {/* Clone-type frequency — full-width census below the split. */}
          {data.clone_dist.length > 0 && (
            <Figure
              n={4}
              label={t("analytics.cloneDist")}
              actions={<Reading>{data.clone_dist.length}</Reading>}
              className="mt-5"
            >
              <div
                role="img"
                aria-label={`${t("analytics.cloneDist")}: ${data.clone_dist
                  .map((d) => `${d.name} ${d.count}`)
                  .join(", ")}`}
              >
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
        </DocSection>

        {/* §03 — Top analyses: the ruled exhibit ledger, band-coloured ScoreMeter
            per row, MAX/ROWS folded into the section annotation. */}
        {data.top_analyses.length > 0 && (
          <DocSection
            n="03"
            title={t("analytics.topAnalyses")}
            actions={
              <MetaStrip
                items={[
                  { label: "MAX", value: `${topScore.toFixed(1)}%` },
                  { label: "ROWS", value: data.top_analyses.length },
                ]}
              />
            }
          >
            <Ledger columns="2.75rem minmax(9rem,1fr) minmax(9rem,1fr) 6.5rem minmax(10rem,12rem)">
              <LedgerHead
                cells={[
                  "#",
                  `${t("analytics.source")} A`,
                  `${t("analytics.source")} B`,
                  t("analytics.language"),
                  t("analytics.similarity"),
                ]}
                aligns={["start", "start", "start", "start", "end"]}
              />
              {data.top_analyses.map((a, i) => (
                <LedgerRow key={a.id}>
                  <LedgerCell>
                    <Serial tone={i === 0 ? "primary" : "muted"}>{i + 1}</Serial>
                  </LedgerCell>
                  <LedgerCell mono className="truncate text-xs text-foreground">
                    {a.sourceA}
                  </LedgerCell>
                  <LedgerCell mono className="truncate text-xs text-foreground">
                    {a.sourceB}
                  </LedgerCell>
                  <LedgerCell>
                    <Tag tone="neutral">{a.language}</Tag>
                  </LedgerCell>
                  <LedgerCell>
                    <ScoreMeter value={a.similarity} />
                  </LedgerCell>
                </LedgerRow>
              ))}
              <LedgerFooter left="SHOWING" right={data.top_analyses.length} />
            </Ledger>
          </DocSection>
        )}
      </DocFrame>
    </div>
  );
};

export default Analytics;
