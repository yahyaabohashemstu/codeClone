import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plate, PlateFooter, PlateHeader, Segment, SegmentGroup } from "@/components/bench/Bench";
import { formatBytes } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { buildOverlay, type Comparison, type DiffState, type GuardRun, type OverlayRow, type PlateRow, type Region } from "./comparison";

/**
 * The comparator (design nodes 15:555 · 15:568 · 15:646): two lit plates on
 * the bench with the numbered spine between them, and two presentational
 * modes over the same rows — Overlay (one plate, B's differing lines laid
 * under A's) and Blink (A and B alternate in place; a manual A|B switch
 * under prefers-reduced-motion).
 */

export type ComparatorMode = "side" | "overlay" | "blink";

const HEADER_H = 40;
const BODY_PAD = 14;
const ROW_H = 21;
const FOOTER_H = 32;
/** Rows rendered before the reader opts into the full listing (keeps 20k-line plates responsive). */
const ROW_CAP = 400;
const BLINK_MS = 700;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (typeof window !== "undefined" && "matchMedia" in window ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false));
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ────────────────────────────────────────────────────────────────────────
   Rows on a plate
   ──────────────────────────────────────────────────────────────────────── */

type RenderRow = PlateRow & { side?: "a" | "b"; only?: boolean };

function rowClass(row: RenderRow, overlay: boolean) {
  if (row.kind === "match") return cn("is-match", row.runStart && "is-region-start");
  if (overlay) return row.side === "b" ? "is-guard" : undefined;
  return row.kind === "guard" ? "is-guard" : undefined;
}

function CodeRows({ rows, overlay, label }: { rows: RenderRow[]; overlay: boolean; label: (row: RenderRow) => string | null }) {
  return (
    <div className="plate-code" dir="ltr">
      {rows.map((row, i) => {
        const tag = label(row);
        return (
          <div key={`${row.side ?? "r"}-${row.line}-${i}`} className={cn("code-line", rowClass(row, overlay))}>
            <span className="code-marker" />
            <span className="code-gutter">{row.line}</span>
            <span className="code-text" title={row.text.length > 80 ? row.text : undefined}>
              {row.tokens.map((tok, j) =>
                tok.kind === "plain" ? (
                  tok.text
                ) : (
                  <span key={j} className={tok.kind === "kw" ? "code-kw" : tok.kind === "comment" ? "code-comment" : "code-str"}>
                    {tok.text}
                  </span>
                ),
              )}
            </span>
            {tag && <span className="code-region">{tag}</span>}
          </div>
        );
      })}
    </div>
  );
}

