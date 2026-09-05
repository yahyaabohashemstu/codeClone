import { useTranslation } from "react-i18next";
import { Scale, ScaleNumerals, Tag } from "@/components/bench/Bench";
import { CLONE_THRESHOLD } from "@/lib/bands";
import { cn } from "@/lib/utils";
import { formatFraction, type SignalRow, type VerdictConfidence, type VerdictHeadline } from "./verdict";

/**
 * The verdict block (design node 14:268): the combined reading on the
 * engraved 0–100 scale at the left, the verdict, its tag and confidence, and
 * the weighted signals table at the right.
 */
export function VerdictBlock({
  score,
  rows,
  headline,
  confidence,
}: {
  score: number;
  rows: SignalRow[];
  headline: VerdictHeadline;
  confidence: VerdictConfidence;
}) {
  const { t } = useTranslation("results");
  const weighted = rows.filter((row) => row.weight != null);
  const clear = weighted.filter((row) => row.value >= CLONE_THRESHOLD);
  const below = weighted.filter((row) => row.value < CLONE_THRESHOLD);
  const reading = score.toFixed(1);
  const confidenceLine = t("results.verdict.confidenceLine", {
    level: t(`results.confidence.${confidence.level}`),
    agree: confidence.corroborating,
    total: confidence.deterministicTotal,
  });

  return (
    <div className="flex flex-col gap-10 pb-8 pt-9 xl:flex-row xl:gap-14">
      {/* Combined similarity */}
      <div className="flex min-w-0 flex-col xl:w-[56%] xl:shrink-0">
        <span className="label text-txt-muted">{t("results.verdict.combined")}</span>
        <div
          className="flex items-end gap-3.5 pt-[18px]"
          role="img"
          aria-label={t("results.ring.aria", { score: reading, band: headline.title })}
        >
          <span className="t-display text-[clamp(112px,14vw,208px)] text-txt-primary" dir="ltr">
            {reading}
          </span>
          <span className="mono-value pb-4 text-txt-muted" dir="ltr">
            {t("results.verdict.outOf")}
          </span>
        </div>
        <div className="pt-[22px]">
          <Scale
            value={score}
            threshold={CLONE_THRESHOLD}
            thresholdLabel={t("results.verdict.thresholdLabel", { value: CLONE_THRESHOLD })}
            className="h-9 [&>.label-sm]:top-0 [&>.scale-needle]:h-9 [&>.scale-threshold]:top-3 [&>.scale-threshold]:h-6 [&>.scale-ticks]:top-6 [&>.scale-ticks]:h-3"
          />
          <ScaleNumerals className="pt-2" />
        </div>
      </div>

      {/* Verdict */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 pt-0.5">
        <span className="label text-txt-muted">{t("results.verdict.label")}</span>
        <h1 className="t-verdict text-txt-primary">{headline.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Tag tone={headline.band}>{headline.tag}</Tag>
          <span className="body-lg text-txt-secondary" title={t("results.confidence.tooltip", { corroborating: confidence.corroborating, total: confidence.deterministicTotal })}>
            {confidenceLine}
          </span>
        </div>

        {/* Signals */}
        <div className="w-full pt-3" role="table" aria-label={t("results.verdict.signalsTable")}>
          <div role="row" className="flex h-[26px] items-center gap-3">
            <span role="columnheader" className="label w-[110px] shrink-0 text-txt-muted">{t("results.verdict.signal")}</span>
            <span role="columnheader" className="label w-[60px] shrink-0 text-txt-muted">{t("results.verdict.weight")}</span>
            <span role="columnheader" className="min-w-0 flex-1" aria-label={t("results.verdict.scale")} />
            <span role="columnheader" className="label w-[44px] shrink-0 text-end text-txt-muted">{t("results.verdict.value")}</span>
          </div>
          {rows.map((row) => (
            <div key={row.name} role="row" className="rule-t flex h-8 items-center gap-3">
              <span role="cell" className="w-[110px] shrink-0 truncate text-[14px] leading-[1.4] text-txt-primary" title={row.name}>
                {row.label}
              </span>
              <span role="cell" className="mono-meta w-[60px] shrink-0 text-txt-muted" dir="ltr">
                {row.weight != null ? `×${row.weight.toFixed(2)}` : "—"}
              </span>
              <span role="cell" className="min-w-0 flex-1">
                <Scale value={row.value} quiet={row.value < CLONE_THRESHOLD} className="w-full" />
              </span>
              <span role="cell" className={cn("mono-value w-[44px] shrink-0 text-end", row.weight != null ? "text-txt-primary" : "text-txt-secondary")} dir="ltr">
                {formatFraction(row.value)}
              </span>
            </div>
          ))}
        </div>

        <p className="pt-1 text-[12.5px] leading-normal text-txt-muted">
          {t("results.verdict.formulaNote")}{" "}
          {weighted.length > 0 && t("results.verdict.clearNote", { clear: clear.length, total: weighted.length, threshold: CLONE_THRESHOLD })}
          {below.length > 0 && ` ${t("results.verdict.belowNote", { names: below.map((row) => row.label).join(", ") })}`}
        </p>
      </div>
    </div>
  );
}
