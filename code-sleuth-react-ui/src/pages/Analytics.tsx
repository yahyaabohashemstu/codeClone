import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
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
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <Icon className={cn("mb-2 h-4 w-4", color ?? "text-primary")} />
      <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-foreground">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const Analytics = () => {
  const { language } = useLanguage();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<AnalyticsData>("/api/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics."));
  }, []);

  const copy =
    language === "ar"
      ? {
          title: "لوحة التحليلات",
          description: "نظرة شاملة على نشاطك وأنماط استخدامك للمنصة.",
          totalAnalyses: "إجمالي التحليلات",
          totalDesc: "عدد المقارنات المنفذة",
          languages: "اللغات المستخدمة",
          languagesDesc: "لغات برمجية مختلفة",
          topScore: "أعلى تشابه",
          topScoreDesc: "في آخر تحليل",
          activity: "النشاط اليومي (آخر 30 يوماً)",
          langDist: "توزيع اللغات",
          simDist: "توزيع نسب التشابه",
          cloneDist: "أنواع النسخ المكتشفة",
          topAnalyses: "أعلى 5 تحليلات تشابهاً",
          noData: "لا توجد بيانات بعد. شغّل تحليلاً لملء اللوحة.",
          startAnalysis: "ابدأ تحليلاً",
          similarity: "التشابه",
          count: "العدد",
          source: "المصدر",
          language: "اللغة",
          analyses: "تحليل",
        }
      : {
          title: "Analytics Dashboard",
          description: "A comprehensive view of your activity and usage patterns on the platform.",
          totalAnalyses: "Total Analyses",
          totalDesc: "Comparisons performed",
          languages: "Languages Used",
          languagesDesc: "Distinct programming languages",
          topScore: "Top Similarity",
          topScoreDesc: "Highest score on record",
          activity: "Daily Activity (Last 30 Days)",
          langDist: "Language Distribution",
          simDist: "Similarity Score Distribution",
          cloneDist: "Detected Clone Types",
          topAnalyses: "Top 5 Analyses by Similarity",
          noData: "No data yet. Run an analysis to populate the dashboard.",
          startAnalysis: "Start an Analysis",
          similarity: "Similarity",
          count: "Count",
          source: "Source",
          language: "Language",
          analyses: "analyses",
        };

  if (error) {
    return (
      <div className="card-premium p-10 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          {language === "ar" ? "جارٍ التحميل..." : "Loading…"}
        </div>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="card-premium mx-auto max-w-xl p-12 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-xl font-bold text-foreground">{copy.title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{copy.noData}</p>
        <Button asChild className="mt-6">
          <Link to="/analysis"><Plus className="mr-2 h-4 w-4" />{copy.startAnalysis}</Link>
        </Button>
      </div>
    );
  }

  const topScore = data.top_analyses[0]?.similarity ?? 0;
  const uniqueLangs = data.language_dist.length;

  // Shorten dates to MM/DD for activity chart
  const activityData = data.activity.map((d) => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-primary" />
          {copy.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard icon={Activity} label={copy.totalAnalyses} value={data.total} sub={copy.totalDesc} />
        <StatCard icon={GitCompare} label={copy.languages} value={uniqueLangs} sub={copy.languagesDesc} color="text-accent" />
        <StatCard icon={TrendingUp} label={copy.topScore} value={`${topScore.toFixed(1)}%`} sub={copy.topScoreDesc} color="text-warning" />
      </div>

      {/* Activity chart */}
      <div className="card-premium overflow-hidden">
        <div className="border-b border-border/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">{copy.activity}</h3>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(235 84% 59%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(235 84% 59%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area type="monotone" dataKey="count" stroke="hsl(235 84% 59%)" strokeWidth={2} fill="url(#actGrad)" name={copy.analyses} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-column row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Language distribution */}
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.langDist}</h3>
          </div>
          <div className="flex items-center justify-center gap-4 p-4">
            <ResponsiveContainer width="45%" height={180}>
              <PieChart>
                <Pie data={data.language_dist} dataKey="count" nameKey="language" cx="50%" cy="50%" outerRadius={72} strokeWidth={0}>
                  {data.language_dist.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.language_dist.slice(0, 7).map((d, i) => (
                <div key={d.language} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="text-foreground font-medium capitalize">{d.language}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Similarity distribution */}
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.simDist}</h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.similarity_dist} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name={copy.count}>
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
          </div>
        </div>
      </div>

      {/* Clone type frequency */}
      {data.clone_dist.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.cloneDist}</h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.clone_dist} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" fill="hsl(235 84% 59%)" radius={[0, 4, 4, 0]} name={copy.count} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top analyses table */}
      {data.top_analyses.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="border-b border-border/50 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.topAnalyses}</h3>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{copy.source} A</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{copy.source} B</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{copy.language}</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground">{copy.similarity}</th>
                </tr>
              </thead>
              <tbody>
                {data.top_analyses.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 1 ? "border-b border-border/30 bg-muted/5" : "border-b border-border/30"}>
                    <td className="px-5 py-3 text-xs font-mono text-foreground">{a.sourceA}</td>
                    <td className="px-5 py-3 text-xs font-mono text-foreground">{a.sourceB}</td>
                    <td className="px-5 py-3"><span className="badge-info capitalize">{a.language}</span></td>
                    <td className="px-5 py-3 text-center text-sm font-bold tabular-nums text-foreground">{a.similarity.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
