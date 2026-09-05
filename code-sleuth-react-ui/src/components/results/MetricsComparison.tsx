import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function titleize(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function flattenMetrics(source: Record<string, unknown>, prefix = "") {
  const rows: Record<string, string | number | boolean | null> = {};

  Object.entries(source || {}).forEach(([key, value]) => {
    const rowKey = prefix ? `${prefix} / ${titleize(key)}` : titleize(key);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(rows, flattenMetrics(value as Record<string, unknown>, rowKey));
      return;
    }

    if (Array.isArray(value)) {
      rows[rowKey] = value.length;
      return;
    }

    rows[rowKey] = value as string | number | boolean | null;
  });

  return rows;
}

function formatValue(value: string | number | boolean | null | undefined, t: (key: string) => string) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(3).replace(/\.?0+$/, "");
  }
  if (typeof value === "boolean") {
    return value ? t("results.metrics.boolTrue") : t("results.metrics.boolFalse");
  }
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function formatDelta(delta: number) {
  const rounded = Number.isInteger(delta) ? `${Math.abs(delta)}` : Math.abs(delta).toFixed(3).replace(/\.?0+$/, "");
  return `${delta > 0 ? "+" : "−"}${rounded}`;
}

/**
 * The metrics ledger (design node 17:601): every metric measured on plate A
 * and plate B with the divergence in the Δ column (B minus A). A zero delta
 * means the plates agree on that measurement.
 */
export function MetricsComparison({
  metricsA,
  metricsB,
  id,
  className,
}: {
  metricsA: Record<string, unknown>;
  metricsB: Record<string, unknown>;
  id?: string;
  className?: string;
}) {
  const { t } = useTranslation("results");
  const flatA = flattenMetrics(metricsA);
  const flatB = flattenMetrics(metricsB);
  const metricNames = Array.from(new Set([...Object.keys(flatA), ...Object.keys(flatB)])).sort();

  const agreements = metricNames.filter((name) => {
    const a = flatA[name];
    const b = flatB[name];
    return a !== undefined && b !== undefined && a === b;
  }).length;

  return (
    <section id={id} className={className} aria-labelledby={id ? `${id}-label` : undefined}>
      <div className="flex items-center justify-between gap-4 pb-3">
        <h2 id={id ? `${id}-label` : undefined} className="label text-txt-muted">
          {t("results.metrics.label")}
        </h2>
        <span className="mono-meta text-txt-muted" dir="ltr">
          {t("results.metrics.agree", { agree: agreements, total: metricNames.length })}
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="h-7 border-b border-bench-strong">
              <th className="label text-start font-semibold text-txt-muted">{t("results.metrics.metric")}</th>
              <th className="label w-[120px] text-end font-semibold text-txt-muted">{t("results.metrics.plateA")}</th>
              <th className="label w-[120px] text-end font-semibold text-txt-muted">{t("results.metrics.plateB")}</th>
              <th className="label w-[100px] text-end font-semibold text-txt-muted" title={t("results.metrics.deltaTitle")}>
                {t("results.metrics.delta")}
              </th>
            </tr>
          </thead>
          <tbody>
            {metricNames.map((name) => {
              const a = flatA[name];
              const b = flatB[name];
              const numeric = typeof a === "number" && typeof b === "number";
              const delta = numeric ? (b as number) - (a as number) : null;
              const equal = a !== undefined && b !== undefined && a === b;
              return (
                <tr key={name} className="h-10 border-t border-bench-hair first:border-t-0">
                  <td className="pe-4 text-[14px] leading-[1.4] text-txt-primary">{name}</td>
                  <td className="mono-value text-end text-txt-primary" dir="ltr">
                    {formatValue(a, t)}
                  </td>
                  <td className="mono-value text-end text-txt-primary" dir="ltr">
                    {formatValue(b, t)}
                  </td>
                  <td className={cn("mono-value text-end", delta === 0 || equal ? "text-txt-muted" : "text-txt-secondary")} dir="ltr">
                    {delta !== null ? (delta === 0 ? "0" : formatDelta(delta)) : equal ? "=" : "≠"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
