import type { TFunction } from "i18next";
import type { AnalysisResult, CloneItem, SimilarityItem } from "@/types/api";
import { ADVISORY_FLOOR, CLONE_THRESHOLD, toneForScore, type TagTone } from "@/lib/bands";
import { downloadText } from "@/lib/download";

/**
 * Verdict derivations — pure functions over the loaded AnalysisResult.
 * Nothing here invents a claim: every number is a similarity item, a clone
 * flag or a count the engine returned; the only additions are the engine's
 * fixed combined-score weights and the standard clone-type taxonomy.
 */

export const COMBINED_NAME = "Combined Similarity";

export type SignalKey = "text" | "token" | "renamed" | "graph" | "semantic";

/** The engine's combined-score weights (fixed per engine version). */
export const SIGNAL_WEIGHTS: Record<SignalKey, number> = { text: 0.2, token: 0.25, renamed: 0.25, graph: 0.15, semantic: 0.15 };
const SIGNAL_ORDER: SignalKey[] = ["text", "token", "renamed", "graph", "semantic"];

/** The token metric that actually feeds the combined score, then the legacy name. */
const TOKEN_PREFERENCE = ["Token Similarity (unordered, with comments and whitespace)", "Token-Based Similarity"];

const SIGNAL_LABEL_KEYS: Record<string, string> = {
  "Text Similarity": "results.verdict.signals.text",
  "Token-Based Similarity": "results.verdict.signals.token",
  "Token Similarity (ordered)": "results.verdict.signals.tokenOrdered",
  "Token Similarity (ordered, excluding comments and whitespace)": "results.verdict.signals.tokenOrderedClean",
  "Token Similarity (unordered, with comments and whitespace)": "results.verdict.signals.tokenUnordered",
  "Token Similarity (unordered, excluding comments and whitespace)": "results.verdict.signals.tokenUnorderedClean",
  "Renamed Clone Similarity": "results.verdict.signals.renamed",
  "Graph-Based Similarity": "results.verdict.signals.graph",
  "AI Similarity": "results.verdict.signals.semantic",
};

/** Long-form names used by the exports and the radar. */
const SIMILARITY_NAME_KEYS: Record<string, string> = {
  "Text Similarity": "results.similarity.textSimilarity",
  "Token-Based Similarity": "results.similarity.tokenBased",
  "Token Similarity (ordered)": "results.similarity.tokenOrdered",
  "Token Similarity (ordered, excluding comments and whitespace)": "results.similarity.tokenOrderedClean",
  "Token Similarity (unordered, with comments and whitespace)": "results.similarity.tokenUnorderedFull",
  "Token Similarity (unordered, excluding comments and whitespace)": "results.similarity.tokenUnorderedClean",
  "Renamed Clone Similarity": "results.similarity.renamedClone",
  "Graph-Based Similarity": "results.similarity.graphBased",
  "Combined Similarity": "results.similarity.combined",
  "AI Similarity": "results.similarity.aiSimilarity",
};

export function translateSimilarityName(name: string, t: TFunction) {
  const key = SIMILARITY_NAME_KEYS[name];
  return key ? t(key) : name;
}

const CLONE_NAME_KEYS: Record<string, string> = {
  "Exact Clone": "results.cloneTypes.exactClone",
  "Near Miss Clone": "results.cloneTypes.nearMissClone",
  "Parameterized Clone": "results.cloneTypes.parameterizedClone",
  "Function Clone": "results.cloneTypes.functionClone",
  "Non-Contiguous Clone": "results.cloneTypes.nonContiguousClone",
  "Structural Clone": "results.cloneTypes.structuralClone",
  "Reordered Clone": "results.cloneTypes.reorderedClone",
  "Function Reordered Clone": "results.cloneTypes.functionReorderedClone",
  "Gapped Clone": "results.cloneTypes.gappedClone",
  "Intertwined Clone": "results.cloneTypes.intertwinedClone",
  "Semantic Clone": "results.cloneTypes.semanticClone",
};

