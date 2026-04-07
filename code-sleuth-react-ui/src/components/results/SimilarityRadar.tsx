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
  "Text Similarity": { en: "Text", ar: "نص" },
  "Token-Based Similarity": { en: "Token", ar: "توكن" },
  "Token Similarity (ordered)": { en: "Token\n(ord)", ar: "توكن\nمرتب" },
  "Token Similarity (ordered, excluding comments and whitespace)": { en: "Token\n(ord-clean)", ar: "توكن\nمرتب-نظيف" },
  "Token Similarity (unordered, with comments and whitespace)": { en: "Token\n(unord)", ar: "توكن\nغ.مرتب" },
  "Token Similarity (unordered, excluding comments and whitespace)": { en: "Token\n(unord-clean)", ar: "توكن\nغ.مرتب-نظيف" },
  "Renamed Clone Similarity": { en: "Renamed", ar: "مُعاد\nالتسمية" },
  "Graph-Based Similarity": { en: "Graph", ar: "رسم\nبياني" },
  "Combined Similarity": { en: "Combined", ar: "مجمّع" },
  "AI Similarity": { en: "AI", ar: "ذكاء\nاصطناعي" },
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

  // Pick up to 8 items for legible radar (skip Combined to avoid redundancy on the axes)
  const filtered = items
    .filter((i) => i.name !== "Combined Similarity")
    .slice(0, 8);

  const data = filtered.map((item) => ({
    subject: shortLabel(item.name, language),
    fullName: item.name,
    value: Math.max(0, Math.min(100, item.value)),
  }));

  const copy =
    language === "ar"
      ? {
          title: "مخطط الرادار — أبعاد التشابه",
          description: "عرض بصري لكل مقاييس التشابه في رسم واحد — كل محور بُعد مستقل.",
        }
      : {
          title: "Similarity Radar",
          description: "All similarity dimensions at a glance — each axis is an independent measurement.",
        };

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-primary" />
          {copy.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
      </div>
      <div className="flex items-center justify-center p-4">
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
              stroke="hsl(235 84% 59%)"
              fill="hsl(235 84% 59%)"
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
