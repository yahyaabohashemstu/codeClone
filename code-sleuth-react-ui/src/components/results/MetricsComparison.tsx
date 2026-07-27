import { useTranslation } from "react-i18next";

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
 * The registration table: every metric measured on plate A and plate B, with
 * a divergence column showing where the two impressions pull apart. A zero
 * delta means the plates agree on that measurement.
 */
export function MetricsComparison({
  metricsA,
  metricsB,
}: {
  metricsA: Record<string, unknown>;
  metricsB: Record<string, unknown>;
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
    <figure className="overflow-hidden border border-border bg-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <span className="t-label text-foreground">{t("results.metrics.title")}</span>
        <span className="press-slug tabular-nums">
          {agreements}/{metricNames.length} =
        </span>
      </figcaption>
      <p className="border-b border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        {t("results.metrics.description")}
      </p>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b-2 border-foreground">
              <th className="press-slug px-5 py-2.5 text-start">{t("results.metrics.metric")}</th>
              <th className="px-5 py-2.5 text-end">
                <span className="press-slug inline-flex items-center gap-1.5 text-plate-a-deep">
                  <span aria-hidden className="h-2 w-2 bg-plate-a" />
                  {t("results.metrics.sourceA")}
                </span>
              </th>
              <th className="px-5 py-2.5 text-end">
                <span className="press-slug inline-flex items-center gap-1.5 text-plate-b-deep">
                  <span aria-hidden className="h-2 w-2 bg-plate-b" />
                  {t("results.metrics.sourceB")}
                </span>
              </th>
              <th className="press-slug px-5 py-2.5 text-end" title={t("results.metrics.deltaTitle", { defaultValue: "Difference (B minus A)" })}>
                Δ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metricNames.map((name) => {
              const a = flatA[name];
              const b = flatB[name];
              const numeric = typeof a === "number" && typeof b === "number";
              const delta = numeric ? (b as number) - (a as number) : null;
              const equal = a !== undefined && b !== undefined && a === b;
              return (
                <tr key={name} className="hover:bg-muted/30">
                  <td className="px-5 py-2.5 text-xs font-medium text-foreground">{name}</td>
                  <td className="px-5 py-2.5 text-end font-mono text-xs tabular-nums text-foreground" dir="ltr">
                    {formatValue(a, t)}
                  </td>
                  <td className="px-5 py-2.5 text-end font-mono text-xs tabular-nums text-foreground" dir="ltr">
                    {formatValue(b, t)}
                  </td>
                  <td className="px-5 py-2.5 text-end font-mono text-xs tabular-nums" dir="ltr">
                    {delta !== null ? (
                      delta === 0 ? (
                        <span className="text-muted-foreground/70">0</span>
                      ) : (
                        <span className="font-semibold text-foreground">{formatDelta(delta)}</span>
                      )
                    ) : equal ? (
                      <span className="text-muted-foreground/70">=</span>
                    ) : (
                      <span className="font-semibold text-foreground">≠</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
