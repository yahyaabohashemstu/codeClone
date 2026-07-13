import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Masthead, Panel, Field, Serial, SpecList } from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import {
  getCase,
  updateCase,
  submitFeedback,
  getCasePdfUrl,
} from "@/lib/enterpriseApi";
import type {
  EnterpriseCase,
  CaseStatus,
  CaseSeverity,
  FeedbackLabel,
  CodeArtifact,
} from "@/types/enterprise";
import { cn } from "@/lib/utils";

// Squared mono status tags (see .badge-* utilities in index.css).
const STATUS_BADGE: Record<CaseStatus, string> = {
  open: "badge-info",
  in_review: "badge-warning",
  confirmed_clone: "badge-error",
  false_positive: "badge-info",
  dismissed: "badge-info",
  resolved: "badge-success",
};

const SEVERITY_BADGE: Record<CaseSeverity, string> = {
  critical: "badge-error",
  high: "badge-warning",
  medium: "badge-warning",
  low: "badge-info",
};

const ALL_STATUSES: CaseStatus[] = [
  "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

const ALL_SEVERITIES: CaseSeverity[] = ["critical", "high", "medium", "low"];

const ALL_FEEDBACK: FeedbackLabel[] = [
  "confirmed_clone",
  "confirmed_plagiarism",
  "false_positive",
  "benign_similarity",
  "needs_more_review",
];

const EM_DASH = "—";

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { isRTL } = useLanguage();
  const { t } = useTranslation("enterprise");

  const [caseData, setCaseData] = useState<EnterpriseCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update case dialog
  const [updateOpen, setUpdateOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<CaseStatus>("open");
  const [newSeverity, setNewSeverity] = useState<CaseSeverity>("medium");
  const [resNotes, setResNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  // Feedback dialog
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackLabel, setFeedbackLabel] = useState<FeedbackLabel>("confirmed_clone");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    getCase(Number(caseId))
      .then((c) => {
        setCaseData(c);
        setNewStatus(c.status);
        setNewSeverity(c.severity);
      })
      .catch((e) => setError(e?.message ?? t("enterprise.caseDetail.errorMsg")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, t]);

  const handleUpdate = async () => {
    if (!caseData) return;
    setUpdating(true);
    try {
      const updated = await updateCase(caseData.id, {
        status: newStatus,
        severity: newSeverity,
        resolutionNotes: resNotes || undefined,
      });
      setCaseData(updated);
      setUpdateOpen(false);
      toast.success(t("enterprise.caseDetail.updated"), { description: t("enterprise.caseDetail.updatedDesc") });
    } catch (e: unknown) {
      toast.error(t("enterprise.caseDetail.updateFailed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setUpdating(false);
    }
  };

  const handleFeedback = async () => {
    if (!caseData) return;
    setSubmittingFeedback(true);
    try {
      const updated = await submitFeedback(caseData.id, {
        label: feedbackLabel,
        notes: feedbackNotes || undefined,
      });
      setCaseData(updated);
      setFeedbackOpen(false);
      setFeedbackNotes("");
      toast.success(t("enterprise.caseDetail.feedbackSubmitted"));
    } catch (e: unknown) {
      toast.error(t("enterprise.caseDetail.submissionFailed"), { description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div
        className="mx-auto flex max-w-5xl items-center justify-center gap-2 py-24 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("enterprise.common.loading")}
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div
        className="mx-auto flex max-w-5xl flex-col items-center gap-3 py-24 text-destructive"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <AlertCircle className="h-6 w-6" />
        <p>{error ?? t("enterprise.caseDetail.errorMsg")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
          {t("enterprise.caseDetail.back")}
        </Button>
      </div>
    );
  }

  const { match } = caseData;
  const confidence = Math.round(caseData.confidenceScore);

  // Ring geometry — token-driven, no gradient.
  const ringSize = 132;
  const ringRadius = 56;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, confidence)) / 100);
  const ringColor =
    confidence >= 80 ? "hsl(var(--destructive))"
      : confidence >= 50 ? "hsl(var(--warning))"
        : "hsl(var(--primary))";

  const metricColor = (pct: number) =>
    pct >= 80 ? "hsl(var(--destructive))" : pct >= 60 ? "hsl(var(--warning))" : "hsl(var(--foreground))";

  const metrics = [
    { label: t("enterprise.caseDetail.similarity"), value: match.similarityScore },
    { label: t("enterprise.caseDetail.structural"), value: match.structuralScore },
    { label: t("enterprise.caseDetail.semantic"), value: match.semanticScore },
    { label: t("enterprise.caseDetail.token"), value: match.tokenScore },
  ];

  const exhibits: Array<{ mark: string; label: string; artifact: CodeArtifact | undefined }> = [
    { mark: "A", label: t("enterprise.caseDetail.artifactA"), artifact: match.artifactA },
    { mark: "B", label: t("enterprise.caseDetail.artifactB"), artifact: match.artifactB },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Back — mono file-return line */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
        {t("enterprise.caseDetail.back")}
      </button>

      {/* Case masthead — serialised file header with live disposition readings */}
      <Masthead
        kicker={t("enterprise.caseDetail.caseId", { defaultValue: "Case file" })}
        title={
          <span className="font-mono tabular-nums">
            {t("enterprise.caseDetail.caseId")} #{caseData.id}
          </span>
        }
        description={
          <>
            {t("enterprise.caseDetail.cloneType")}:{" "}
            <span className="font-mono font-medium text-foreground">{caseData.cloneType}</span>
          </>
        }
        meta={[
          { label: t("enterprise.caseDetail.similarity"), value: `${Math.round(match.similarityScore)}%` },
          { label: t("enterprise.caseDetail.confidence"), value: `${confidence}%` },
          {
            label: t("enterprise.caseDetail.severity"),
            value: (
              <span className={cn("capitalize", SEVERITY_BADGE[caseData.severity])}>
                {t(`enterprise.severity.${caseData.severity}`)}
              </span>
            ),
          },
          {
            label: t("enterprise.caseDetail.status"),
            value: (
              <span className={STATUS_BADGE[caseData.status]}>
                {t(`enterprise.status.${caseData.status}`)}
              </span>
            ),
          },
        ]}
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() =>
              window.open(getCasePdfUrl(caseData.id), "_blank", "noopener,noreferrer")
            }
          >
            <Download className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.downloadPdf")}
          </Button>
        }
      />

      {/* Case record — the file header as a ruled mono spec sheet */}
      <Panel bare marker="§" label={t("enterprise.caseDetail.caseId", { defaultValue: "Case record" })}>
        <SpecList
          rows={[
            { label: t("enterprise.caseDetail.cloneType"), value: caseData.cloneType },
            { label: t("enterprise.caseDetail.confidence"), value: `${confidence}%` },
            { label: t("enterprise.caseDetail.similarity"), value: `${Math.round(match.similarityScore)}%` },
            {
              label: t("enterprise.caseDetail.status"),
              value: (
                <span className={STATUS_BADGE[caseData.status]}>{t(`enterprise.status.${caseData.status}`)}</span>
              ),
            },
            {
              label: t("enterprise.caseDetail.severity"),
              value: (
                <span className={cn("capitalize", SEVERITY_BADGE[caseData.severity])}>
                  {t(`enterprise.severity.${caseData.severity}`)}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      {/* Match analysis — the confidence ruling: dominant ring + margin-label metric ledger */}
      <Panel bare marker="§" label={t("enterprise.caseDetail.confidence")}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          {/* Score ring — the assertive, dominant element */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              aria-hidden
            >
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={10}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke={ringColor}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              />
              <text
                x={ringSize / 2}
                y={ringSize / 2 + 4}
                textAnchor="middle"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 30,
                  fontWeight: 700,
                  fill: "hsl(var(--foreground))",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {confidence}
              </text>
              <text
                x={ringSize / 2}
                y={ringSize / 2 + 24}
                textAnchor="middle"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              >
                % conf
              </text>
            </svg>
            <span className="t-label">{t("enterprise.caseDetail.confidence")}</span>
          </div>

          {/* Metric breakdown — signature margin-label field rows; ink numerals, colour on the bar */}
          <div className="min-w-0 flex-1">
            {metrics.map(({ label, value }) => {
              const pct = Math.round(value);
              return (
                <Field key={label} label={label} align="center">
                  <div className="flex items-center gap-4">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" dir="ltr">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: metricColor(pct) }}
                      />
                    </div>
                    <span
                      className="w-14 shrink-0 text-end font-mono text-lg font-semibold tabular-nums text-foreground"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {pct}%
                    </span>
                  </div>
                </Field>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Exhibits — the two artifacts as numbered, margin-labelled evidence sheets (ruled, not boxed) */}
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        {exhibits.map(({ mark, label, artifact }) => (
          <Panel
            key={mark}
            bare
            label={
              <span className="flex items-center gap-2">
                <Serial tone="primary">{mark}</Serial>
                {label}
              </span>
            }
          >
            <Field label={t("enterprise.caseDetail.path")}>
              <span className="break-all font-mono text-sm text-foreground" dir="ltr">
                {artifact?.logicalPath ?? EM_DASH}
              </span>
            </Field>
            {artifact?.symbolName && (
              <Field label={t("enterprise.caseDetail.symbol", { defaultValue: "Symbol" })}>
                <span className="break-all font-mono text-sm text-foreground" dir="ltr">
                  {artifact.symbolName}
                </span>
              </Field>
            )}
            <Field label={t("enterprise.caseDetail.lines")}>
              <span className="font-mono text-sm tabular-nums text-foreground" dir="ltr">
                {artifact?.startLine}
                {"–"}
                {artifact?.endLine}
              </span>
            </Field>
            <Field label={t("enterprise.caseDetail.language")}>
              <span className="font-mono text-sm text-foreground">{artifact?.language ?? EM_DASH}</span>
            </Field>
            {artifact?.tokenCount != null && (
              <Field label={t("enterprise.caseDetail.tokens", { defaultValue: "Tokens" })}>
                <span className="font-mono text-sm tabular-nums text-foreground" dir="ltr">
                  {artifact.tokenCount}
                </span>
              </Field>
            )}
            {artifact?.normalizedHash && (
              <Field label={t("enterprise.caseDetail.hash", { defaultValue: "Norm. hash" })}>
                <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">
                  {artifact.normalizedHash}
                </span>
              </Field>
            )}
          </Panel>
        ))}
      </div>

      {/* Evidence — a ruled §-section exhibit ledger with serialised hairline rows */}
      <Panel bare marker="§" label={t("enterprise.caseDetail.evidenceSection")}>
        {caseData.evidence.length === 0 ? (
          <p className="t-sm text-muted-foreground">{t("enterprise.caseDetail.noEvidence")}</p>
        ) : (
          <div className="divide-y divide-border">
            {caseData.evidence.map((ev, i) => (
              <div key={ev.id} className="flex items-center gap-3 py-3">
                <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                <span className="inline-flex items-center rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
                  {ev.evidenceType}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{ev.title}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Disposition — current ruling as margin-label fields (ruled §-section, read-only) */}
      <Panel bare marker="§" label={t("enterprise.caseDetail.matchSection", { defaultValue: "Disposition" })}>
        <Field label={t("enterprise.caseDetail.statusLabel")} align="center">
          <span className={STATUS_BADGE[caseData.status]}>{t(`enterprise.status.${caseData.status}`)}</span>
        </Field>
        <Field label={t("enterprise.caseDetail.severityLabel")} align="center">
          <span className={cn("capitalize", SEVERITY_BADGE[caseData.severity])}>
            {t(`enterprise.severity.${caseData.severity}`)}
          </span>
        </Field>
        <Field label={t("enterprise.caseDetail.notesLabel")}>
          <span className="text-sm text-foreground">
            {caseData.resolutionNotes?.trim() ? caseData.resolutionNotes : EM_DASH}
          </span>
        </Field>
      </Panel>

      {/* Review actions — the one interactive control block, kept as a distinct card */}
      <Panel label={t("enterprise.caseDetail.reviewActions", { defaultValue: "Review actions" })}>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.updateCase")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.submitFeedback")}
          </Button>
        </div>
      </Panel>

      {/* Update Case Dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.caseDetail.updateCase")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("enterprise.caseDetail.statusLabel")}</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CaseStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("enterprise.caseDetail.severityLabel")}</Label>
              <Select value={newSeverity} onValueChange={(v) => setNewSeverity(v as CaseSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.severity.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("enterprise.caseDetail.notesLabel")}</Label>
              <Textarea
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setUpdateOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleUpdate} disabled={updating}>
                {updating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("enterprise.caseDetail.submitFeedback")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("enterprise.caseDetail.feedbackLabel")}</Label>
              <Select value={feedbackLabel} onValueChange={(v) => setFeedbackLabel(v as FeedbackLabel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FEEDBACK.map((f) => (
                    <SelectItem key={f} value={f}>{t(`enterprise.feedback.${f}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("enterprise.caseDetail.feedbackNotesLabel")}</Label>
              <Textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setFeedbackOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleFeedback} disabled={submittingFeedback}>
                {submittingFeedback && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("enterprise.common.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
