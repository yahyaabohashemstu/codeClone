import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { highlightSource, type Token } from "@/lib/highlight";

/**
 * The comparator's data layer: the line-level diff the engine already
 * computes (difflib opcodes over the two sources) turned into plate rows.
 *
 *   equal   → a matched REGION (R1…Rn), banded on both plates
 *   delete  → lines only in A, insert → lines only in B: GUARD rows ("no match")
 *   replace → lines that changed between the plates: plain rows, counted
 */

export interface DiffBlock {
  type: "equal" | "replace" | "delete" | "insert";
  lines_a: string[];
  lines_b: string[];
  start_a: number;
  start_b: number;
}

export interface DiffResponse {
  blocks: DiffBlock[];
  match_ratio: number;
  total_lines_a: number;
  total_lines_b: number;
  truncated?: boolean;
}

export type DiffState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: DiffResponse };

/** Fetches the diff for the saved analysis (or the current context when unsaved). Same endpoint as before. */
export function useAnalysisDiff(analysisId: number | null | undefined, enabled: boolean): DiffState {
  const [state, setState] = useState<DiffState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: "loading" });
    const url = analysisId ? `/api/analysis/diff?analysisId=${analysisId}` : "/api/analysis/diff";
    apiFetch<DiffResponse>(url)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Failed to load diff." });
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, enabled]);

  return state;
}

export type RowKind = "match" | "guard" | "changed" | "plain";

export interface PlateRow {
  /** 1-based source line number. */
  line: number;
  text: string;
  tokens: Token[];
  kind: RowKind;
  /** 1-based region number for matched rows. */
  region: number | null;
  /** First row of a matched region or of a guard/changed run. */
  runStart: boolean;
}

export interface Region {
  id: number;
  /** 0-based inclusive row indexes on each plate. */
  startA: number;
  endA: number;
  startB: number;
  endB: number;
}

export interface GuardRun {
  side: "a" | "b";
  start: number;
  end: number;
}

export interface Comparison {
  a: PlateRow[];
  b: PlateRow[];
  regions: Region[];
  guards: GuardRun[];
  matchedA: number;
  matchedB: number;
  changedA: number;
  changedB: number;
  /** When the engine capped the diff, the number of A lines it covered; null otherwise. */
  coveredA: number | null;
  bytesA: number;
  bytesB: number;
}

const encoder = new TextEncoder();

/** Mirrors Python's splitlines() closely enough that block offsets line up. */
export function splitSourceLines(code: string): string[] {
  const normalized = (code ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && normalized.endsWith("\n")) lines.pop();
  if (lines.length === 1 && lines[0] === "" && normalized === "") return [];
  return lines;
}

function toRows(code: string, language: string): PlateRow[] {
  const lines = splitSourceLines(code);
  const tokens = highlightSource(lines.join("\n"), language);
  return lines.map((text, i) => ({ line: i + 1, text, tokens: tokens[i] ?? [{ kind: "plain", text }], kind: "plain", region: null, runStart: false }));
}

function markRun(rows: PlateRow[], start: number, count: number, kind: RowKind, region: number | null) {
  for (let i = 0; i < count; i += 1) {
    const row = rows[start + i];
    if (!row) continue;
    row.kind = kind;
    row.region = region;
    row.runStart = i === 0;
  }
}

export function buildComparison(codeA: string, codeB: string, language: string, diff: DiffResponse | null): Comparison {
  const a = toRows(codeA, language);
  const b = toRows(codeB, language);
  const regions: Region[] = [];
  const guards: GuardRun[] = [];
  let coveredA = 0;

  if (diff) {
    for (const block of diff.blocks) {
      const lenA = block.lines_a.length;
      const lenB = block.lines_b.length;
      coveredA = Math.max(coveredA, block.start_a + lenA);
      if (block.type === "equal") {
        const id = regions.length + 1;
        markRun(a, block.start_a, lenA, "match", id);
        markRun(b, block.start_b, lenB, "match", id);
        regions.push({ id, startA: block.start_a, endA: block.start_a + lenA - 1, startB: block.start_b, endB: block.start_b + lenB - 1 });
      } else if (block.type === "delete") {
        markRun(a, block.start_a, lenA, "guard", null);
        if (lenA) guards.push({ side: "a", start: block.start_a, end: block.start_a + lenA - 1 });
      } else if (block.type === "insert") {
        markRun(b, block.start_b, lenB, "guard", null);
        if (lenB) guards.push({ side: "b", start: block.start_b, end: block.start_b + lenB - 1 });
      } else {
        markRun(a, block.start_a, lenA, "changed", null);
        markRun(b, block.start_b, lenB, "changed", null);
      }
    }
  }

  const count = (rows: PlateRow[], kind: RowKind) => rows.reduce((n, row) => n + (row.kind === kind ? 1 : 0), 0);

  return {
    a,
    b,
    regions,
    guards,
    matchedA: count(a, "match"),
    matchedB: count(b, "match"),
    changedA: count(a, "changed"),
    changedB: count(b, "changed"),
    coveredA: diff?.truncated ? coveredA : null,
    bytesA: encoder.encode(codeA ?? "").length,
    bytesB: encoder.encode(codeB ?? "").length,
  };
}

export interface OverlayRow extends PlateRow {
  side: "a" | "b";
  /** insert/delete rows have no counterpart on the other plate. */
  only: boolean;
}

/**
 * Overlay: A's lines in order, with B's differing lines laid under the A
 * lines they replace (or where they were inserted), tinted as guard rows.
 */
export function buildOverlay(cmp: Comparison, diff: DiffResponse | null): OverlayRow[] {
  const out: OverlayRow[] = [];
  const take = (rows: PlateRow[], start: number, count: number, side: "a" | "b", only: boolean) => {
    for (let i = 0; i < count; i += 1) {
      const row = rows[start + i];
      if (row) out.push({ ...row, runStart: i === 0, side, only });
    }
  };

  if (!diff) {
    cmp.a.forEach((row) => out.push({ ...row, side: "a", only: false }));
    return out;
  }

  let nextA = 0;
  let nextB = 0;
  for (const block of diff.blocks) {
    const lenA = block.lines_a.length;
    const lenB = block.lines_b.length;
    if (block.type === "equal") take(cmp.a, block.start_a, lenA, "a", false);
    else if (block.type === "delete") take(cmp.a, block.start_a, lenA, "a", true);
    else if (block.type === "insert") take(cmp.b, block.start_b, lenB, "b", true);
    else {
      take(cmp.a, block.start_a, lenA, "a", false);
      take(cmp.b, block.start_b, lenB, "b", false);
    }
    nextA = Math.max(nextA, block.start_a + lenA);
    nextB = Math.max(nextB, block.start_b + lenB);
  }
  // Lines past a capped diff are shown uncompared: A plain, B tinted.
  take(cmp.a, nextA, cmp.a.length - nextA, "a", false);
  take(cmp.b, nextB, cmp.b.length - nextB, "b", false);
  return out;
}