function CodePlate({
  label,
  filename,
  meta,
  rows,
  overlay = false,
  rowLabel,
  footerStart,
  footerEnd,
  headerAside,
  className,
}: {
  label: string;
  filename: string;
  meta: string;
  rows: RenderRow[];
  overlay?: boolean;
  rowLabel: (row: RenderRow) => string | null;
  footerStart: ReactNode;
  footerEnd: ReactNode;
  headerAside?: ReactNode;
  className?: string;
}) {
  return (
    <Plate className={cn("h-full", className)}>
      <PlateHeader label={label} filename={filename} meta={headerAside ? undefined : meta}>
        {headerAside}
      </PlateHeader>
      <div className="min-h-0 flex-1 py-3.5">
        <CodeRows rows={rows} overlay={overlay} label={rowLabel} />
      </div>
      <PlateFooter start={footerStart} end={footerEnd} />
    </Plate>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Spine — numbered connectors between the two plates
   ──────────────────────────────────────────────────────────────────────── */

function rowMid(start: number, end: number, shown: number) {
  const last = Math.min(end, shown - 1);
  return HEADER_H + BODY_PAD + ((start + last) / 2 + 0.5) * ROW_H;
}

function Spine({ regions, guards, shownA, shownB }: { regions: Region[]; guards: GuardRun[]; shownA: number; shownB: number }) {
  const height = HEADER_H + BODY_PAD + Math.max(shownA, shownB, 1) * ROW_H + BODY_PAD + FOOTER_H;
  const links = regions
    .filter((r) => r.startA < shownA && r.startB < shownB)
    .map((r) => ({ id: r.id, yA: rowMid(r.startA, r.endA, shownA), yB: rowMid(r.startB, r.endB, shownB) }));
  const stubs = guards
    .filter((g) => g.start < (g.side === "a" ? shownA : shownB))
    .map((g, i) => ({ key: i, side: g.side, y: rowMid(g.start, g.end, g.side === "a" ? shownA : shownB) }));

  return (
    <>
      {/* ≥ lg: the vertical spine */}
      <div aria-hidden className="relative hidden lg:block lg:w-12 lg:shrink-0" style={{ minHeight: height }}>
        <span className="absolute inset-y-0 start-1/2 w-px bg-bench-hair" />
        <svg className="absolute inset-0 h-full w-full overflow-visible rtl:-scale-x-100" viewBox={`0 0 48 ${height}`} preserveAspectRatio="none" fill="none">
          {links.map((l) => (
            <path key={l.id} d={`M0 ${l.yA} C 20 ${l.yA} 28 ${l.yB} 48 ${l.yB}`} stroke="var(--signal-base)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {links.map((l) => (
          <span
            key={l.id}
            className="mono-ordinal absolute start-1/2 z-[1] flex h-[14px] w-[14px] -translate-x-1/2 items-center justify-center border border-signal bg-bench-raised text-signal-bench rtl:translate-x-1/2"
            style={{ top: (l.yA + l.yB) / 2 - 7 }}
          >
            {l.id}
          </span>
        ))}
        {stubs.map((s) => (
          <span
            key={s.key}
            className="absolute w-3 border-t border-dotted border-match-marker"
            style={{ top: s.y, ...(s.side === "a" ? { insetInlineStart: 0 } : { insetInlineEnd: 0 }) }}
          />
        ))}
      </div>
      {/* < lg: plates stack, the spine becomes a ruled strip carrying the region markers */}
      <div aria-hidden className="flex h-8 items-center gap-2 lg:hidden">
        <span className="h-px flex-1 bg-bench-hair" />
        {links.map((l) => (
          <span key={l.id} className="mono-ordinal flex h-[14px] w-[14px] items-center justify-center border border-signal bg-bench-raised text-signal-bench">
            {l.id}
          </span>
        ))}
        <span className="h-px flex-1 bg-bench-hair" />
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Comparator
   ──────────────────────────────────────────────────────────────────────── */

export function Comparator({
  id,
  comparison,
  diff,
  languageLabel,
  labelA,
  labelB,
}: {
  id?: string;
  comparison: Comparison;
  diff: DiffState;
  languageLabel: string;
  labelA: string;
  labelB: string;
}) {
  const { t } = useTranslation("results");
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<ComparatorMode>("side");
  const [blinkSide, setBlinkSide] = useState<"a" | "b">("a");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (mode !== "blink" || reduced) return;
    const timer = window.setInterval(() => setBlinkSide((s) => (s === "a" ? "b" : "a")), BLINK_MS);
    return () => window.clearInterval(timer);
  }, [mode, reduced]);

  const diffData = diff.status === "ready" ? diff.data : null;
  const overlayRows = useMemo<OverlayRow[]>(() => (mode === "overlay" ? buildOverlay(comparison, diffData) : []), [mode, comparison, diffData]);

  const cap = showAll ? Number.POSITIVE_INFINITY : ROW_CAP;
  const rowsA = comparison.a.slice(0, cap);
  const rowsB = comparison.b.slice(0, cap);
  const capped = comparison.a.length > ROW_CAP || comparison.b.length > ROW_CAP;
  const guardsA = comparison.guards.filter((g) => g.side === "a").length;
  const guardsB = comparison.guards.filter((g) => g.side === "b").length;
  const changed = comparison.changedA + comparison.changedB;

  const sideLabel = (row: RenderRow) => {
    if (!row.runStart) return null;
    if (row.kind === "match" && row.region != null) return `R${row.region}`;
    if (row.kind === "guard") return t("results.comparator.noMatch");
    return null;
  };
  const overlayLabel = (row: RenderRow) => {
    if (!row.runStart) return null;
    if (row.kind === "match" && row.region != null) return `R${row.region}`;
    if (row.side === "b") return row.only ? t("results.comparator.onlyB") : t("results.comparator.fromB");
    if (row.only) return t("results.comparator.onlyA");
    return null;
  };

  const meta = (rows: PlateRow[]) => `${languageLabel} · ${t("results.comparator.lines", { count: rows.length })}`;
  const matchedText = (matched: number, total: number, unmatched: number) =>
    `${t("results.comparator.footerMatched", { matched, total })}${unmatched > 0 ? ` · ${t("results.comparator.footerUnmatched", { count: unmatched })}` : ""}`;
  const toggleAll = capped ? (
    <button type="button" onClick={() => setShowAll((v) => !v)} className="underline underline-offset-2 hover:text-plate-ink">
      {showAll ? t("results.comparator.showFewer", { count: ROW_CAP }) : t("results.comparator.showAll", { count: Math.max(comparison.a.length, comparison.b.length) })}
    </button>
  ) : null;
  const bytesText = (bytes: number) => `${formatBytes(bytes)} · UTF-8`;

  const summary =
    diff.status === "loading"
      ? t("results.comparator.loading")
      : diff.status === "error"
        ? diff.message || t("results.comparator.failed")
        : [
            t("results.comparator.summary", { regions: comparison.regions.length, guards: comparison.guards.length }),
            changed > 0 ? t("results.comparator.changed", { count: changed }) : null,
            comparison.coveredA != null ? t("results.comparator.truncated", { count: comparison.coveredA }) : null,
          ]
            .filter(Boolean)
            .join(" · ");

  const caption =
    mode === "side" ? t("results.comparator.captionSide") : mode === "overlay" ? t("results.comparator.captionOverlay") : reduced ? t("results.comparator.captionBlinkStill") : t("results.comparator.captionBlink");

  const modes: Array<{ id: ComparatorMode; label: string }> = [
    { id: "side", label: t("results.comparator.sideBySide") },
    { id: "overlay", label: t("results.comparator.overlay") },
    { id: "blink", label: t("results.comparator.blink") },
  ];

  const blinkRows = blinkSide === "a" ? rowsA : rowsB;
  const blinkIndicator = reduced ? (
    <SegmentGroup surface="plate" aria-label={t("results.comparator.blinkSwitch")}>
      <Segment surface="plate" on={blinkSide === "a"} onClick={() => setBlinkSide("a")}>A</Segment>
      <Segment surface="plate" on={blinkSide === "b"} onClick={() => setBlinkSide("b")}>B</Segment>
    </SegmentGroup>
  ) : (
    <span className="segment-group-plate" role="status" aria-live="polite" aria-label={t("results.comparator.showing", { side: blinkSide.toUpperCase() })}>
      <span className={cn("segment-plate", blinkSide === "a" && "is-on")}>A</span>
      <span className={cn("segment-plate", blinkSide === "b" && "is-on")}>B</span>
    </span>
  );

  return (
    <section id={id} aria-label={t("results.comparator.label")}>
      {/* Section head */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <span className="label text-txt-muted">{t("results.comparator.label")}</span>
          <SegmentGroup aria-label={t("results.comparator.viewMode")}>
            {modes.map((m) => (
              <Segment key={m.id} on={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </Segment>
            ))}
          </SegmentGroup>
          <span className="hidden text-[12.5px] leading-normal text-txt-muted xl:inline">{caption}</span>
        </div>
        <span className={cn("text-[12.5px] leading-normal", diff.status === "error" ? "text-signal-bench" : "text-txt-secondary")} role="status">
          {summary}
        </span>
      </div>

      {/* Plates */}
      <div className="pt-4">
        {mode === "side" && (
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1">
              <CodePlate
                label={t("results.comparator.plateA")}
                filename={labelA}
                meta={meta(comparison.a)}
                rows={rowsA}
                rowLabel={sideLabel}
                footerStart={matchedText(comparison.matchedA, comparison.a.length, guardsA)}
                footerEnd={<>{toggleAll}<span dir="ltr">{bytesText(comparison.bytesA)}</span></>}
              />
            </div>
            <Spine regions={comparison.regions} guards={comparison.guards} shownA={rowsA.length} shownB={rowsB.length} />
            <div className="min-w-0 flex-1">
              <CodePlate
                label={t("results.comparator.plateB")}
                filename={labelB}
                meta={meta(comparison.b)}
                rows={rowsB}
                rowLabel={sideLabel}
                footerStart={matchedText(comparison.matchedB, comparison.b.length, guardsB)}
                footerEnd={<>{toggleAll}<span dir="ltr">{bytesText(comparison.bytesB)}</span></>}
              />
            </div>
          </div>
        )}

        {mode === "overlay" && (
          <CodePlate
            label={t("results.comparator.overlay")}
            filename={`${labelA} + ${labelB}`}
            meta={`${languageLabel} · ${t("results.comparator.overlayMeta", { a: comparison.a.length, b: comparison.b.length })}`}
            rows={overlayRows.slice(0, cap)}
            overlay
            rowLabel={overlayLabel}
            footerStart={`${matchedText(comparison.matchedA, comparison.a.length, guardsA)} · ${t("results.comparator.overlayFooter", { count: overlayRows.filter((r) => r.side === "b").length })}`}
            footerEnd={<>{toggleAll}<span dir="ltr">{bytesText(comparison.bytesA + comparison.bytesB)}</span></>}
          />
        )}

        {mode === "blink" && (
          <CodePlate
            label={blinkSide === "a" ? t("results.comparator.plateA") : t("results.comparator.plateB")}
            filename={blinkSide === "a" ? labelA : labelB}
            meta=""
            headerAside={blinkIndicator}
            rows={blinkRows}
            rowLabel={sideLabel}
            footerStart={blinkSide === "a" ? matchedText(comparison.matchedA, comparison.a.length, guardsA) : matchedText(comparison.matchedB, comparison.b.length, guardsB)}
            footerEnd={<>{toggleAll}<span dir="ltr">{bytesText(blinkSide === "a" ? comparison.bytesA : comparison.bytesB)}</span></>}
          />
        )}
      </div>
    </section>
  );
}
