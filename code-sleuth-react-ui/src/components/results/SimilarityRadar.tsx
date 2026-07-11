import { useTranslation } from "react-i18next";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Activity } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { SimilarityItem } from "@/types/api";

// Short axis labels that fit the radar chart
const SHORT_LABELS: Record<string, { en: string; ar: string }> = {
  "Text Similarity": { en: "Text", ar: "\u0646\u0635" },
  "Token-Based Similarity": { en: "Token", ar: "\u062A\u0648\u0643\u0646" },
  "Token Similarity (ordered)": { en: "Token\n(ord)", ar: "\u062A\u0648\u0643\u0646\n\u0645\u0631\u062A\u0628" },
  "Token Similarity (ordered, excluding comments and whitespace)": { en: "Token\n(ord-clean)", ar: "\u062A\u0648\u0643\u0646\n\u0645\u0631\u062A\u0628-\u0646\u0638\u064A\u0641" },
  "Token Similarity (unordered, with comments and whitespace)": { en: "Token\n(unord)", ar: "\u062A\u0648\u0643\u0646\n\u063A.\u0645\u0631\u062A\u0628" },
  "Token Similarity (unordered, excluding comments and whitespace)": { en: "Token\n(unord-clean)", ar: "\u062A\u0648\u0643\u0646\n\u063A.\u0645\u0631\u062A\u0628-\u0646\u0638\u064A\u0641" },
  "Renamed Clone Similarity": { en: "Renamed", ar: "\u0645\u064F\u0639\u0627\u062F\n\u0627\u0644\u062A\u0633\u0645\u064A\u0629" },
  "Graph-Based Similarity": { en: "Graph", ar: "\u0631\u0633\u0645\n\u0628\u064A\u0627\u0646\u064A" },
  "Combined Similarity": { en: "Combined", ar: "\u0645\u062C\u0645\u0651\u0639" },
  "AI Similarity": { en: "AI", ar: "\u0630\u0643\u0627\u0621\n\u0627\u0635\u0637\u0646\u0627\u0639\u064A" },
};

function shortLabel(name: string, lang: "en" | "ar"): string {
  return SHORT_LABELS[name]?.[lang] ?? name.split(" ")[0];
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: { value: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { subject: string; value: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{d.subject}</p>
      <p className="mt-0.5 text-primary">{d.value.toFixed(2)}%</p>
    </div>
  );
}

export function SimilarityRadar({ items }: { items: SimilarityItem[] }) {
  const { language } = useLanguage();
  const { t } = useTranslation("results");

  // Pick up to 8 items for legible radar (skip Combined to avoid redundancy on the axes)
  const filtered = items
    .filter((i) => i.name !== "Combined Similarity")
    .slice(0, 8);

  const data = filtered.map((item) => {
    // Coerce and clamp; a missing/non-numeric value renders as 0 rather than
    // surfacing "NaN%" (and a misleading green dot) in the chart and tooltip.
    const numeric = Number(item.value);
    return {
      subject: shortLabel(item.name, language),
      fullName: item.name,
      value: Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0,
    };
  });

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-primary" />
          {t("results.radar.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("results.radar.description")}</p>
      </div>
      <div
        className="flex items-center justify-center p-4"
        role="img"
        aria-label={data.map((entry) => `${entry.fullName}: ${Math.round(entry.value)}%`).join(", ")}
      >
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data} margin={{ top: 16, right: 32, bottom: 16, left: 32 }}>
            <PolarGrid stroke="hsl(var(--border) / 0.5)" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}
            />
            <Radar
              name="similarity"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.18}
              strokeWidth={2}
              dot={(props: CustomDotProps) => {
                const { cx = 0, cy = 0, payload } = props;
                const v = payload?.value ?? 0;
                const color =
                  v >= 80
                    ? "hsl(var(--destructive))"
                    : v >= 50
                    ? "hsl(var(--warning))"
                    : "hsl(var(--success))";
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke="hsl(var(--card))" strokeWidth={1.5} />;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
