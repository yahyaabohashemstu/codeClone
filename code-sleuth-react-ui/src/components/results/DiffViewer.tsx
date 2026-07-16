import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitCompare, Loader2 } from "lucide-react";
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
  // replace — both sides share the review-band amber, matching the legend
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
      <div className="card-premium overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitCompare className="h-4 w-4 text-primary" />
              {t("results.diff.title")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("results.diff.description")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{data.match_ratio}%</div>
              <div className="text-[10px] text-muted-foreground">{t("results.diff.matchRatio")}</div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{data.total_lines_a}</div>
              <div className="text-[10px] text-muted-foreground">{t("results.diff.linesA")}</div>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-center">
              <div className="text-lg font-bold text-foreground">{data.total_lines_b}</div>
              <div className="text-[10px] text-muted-foreground">{t("results.diff.linesB")}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-border/40 bg-muted/10 px-5 py-2">
          {(["equal", "delete", "insert", "replace"] as const).map((legendType) => (
            <span key={legendType} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn("h-2.5 w-2.5 rounded-sm",
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

        {/* Column headers (kept outside the scroll area so they stay put). */}
        <div className="grid grid-cols-1 border-b border-border/40 md:grid-cols-2 md:divide-x md:divide-border/40">
          <div className="bg-card px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {labelA}
            </span>
          </div>
          <div className="hidden bg-card px-3 py-2 md:block">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              {labelB}
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