export function translateCloneName(name: string, t: TFunction) {
  const key = CLONE_NAME_KEYS[name];
  return key ? t(key) : name;
}

/** Evidence strength used to order detected families (kept from the previous page). */
export const clonePriority: Record<string, number> = {
  "Exact Clone": 100,
  "Semantic Clone": 95,
  "Structural Clone": 90,
  "Near Miss Clone": 85,
  "Parameterized Clone": 80,
  "Function Clone": 75,
  "Non-Contiguous Clone": 70,
  "Reordered Clone": 65,
  "Function Reordered Clone": 60,
  "Gapped Clone": 55,
  "Intertwined Clone": 50,
};

/**
 * The standard clone taxonomy: Type-1 exact, Type-2 renamed identifiers or
 * literals, Type-3 statements added/removed/reordered, Type-4 semantic. A pair
 * is classed by the strongest (lowest-numbered) family the engine detected.
 */
const TYPE_BY_FAMILY: Record<string, 1 | 2 | 3 | 4> = {
  "Exact Clone": 1,
  "Parameterized Clone": 2,
  "Near Miss Clone": 3,
  "Gapped Clone": 3,
  "Non-Contiguous Clone": 3,
  "Reordered Clone": 3,
  "Function Reordered Clone": 3,
  "Intertwined Clone": 3,
  "Function Clone": 3,
  "Structural Clone": 3,
  "Semantic Clone": 4,
};

/* ────────────────────────────────────────────────────────────────────────
   Signals
   ──────────────────────────────────────────────────────────────────────── */

export interface SignalRow {
  /** The engine's own name for the item. */
  name: string;
  /** Short label for the verdict table. */
  label: string;
  key: SignalKey | null;
  /** Combined-score weight, or null when the item is not part of the formula. */
  weight: number | null;
  /** 0–100 as the engine reports it. */
  value: number;
}

function classifySignal(name: string): SignalKey | null {
  const n = name.toLowerCase();
  if (n === COMBINED_NAME.toLowerCase()) return null;
  if (/\btext\b/.test(n)) return "text";
  if (/renam/.test(n)) return "renamed";
  if (/graph|\bast\b/.test(n)) return "graph";
  if (/\bai\b|semantic|embedding/.test(n)) return "semantic";
  if (/token/.test(n)) return "token";
  return null;
}

