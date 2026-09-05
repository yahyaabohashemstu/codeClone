import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Panel, SectionHead, Serial } from "@/components/dossier/Dossier";
import { Tag } from "@/components/bench/Bench";
import type { AnalysisResult } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * Code quality — the linter diagnostics for both plates, parsed into a
 * severity ledger and a priority list. Ported from the previous results page
 * unchanged in logic; re-set on the bench (tags instead of tinted cards).
 */

function formatQualityAnalysis(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value.trim() ? value : fallback;
  }

  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return `Unable to generate quality report: ${(value as { error: string }).error}`;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

type QualitySeverity = "critical" | "warning" | "style" | "info";

type QualityIssue = {
  rawType: string;
  severity: QualitySeverity;
  symbol: string | null;
  message: string;
  line: number | null;
  column: number | null;
};

type QualityReport = {
  text: string;
  issues: QualityIssue[];
  score: number | null;
  ratingLine: string | null;
  generalNotes: string[];
  counts: Record<QualitySeverity, number>;
  dominantSymbols: string[];
  statusTone: "excellent" | "healthy" | "watch" | "critical" | "neutral";
  headline: string;
  summary: string;
};

const severityTone: Record<QualitySeverity, "hot" | "advisory" | "neutral"> = {
  critical: "hot",
  warning: "advisory",
  style: "neutral",
  info: "neutral",
};

/** A ruled ledger row: label + note in the main column, a mono figure in the value column. */
function QualityLedgerRow({
  label,
  value,
  note,
  valueClass,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-3">
      <div className="min-w-0">
        <dt className="label text-txt-muted">{label}</dt>
        {note != null && <p className="mt-1 text-[12.5px] leading-normal text-txt-muted">{note}</p>}
      </div>
      <dd className={cn("mono-value shrink-0 text-end text-txt-primary", valueClass)}>{value}</dd>
    </div>
  );
}

function getQualitySeverity(rawType: string): QualitySeverity {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "fatal" || normalized === "error") {
    return "critical";
  }
  if (normalized === "warning" || normalized === "refactor") {
    return "warning";
  }
  if (normalized === "convention") {
    return "style";
  }
  return "info";
}

function buildQualityHeadline(statusTone: QualityReport["statusTone"], totalFindings: number, sourceName: string, t: TFunction) {
  if (totalFindings === 0) {
    if (statusTone === "healthy" || statusTone === "excellent") {
      return t("results.quality.buildHeadline.cleanExcellent", { source: sourceName });
    }
    return t("results.quality.buildHeadline.cleanNeutral", { source: sourceName });
  }

  if (statusTone === "critical") {
    return t("results.quality.buildHeadline.critical", { source: sourceName });
  }
  if (statusTone === "watch") {
    return t("results.quality.buildHeadline.watch", { source: sourceName });
  }
  if (statusTone === "excellent") {
    return t("results.quality.buildHeadline.excellent", { source: sourceName });
  }
  return t("results.quality.buildHeadline.default", { source: sourceName });
}

