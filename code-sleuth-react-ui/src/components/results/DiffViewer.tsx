import { useEffect, useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

interface DiffBlock {
  type: "equal" | "replace" | "delete" | "insert";
  lines_a: string[];
  lines_b: string[];
  start_a: number;
  start_b: number;
}

interface DiffResponse {
  blocks: DiffBlock[];
  match_ratio: number;
  total_lines_a: number;
  total_lines_b: number;
}

function lineClass(type: DiffBlock["type"], side: "a" | "b") {
  if (type === "equal") return "bg-transparent";
  if (type === "delete") return side === "a" ? "bg-destructive/10 border-l-2 border-destructive/50" : "bg-muted/20";
  if (type === "insert") return side === "b" ? "bg-success/10 border-l-2 border-success/50" : "bg-muted/20";
  // replace
  return side === "a" ? "bg-warning/10 border-l-2 border-warning/50" : "bg-primary/10 border-l-2 border-primary/50";
}

function lineNumClass(type: DiffBlock["type"], side: "a" | "b") {
  if (type === "equal") return "text-muted-foreground/40";
  if (type === "delete") return side === "a" ? "text-destructive/70" : "text-muted-foreground/25";
  if (type === "insert") return side === "b" ? "text-success/70" : "text-muted-foreground/25";
  return side === "a" ? "text-warning/70" : "text-primary/70";
}

export function DiffViewer({
  analysisId,
  labelA,
  labelB,
}: {
  analysisId?: number | null;
  labelA: string;
  labelB: string;
}) {
  const { language } = useLanguage();
  const [data, setData] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = analysisId ? `/api/analysis/diff?analysisId=${analysisId}` : "/api/analysis/diff";
    apiFetch<DiffResponse>(url)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load diff."))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const copy =
    language === "ar"
      ? {
          title: "عارض الفروق السطرية",
          description: "مقارنة مباشرة سطراً بسطر بين المصدرين مع تمييز الأجزاء المتطابقة والمختلفة.",
          loading: "جارٍ تحليل الفروق...",
          matchRatio: "نسبة التطابق",
          linesA: "أسطر المصدر A",
          linesB: "أسطر المصدر B",
          legend: { equal: "متطابق", delete: "محذوف", insert: "مضاف", replace: "معدّل" },
        }
      : {
          title: "Line-by-Line Diff",
          description: "Direct side-by-side comparison showing exactly which lines match, differ, or were added.",
          loading: "Analyzing differences…",
          matchRatio: "Match ratio",
          linesA: "Source A lines",
          linesB: "Source B lines",
          legend: { equal: "Equal", delete: "Removed", insert: "Added", replace: "Changed" },
        };

  if (loading) {
    return (
      <div className="card-premium flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {copy.loading}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-premium p-8 text-center text-sm text-destructive">
        {error || (language === "ar" ? "تعذر تحميل الفروق." : "Failed to load diff.")}
      </div>
    );
  }

  const maxLines = Math.max(data.total_lines_a, data.total_lines_b);

  // Build flat row lists for each side
  const rowsA: { line: string; lineNum: number | null; type: DiffBlock["type"] }[] = [];
  const rowsB: { line: string; lineNum: number | null; type: DiffBlock["type"] }[] = [];

  for (const block of data.blocks) {
    const maxLen = Math.max(block.lines_a.length, block.lines_b.length);
    for (let i = 0; i < maxLen; i++) {
      rowsA.push({
        line: block.lines_a[i] ?? "",
        lineNum: i < block.lines_a.length ? block.start_a + i + 1 : null,
        type: block.type,
      });
      rowsB.push({
        line: block.lines_b[i] ?? "",
        lineNum: i < block.lines_b.length ? block.start_b + i + 1 : null,
        type: block.type,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-premium overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitCompare className="h-4 w-4 text-primary" />
              {copy.title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{data.match_ratio}%</div>
              <div className="text-[10px] text-muted-foreground">{copy.matchRatio}</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-primary">{data.total_lines_a}</div>
              <div className="text-[10px] text-muted-foreground">{copy.linesA}</div>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-accent">{data.total_lines_b}</div>
              <div className="text-[10px] text-muted-foreground">{copy.linesB}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-border/40 bg-muted/10 px-5 py-2">
          {(["equal", "delete", "insert", "replace"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn("h-2.5 w-2.5 rounded-sm",
                  t === "equal" && "bg-muted-foreground/30",
                  t === "delete" && "bg-destructive/60",
                  t === "insert" && "bg-success/60",
                  t === "replace" && "bg-warning/60",
                )}
              />
              {copy.legend[t]}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 divide-x divide-border/40 overflow-x-auto scrollbar-thin">
          {/* Source A */}
          <div className="min-w-0">
            <div className="sticky top-0 border-b border-border/40 bg-card px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {labelA}
              </span>
            </div>
            <div className="font-mono text-xs leading-6">
              {rowsA.map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-2",
                    lineClass(row.type, "a"),
                    row.lineNum === null && "opacity-0 pointer-events-none select-none",
                  )}
                >
                  <span className={cn("w-8 shrink-0 select-none text-right text-[10px] leading-6", lineNumClass(row.type, "a"))}>
                    {row.lineNum ?? ""}
                  </span>
                  <span className="whitespace-pre-wrap break-all text-foreground/90">{row.line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Source B */}
          <div className="min-w-0">
            <div className="sticky top-0 border-b border-border/40 bg-card px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {labelB}
              </span>
            </div>
            <div className="font-mono text-xs leading-6">
              {rowsB.map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-2",
                    lineClass(row.type, "b"),
                    row.lineNum === null && "opacity-0 pointer-events-none select-none",
                  )}
                >
                  <span className={cn("w-8 shrink-0 select-none text-right text-[10px] leading-6", lineNumClass(row.type, "b"))}>
                    {row.lineNum ?? ""}
                  </span>
                  <span className="whitespace-pre-wrap break-all text-foreground/90">{row.line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {maxLines > 300 && (
          <div className="border-t border-border/40 px-5 py-3 text-center text-xs text-muted-foreground">
            {language === "ar"
              ? `عرض ${maxLines} سطراً — قد تحتاج إلى التمرير لرؤية جميع الاختلافات.`
              : `Showing ${maxLines} lines — scroll to see all differences.`}
          </div>
        )}
      </div>
    </div>
  );
}
