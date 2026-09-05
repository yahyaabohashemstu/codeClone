/**
 * The similarity bands. One threshold, three typographic tags:
 *   < 50  → neutral  (NO CLONE)
 *   50–79 → advisory (ADVISORY)
 *   ≥ 80  → hot      (FLAGGED / TYPE-n)
 * The threshold is the engine's real clone threshold and the CI gate default.
 */
export const CLONE_THRESHOLD = 80;
export const ADVISORY_FLOOR = 50;

export type TagTone = "hot" | "advisory" | "neutral";

export function toneForScore(score: number): TagTone {
  if (score >= CLONE_THRESHOLD) return "hot";
  if (score >= ADVISORY_FLOOR) return "advisory";
  return "neutral";
}