function parseQualityReport(rawValue: unknown, sourceName: string, fallback: string, t: TFunction): QualityReport {
  const text = formatQualityAnalysis(rawValue, fallback);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts: Record<QualitySeverity, number> = {
    critical: 0,
    warning: 0,
    style: 0,
    info: 0,
  };
  const issues: QualityIssue[] = [];
  const generalNotes: string[] = [];
  let score: number | null = null;
  let ratingLine: string | null = null;

  for (const line of lines) {
    const scoreMatch = line.match(/Your code has been rated at\s+(-?\d+(?:\.\d+)?)\/10/i);
    if (scoreMatch) {
      score = Number.parseFloat(scoreMatch[1]);
      ratingLine = line;
      continue;
    }

    const issueMatch = line.match(/^([A-Za-z]+)\s+\[([^\]]+)\]:\s+(.*?)(?:\s+\(Line\s+(\d+)(?:,\s+Column\s+(\d+))?\))?$/);
    if (issueMatch) {
      const [, rawType, symbol, message, lineNumber, columnNumber] = issueMatch;
      const severity = getQualitySeverity(rawType);
      counts[severity] += 1;
      issues.push({
        rawType,
        severity,
        symbol: symbol || null,
        message,
        line: lineNumber ? Number.parseInt(lineNumber, 10) : null,
        column: columnNumber ? Number.parseInt(columnNumber, 10) : null,
      });
      continue;
    }

    generalNotes.push(line);
  }

  const totalFindings = issues.length;
  const dominantSymbols = Array.from(
    issues.reduce((map, issue) => {
      if (!issue.symbol) return map;
      map.set(issue.symbol, (map.get(issue.symbol) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([symbol]) => symbol);

  let statusTone: QualityReport["statusTone"] = "neutral";
  if (score !== null) {
    if (score >= 8.5) statusTone = "excellent";
    else if (score >= 7) statusTone = "healthy";
    else if (score >= 5) statusTone = "watch";
    else statusTone = "critical";
  } else if (counts.critical > 0) {
    statusTone = "critical";
  } else if (counts.warning > 0) {
    statusTone = "watch";
  } else if (totalFindings === 0 && generalNotes.length === 0) {
    statusTone = "healthy";
  } else if (totalFindings > 0) {
    statusTone = "healthy";
  }

  const summary =
    totalFindings > 0
      ? t("results.quality.findingsSummary", {
          critical: counts.critical,
          warning: counts.warning,
          style: counts.style,
          info: counts.info,
        })
      : generalNotes[0] || t("results.quality.noStructuredReported");

  return {
    text,
    issues,
    score,
    ratingLine,
    generalNotes,
    counts,
    dominantSymbols,
    statusTone,
    headline: buildQualityHeadline(statusTone, totalFindings, sourceName, t),
    summary,
  };
}

function getQualityToneMeta(statusTone: QualityReport["statusTone"], t: TFunction): { tone: "hot" | "advisory" | "neutral"; label: string } {
  if (statusTone === "excellent") return { tone: "neutral", label: t("results.quality.statusTone.excellent") };
  if (statusTone === "healthy") return { tone: "neutral", label: t("results.quality.statusTone.healthy") };
  if (statusTone === "watch") return { tone: "advisory", label: t("results.quality.statusTone.needsReview") };
  if (statusTone === "critical") return { tone: "hot", label: t("results.quality.statusTone.highRisk") };
  return { tone: "neutral", label: t("results.quality.statusTone.diagnosticView") };
}

function QualitySourceCard({ letter, title, report }: { letter: "A" | "B"; title: string; report: QualityReport }) {
  const { t } = useTranslation("results");
  const totalFindings = report.issues.length;
  const toneMeta = getQualityToneMeta(report.statusTone, t);
  const topIssues = report.issues.slice(0, 8);
  const severityLabels: Record<QualitySeverity, string> = {
    critical: t("results.quality.severityLabels.critical"),
    warning: t("results.quality.severityLabels.warning"),
    style: t("results.quality.severityLabels.style"),
    info: t("results.quality.severityLabels.info"),
  };

  return (
    <Panel
      bodyClassName="p-0"
      label={
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="label-tag text-txt-muted">{letter}</span>
          {title}
        </span>
      }
      actions={<Tag tone={toneMeta.tone}>{toneMeta.label}</Tag>}
    >
      {/* Verdict readout + the score */}
      <div className="flex flex-col gap-4 border-b border-bench-hair px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-[1.4] text-txt-primary">{report.headline}</p>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-normal text-txt-muted">{report.summary}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-3 sm:flex-col sm:items-end sm:gap-1 sm:text-end">
          <span className="label text-txt-muted">{t("results.quality.qualityScore")}</span>
          <span className="t-display text-[2.75rem] text-txt-primary" dir="ltr">
            {report.score !== null ? report.score.toFixed(1) : "—"}
          </span>
          <p className="text-[12.5px] leading-normal text-txt-muted">
            {report.ratingLine ? t("results.quality.derivedFromPylint") : t("results.quality.basedOnTextual")}
          </p>
        </div>
      </div>

      {/* Severity ledger */}
      <dl className="divide-y divide-bench-hair border-b border-bench-hair px-5">
        <QualityLedgerRow label={t("results.quality.findings")} note={t("results.quality.findingsDesc")} value={totalFindings} />
        <QualityLedgerRow
          label={t("results.quality.critical")}
          note={t("results.quality.criticalDesc")}
          value={report.counts.critical}
          valueClass={report.counts.critical > 0 ? "text-signal-bench" : undefined}
        />
        <QualityLedgerRow label={t("results.quality.warnings")} note={t("results.quality.warningsDesc")} value={report.counts.warning + report.counts.style} />
        <QualityLedgerRow
          label={t("results.quality.dominantSignals")}
          note={t("results.quality.dominantSignalsDesc")}
          value={
            <span className="mono-filename text-txt-primary" dir="ltr">
              {report.dominantSymbols.length ? report.dominantSymbols.join(" • ") : t("results.quality.noRepeatedRule")}
            </span>
          }
        />
      </dl>

      <div className="px-5 py-5">
        {topIssues.length > 0 ? (
          <>
            <SectionHead
              title={t("results.quality.priorityFindings")}
              aside={<span className="mono-meta">{`${topIssues.length}/${totalFindings}`}</span>}
              className="mb-4"
            />
            <ol className="divide-y divide-bench-hair">
              {topIssues.map((issue, index) => (
                <li key={`${issue.symbol ?? issue.message}-${index}`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4 first:pt-0">
                  <Serial tone={issue.severity === "critical" ? "primary" : "muted"}>{String(index + 1).padStart(2, "0")}</Serial>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={severityTone[issue.severity]}>{severityLabels[issue.severity]}</Tag>
                      {issue.symbol && (
                        <span className="mono-meta text-txt-secondary" dir="ltr">
                          {issue.symbol}
                        </span>
                      )}
                      {(issue.line !== null || issue.column !== null) && (
                        <span className="mono-meta text-txt-muted" dir="ltr">
                          {issue.line !== null ? t("results.quality.line", { line: issue.line }) : t("results.quality.lineEmpty")}
                          {issue.column !== null ? t("results.quality.column", { column: issue.column }) : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[14px] leading-[1.45] text-txt-primary">{issue.message}</p>
                    <p className="mt-1 text-[12.5px] leading-normal text-txt-muted">
                      {t("results.quality.reportedByLinter")} <span className="text-txt-secondary">{issue.rawType}</span>.
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="border-s-2 border-bench-strong ps-4">
            <p className="text-[14px] font-semibold text-txt-primary">{t("results.quality.noStructuredFindings")}</p>
            <p className="mt-1 text-[12.5px] leading-normal text-txt-muted">{report.generalNotes[0] || t("results.quality.noStructuredFindingsDesc")}</p>
          </div>
        )}

        {(report.generalNotes.length > 0 || report.text) && (
          <details className="mt-4 border border-bench-hair">
            <summary className="label cursor-pointer list-none px-4 py-3 text-txt-secondary hover:text-txt-primary">
              {t("results.quality.rawDiagnosticReport")}
            </summary>
            <div className="border-t border-bench-hair px-4 py-4">
              {report.generalNotes.length > 0 && (
                <div className="mb-3 space-y-2">
                  {report.generalNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="border border-bench-hair px-3 py-2 text-[12.5px] leading-normal text-txt-secondary">
                      {note}
                    </div>
                  ))}
                </div>
              )}
              <pre className="code-surface max-h-[320px] overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed scrollbar-thin" dir="ltr">
                {report.text}
              </pre>
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

export function QualityPanel({ result }: { result: AnalysisResult }) {
  const { t } = useTranslation("results");
  const sourceReports = [
    {
      id: "A" as const,
      title: t("results.quality.sourceAReview"),
      report: parseQualityReport(result.code_smell.code1_analysis, t("results.sourceA"), t("results.quality.sourceAFallback"), t),
    },
    {
      id: "B" as const,
      title: t("results.quality.sourceBReview"),
      report: parseQualityReport(result.code_smell.code2_analysis, t("results.sourceB"), t("results.quality.sourceBFallback"), t),
    },
  ];

  const totalFindings = sourceReports.reduce((sum, source) => sum + source.report.issues.length, 0);
  const averageScore = sourceReports.every((source) => source.report.score !== null)
    ? sourceReports.reduce((sum, source) => sum + (source.report.score ?? 0), 0) / sourceReports.length
    : null;
  const healthierSource = [...sourceReports].sort((left, right) => {
    const leftScore = left.report.score ?? -1;
    const rightScore = right.report.score ?? -1;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.report.issues.length - right.report.issues.length;
  })[0];

  return (
    <div className="space-y-8">
      <div>
        <p className="max-w-3xl text-[14px] leading-[1.5] text-txt-secondary">{t("results.quality.description")}</p>
        <dl className="mt-5 divide-y divide-bench-hair border-y border-bench-hair">
          <QualityLedgerRow label={t("results.quality.totalFindings")} note={t("results.quality.totalFindingsDesc")} value={totalFindings} />
          <QualityLedgerRow
            label={t("results.quality.averageScore")}
            note={t("results.quality.averageScoreDesc")}
            value={averageScore !== null ? averageScore.toFixed(1) : "—"}
            valueClass={averageScore !== null && averageScore < 5 ? "text-signal-bench" : undefined}
          />
          <QualityLedgerRow
            label={t("results.quality.healthierSource")}
            note={
              healthierSource.report.score !== null
                ? t("results.quality.healthierScoreDesc", { score: healthierSource.report.score.toFixed(1) })
                : t("results.quality.healthierIssueDesc")
            }
            value={<span className="text-[14px] font-semibold text-txt-primary">{healthierSource.title}</span>}
          />
        </dl>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {sourceReports.map((source) => (
          <QualitySourceCard key={source.id} letter={source.id} title={source.title} report={source.report} />
        ))}
      </div>
    </div>
  );
}
