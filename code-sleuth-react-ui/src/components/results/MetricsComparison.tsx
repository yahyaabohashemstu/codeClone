import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";

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
    return "\u2014";
  }
  return String(value);
}

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

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          {t("results.metrics.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("results.metrics.description")}
        </p>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-border/40 bg-muted/20">
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t("results.metrics.metric")}</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-primary">{t("results.metrics.sourceA")}</th>
              <th className="px-5 py-3 text-center text-xs font-medium text-accent">{t("results.metrics.sourceB")}</th>
            </tr>
          </thead>
          <tbody>
            {metricNames.map((name, index) => (
              <tr key={name} className={index % 2 === 0 ? "border-b border-border/30" : "border-b border-border/30 bg-muted/5"}>
                <td className="px-5 py-3 text-xs font-medium text-foreground">{name}</td>
                <td className="px-5 py-3 text-center font-mono text-xs text-primary">{formatValue(flatA[name], t)}</td>
                <td className="px-5 py-3 text-center font-mono text-xs text-accent">{formatValue(flatB[name], t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