function finiteValue(item: SimilarityItem) {
  const v = Number(item.value);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

/** Maps the result's similarity items onto the five weighted signals; anything else is listed unweighted. */
export function buildSignalRows(items: SimilarityItem[], t: TFunction): SignalRow[] {
  const used = new Set<SimilarityItem>();
  const rows: SignalRow[] = [];

  for (const key of SIGNAL_ORDER) {
    const candidates = items.filter((item) => !used.has(item) && classifySignal(item.name) === key);
    if (!candidates.length) continue;
    let pick = candidates[0];
    if (key === "token") {
      const preferred = TOKEN_PREFERENCE.map((name) => candidates.find((c) => c.name === name)).find(Boolean);
      if (preferred) pick = preferred;
    }
    used.add(pick);
    rows.push({ name: pick.name, label: t(`results.verdict.signals.${key}`), key, weight: SIGNAL_WEIGHTS[key], value: finiteValue(pick) });
  }

  for (const item of items) {
    if (used.has(item) || item.name === COMBINED_NAME) continue;
    const labelKey = SIGNAL_LABEL_KEYS[item.name];
    rows.push({ name: item.name, label: labelKey ? t(labelKey) : item.name, key: classifySignal(item.name), weight: null, value: finiteValue(item) });
  }

  return rows;
}

/** The engine's combined reading; falls back to the weighted formula only when the item is missing. */
export function getCombinedScore(result: AnalysisResult, rows?: SignalRow[]): number {
  const combined = result.similarity_items.find((item) => item.name === COMBINED_NAME);
  if (combined && Number.isFinite(Number(combined.value))) return Math.max(0, Math.min(100, Number(combined.value)));
  const weighted = (rows ?? []).filter((row) => row.weight != null);
  if (!weighted.length) return 0;
  return weighted.reduce((sum, row) => sum + (row.weight ?? 0) * row.value, 0);
}

/** 0.76 — the value column of the signals table. */
export function formatFraction(value: number) {
  return (Math.max(0, Math.min(100, value)) / 100).toFixed(2);
}

/* ────────────────────────────────────────────────────────────────────────
   Verdict & confidence
   ──────────────────────────────────────────────────────────────────────── */

export type ConfidenceLevel = "high" | "moderate" | "advisory";

export interface VerdictConfidence {
  level: ConfidenceLevel;
  advisory: boolean;
  corroborating: number;
  deterministicTotal: number;
}

/**
 * The deterministic (non-AI) signals corroborate a verdict; when the reading
 * rests mainly on the semantic signal the engine itself treats it as advisory
 * (Type-4 / cross-language), and so do we. Ported unchanged from the previous
 * page, keyed on classified signals so renamed items still count.
 */
export function getVerdictConfidence(rows: SignalRow[], cloneItems: CloneItem[]): VerdictConfidence {
  const deterministic = rows.filter((row) => row.weight != null && row.key !== "semantic").map((row) => row.value);
  const deterministicMax = deterministic.length ? Math.max(...deterministic) : 0;
  const corroborating = deterministic.filter((value) => value >= ADVISORY_FLOOR).length;
  const exactDetected = cloneItems.some((clone) => clone.name === "Exact Clone" && clone.detected);

  let level: ConfidenceLevel;
  if (exactDetected || deterministicMax >= 70) level = "high";
  else if (deterministicMax >= ADVISORY_FLOOR) level = "moderate";
  else level = "advisory";

  return { level, advisory: level === "advisory", corroborating, deterministicTotal: deterministic.length };
}

export interface CloneVerdict {
  /** Clone type per the taxonomy, or null when no family maps. */
  type: 1 | 2 | 3 | 4 | null;
  /** The family that names the verdict. */
  family: CloneItem | null;
  detected: CloneItem[];
}

export function getCloneVerdict(items: CloneItem[]): CloneVerdict {
  const detected = items
    .filter((item) => item.detected)
    .sort((a, b) => {
      const ta = TYPE_BY_FAMILY[a.name] ?? 9;
      const tb = TYPE_BY_FAMILY[b.name] ?? 9;
      if (ta !== tb) return ta - tb;
      return (clonePriority[b.name] ?? 0) - (clonePriority[a.name] ?? 0);
    });
  const family = detected[0] ?? null;
  const type = family ? TYPE_BY_FAMILY[family.name] ?? null : null;
  return { type, family, detected };
}

export interface VerdictHeadline {
  band: TagTone;
  title: string;
  tag: string;
}

export function getVerdictHeadline(score: number, clone: CloneVerdict, t: TFunction): VerdictHeadline {
  const band = toneForScore(score);
  if (band === "hot") {
    return {
      band,
      title: clone.family ? translateCloneName(clone.family.name, t) : t("results.verdict.titleFlagged"),
      tag: clone.type ? t("results.verdict.tagType", { n: clone.type }) : t("results.verdict.tagFlagged"),
    };
  }
  if (band === "advisory") {
    return {
      band,
      title: clone.family ? translateCloneName(clone.family.name, t) : t("results.similarity.moderate"),
      tag: t("results.verdict.tagAdvisory"),
    };
  }
  return { band, title: t("results.similarity.low"), tag: t("results.verdict.tagNoClone") };
}

/* ────────────────────────────────────────────────────────────────────────
   Why this verdict — the evidence chain
   ──────────────────────────────────────────────────────────────────────── */

export type EvidenceTarget = "comparator" | "graphs" | "report" | "checks";

export interface WhyRow {
  statement: string;
  evidence: string;
  target: EvidenceTarget;
}

export interface LineMatchSummary {
  matchedA: number;
  totalA: number;
  matchedB: number;
  totalB: number;
}

export function buildWhyRows(
  rows: SignalRow[],
  cloneItems: CloneItem[],
  confidence: VerdictConfidence,
  lines: LineMatchSummary | null,
  t: TFunction,
): WhyRow[] {
  const out: WhyRow[] = [];
  const drivers = [...rows].sort((a, b) => b.value - a.value).slice(0, 3);
  for (const row of drivers) {
    const above = row.value >= CLONE_THRESHOLD;
    const evidence = row.weight != null ? `${row.label} ${formatFraction(row.value)} · ×${row.weight.toFixed(2)}` : `${row.label} ${formatFraction(row.value)}`;
    out.push({
      statement: t(above ? "results.why.signalAbove" : "results.why.signalBelow", { name: row.label, value: row.value.toFixed(1), threshold: CLONE_THRESHOLD }),
      evidence,
      target: row.key === "graph" ? "graphs" : row.key === "semantic" ? "report" : "comparator",
    });
  }

  const detected = cloneItems.filter((item) => item.detected).sort((a, b) => (clonePriority[b.name] ?? 0) - (clonePriority[a.name] ?? 0));
  if (cloneItems.length) {
    out.push({
      statement: detected.length
        ? t("results.why.families", { count: detected.length, total: cloneItems.length, names: detected.slice(0, 3).map((item) => translateCloneName(item.name, t)).join(" · ") })
        : t("results.why.noFamilies", { total: cloneItems.length }),
      evidence: `${detected.length} / ${cloneItems.length}`,
      target: "checks",
    });
  }

  if (lines) {
    out.push({
      statement: t("results.why.lines", { matched: lines.matchedA, total: lines.totalA }),
      evidence: `A ${lines.matchedA}/${lines.totalA} · B ${lines.matchedB}/${lines.totalB}`,
      target: "comparator",
    });
  }

  if (confidence.advisory) {
    out.push({
      statement: t("results.verdictMeaning.advisoryNote"),
      evidence: t("results.confidence.tooltip", { corroborating: confidence.corroborating, total: confidence.deterministicTotal }),
      target: "report",
    });
  }

  return out;
}

/* ────────────────────────────────────────────────────────────────────────
   Exports (JSON / TXT) — unchanged behaviour
   ──────────────────────────────────────────────────────────────────────── */

export function exportAsJson(result: AnalysisResult) {
  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.json`, JSON.stringify(result, null, 2), "application/json");
}

export function exportAsText(result: AnalysisResult, t: TFunction) {
  const lines = [
    `${t("results.analysisId")}: ${result.saved_analysis_id ?? t("results.current")}`,
    `${t("results.language")}: ${result.language}`,
    `${t("results.sourceA")}: ${result.source_labels.code1}`,
    `${t("results.sourceB")}: ${result.source_labels.code2}`,
    "",
    `${t("results.similarityMetrics")}:`,
    ...result.similarity_items.map((item) => `- ${translateSimilarityName(item.name, t)}: ${Number(item.value).toFixed(2)}%`),
    "",
    `${t("results.cloneDetection")}:`,
    ...result.clone_items.map((item) => `- ${translateCloneName(item.name, t)}: ${item.detected ? t("results.cloneTypes.detected") : t("results.cloneTypes.notDetected")}`),
    "",
    `${t("results.interCodeAnalysis")}:`,
    result.analysis_text,
  ];
  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.txt`, lines.join("\n"));
}

/* ────────────────────────────────────────────────────────────────────────
   Dates — 2026-09-04 14:22, locale-independent like the History ledger
   ──────────────────────────────────────────────────────────────────────── */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function ledgerDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
