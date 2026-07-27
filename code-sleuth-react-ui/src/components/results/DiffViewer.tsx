import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitCompare, Loader2 } from "lucide-react";
import { OverprintMeter } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
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
  // Background tint carries the change type (the legend labels each colour);
  // no colored side-stripe, so the rows read as one calibrated system.
  if (type === "equal") return "bg-transparent";
  if (type === "delete") return side === "a" ? "bg-destructive/10" : "bg-muted/20";
  if (type === "insert") return side === "b" ? "bg-success/10" : "bg-muted/20";
  // replace — both sides tinted warning to match the legend swatch; the accent
  // (amber --primary) is never spent on data rows.
  return "bg-warning/10";
}

// Line numbers are the evidence trail: always full-opacity and legible, never
// dimmed for decoration. The row background already encodes the change type.
function lineNumClass() {
  return "text-muted-foreground";
}

// Fixed-height virtualization: only the rows within the viewport (plus a small
// overscan) are mounted, so a 50k-line diff renders ~40 DOM rows instead of
// 100k — the old implementation painted every line and froze the tab.
const ROW_HEIGHT = 24; // px, matches leading-6 (1.5rem)
const VIEWPORT_HEIGHT = 480; // px
const OVERSCAN = 12; // rows rendered above/below the viewport

type DiffRow = { line: string; lineNum: number | null; type: DiffBlock["type"] };

function VirtualColumn({
  rows,
  side,
  start,
  end,
  total,
}: {
  rows: DiffRow[];
  side: "a" | "b";
  start: number;
  end: number;
  total: number;
}) {
  return (
    <div className="relative min-w-0 font-mono text-xs leading-6" style={{ height: total * ROW_HEIGHT }}>
      {rows.slice(start, end).map((row, idx) => {
        const i = start + idx;
        return (
          <div
            key={i}
            style={{ position: "absolute", top: i * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
            className={cn(
              "flex items-start gap-2 overflow-x-auto px-2",
              lineClass(row.type, side),
              row.lineNum === null && "pointer-events-none select-none opacity-0",
            )}
          >
            <span className={cn("w-8 shrink-0 select-none text-right text-[11px] leading-6", lineNumClass())}>
              {row.lineNum ?? ""}
            </span>
            <span className="whitespace-pre text-foreground/90">{row.line}</span>
          </div>
        );
      })}
    </div>
  );
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
  const { t } = useTranslation("results");
  const [data, setData] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = analysisId ? `/api/analysis/diff?analysisId=${analysisId}` : "/api/analysis/diff";
    apiFetch<DiffResponse>(url)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load diff."))
      .finally(() => setLoading(false));
  }, [analysisId]);

  // Build the flat per-side row arrays ONCE per loaded diff. These were
  // previously rebuilt in the render body on every scroll frame (setScrollTop
  // re-renders), so an O(total_lines) allocation ran on each wheel tick and
  // partially defeated the row virtualization on large diffs. Memoizing keyed
  // on `data` leaves scrolling to only recompute the cheap start/end indices.
  const { rowsA, rowsB, total } = useMemo(() => {
    const a: DiffRow[] = [];
    const b: DiffRow[] = [];
    if (data) {
      for (const block of data.blocks) {
        const maxLen = Math.max(block.lines_a.length, block.lines_b.length);
        for (let i = 0; i < maxLen; i++) {
          a.push({
            line: block.lines_a[i] ?? "",
            lineNum: i < block.lines_a.length ? block.start_a + i + 1 : null,
            type: block.type,
          });
          b.push({
            line: block.lines_b[i] ?? "",
            lineNum: i < block.lines_b.length ? block.start_b + i + 1 : null,
            type: block.type,
          });
        }
      }
    }
    return { rowsA: a, rowsB: b, total: a.length };
  }, [data]);

  if (loading) {
    return (
      <div className="card-premium flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t("results.diff.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-premium p-8 text-center text-sm text-destructive">
        {error || t("results.diff.failedToLoad")}
      </div>
    );
  }

  const maxLines = Math.max(data.total_lines_a, data.total_lines_b);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);

  const legendMap = {
    equal: t("results.diff.legendEqual"),
    delete: t("results.diff.legendDelete"),
    insert: t("results.diff.legendInsert"),
    replace: t("results.diff.legendReplace"),
  } as const;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden border border-border bg-card">
        {/* The light-table readout: title, then the match measured on the meter */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="t-label flex items-center gap-2 text-foreground">
              <GitCompare className="h-3.5 w-3.5 text-primary" />
              {t("results.diff.title")}
            </h3>
            <span className="press-slug tabular-nums">
              A {data.total_lines_a} · B {data.total_lines_b}
            </span>
          </div>
          <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">{t("results.diff.description")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span
              className="font-display text-2xl font-extrabold leading-none tabular-nums text-foreground"
              style={{ fontStretch: "118%" }}
            >
              {data.match_ratio}%
            </span>
            <OverprintMeter
              value={data.match_ratio}
              className="h-2.5 min-w-36 max-w-72 flex-1"
              label={`${t("results.diff.matchRatio")}: ${data.match_ratio}%`}
            />
            <span className="press-slug">{t("results.diff.matchRatio")}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-border bg-muted/20 px-5 py-2">
          {(["equal", "delete", "insert", "replace"] as const).map((legendType) => (
            <span key={legendType} className="press-slug flex items-center gap-1.5 normal-case tracking-normal">
              <span
                className={cn("h-2.5 w-2.5",
                  legendType === "equal" && "bg-muted-foreground/30",
                  legendType === "delete" && "bg-destructive/60",
                  legendType === "insert" && "bg-success/60",
                  legendType === "replace" && "bg-warning/60",
                )}
              />
              {legendMap[legendType]}
            </span>
          ))}
        </div>

        {/* Column headers — the two plates (kept outside the scroll area so they stay put). */}
        <div className="grid grid-cols-1 border-b border-border md:grid-cols-2 md:divide-x md:divide-border rtl:md:divide-x-reverse">
          <div className="bg-card px-3 py-2">
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
              <span className="h-2 w-2 shrink-0 bg-plate-a" aria-hidden />
              <span className="truncate" dir="auto">{labelA}</span>
            </span>
          </div>
          <div className="hidden bg-card px-3 py-2 md:block">
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
              <span className="h-2 w-2 shrink-0 bg-plate-b" aria-hidden />
              <span className="truncate" dir="auto">{labelB}</span>
            </span>
          </div>
        </div>

        {/* Virtualized diff body: only the rows within the viewport are mounted. */}
        <div
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{ height: VIEWPORT_HEIGHT }}
          className="overflow-y-auto scrollbar-thin"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border/40">
            <VirtualColumn rows={rowsA} side="a" start={startIndex} end={endIndex} total={total} />
            <VirtualColumn rows={rowsB} side="b" start={startIndex} end={endIndex} total={total} />
          </div>
        </div>

        <div className="border-t border-border/40 px-5 py-3 text-center text-xs text-muted-foreground">
          {t("results.diff.showingLines", { count: maxLines })}
        </div>
      </div>
    </div>
  );
}
