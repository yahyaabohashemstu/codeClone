import { useEffect, useState, type ComponentProps } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Masthead,
  Panel,
  Field,
  FieldSheet,
  Figure,
  Serial,
  Reading,
  Meter,
  Verdict,
  StatusTag,
  Tag,
  scoreBand,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
  SectionRule,
} from "@/components/dossier/Dossier";
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

// Semantic tone maps — colour encodes disposition, never decoration.
type StampTone = ComponentProps<typeof StatusTag>["tone"];

const STATUS_TONE: Record<CaseStatus, StampTone> = {
  open: "primary",
  in_review: "warning",
  confirmed_clone: "danger",
  false_positive: "muted",
  dismissed: "muted",
  resolved: "success",
};

const SEVERITY_TONE: Record<CaseSeverity, StampTone> = {
  critical: "danger",
  high: "warning",
  medium: "warning",
  low: "muted",
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

// The metric value tint follows the calibrated band (green <50 · amber 50–79 · red ≥80),
// matching ScoreMeter — amber renders as ink for AA on warm paper.
function bandText(v: number): string {
  const band = scoreBand(v);
  return band === "success" ? "text-success" : band === "warning" ? "text-foreground" : "text-destructive";
}

// One forensic compare cell: a mono reading, or a muted dash when the exhibit lacks it.
function CompareValue({
  value,
  ltr,
  breakAll,
  hash,
  emphasise,
}: {
  value?: string | null;
  ltr?: boolean;
  breakAll?: boolean;
  hash?: boolean;
  emphasise?: boolean;
}) {
  if (value == null || value === "") {
    return <span className="font-mono text-sm text-muted-foreground/50">{EM_DASH}</span>;
  }
  return (
    <span
      dir={ltr ? "ltr" : undefined}
      className={cn(
        "font-mono",
        hash ? "block truncate text-xs text-muted-foreground" : "text-sm text-foreground",
        breakAll && !hash && "break-all",
        emphasise && !hash && "font-medium",
      )}
    >
      {value}
    </span>
  );
}

// A↔B compare row: margin label + two values; a `≠` gutter mark flags divergence.
function CompareRow({
  label,
  a,
  b,
  ltr,
  breakAll,
  hash,
}: {
  label: React.ReactNode;
  a?: string | null;
  b?: string | null;
  ltr?: boolean;
  breakAll?: boolean;
  hash?: boolean;
}) {
  const differ = (a ?? "") !== (b ?? "");
  return (
    <Field
      label={
        <span className="flex items-center gap-1.5">
          <span
            className={cn("font-mono text-xs leading-none", differ ? "text-primary" : "text-transparent")}
            aria-hidden
          >
            ≠
          </span>
          <span>{label}</span>
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        <CompareValue value={a} ltr={ltr} breakAll={breakAll} hash={hash} emphasise={differ} />
        <CompareValue value={b} ltr={ltr} breakAll={breakAll} hash={hash} emphasise={differ} />
      </div>
    </Field>
  );
}

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

  // Score-dial stroke — token-driven, on the calibrated band so it agrees with the
  // Verdict stamp beneath it (green <50 · amber 50–79 · red ≥80). No gradient.
  const ringColor =
    confidence >= 80 ? "hsl(var(--destructive))"
      : confidence >= 50 ? "hsl(var(--warning))"
        : "hsl(var(--success))";

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

  const aA = match.artifactA;
  const aB = match.artifactB;
  const compareRows = [
    { key: "path", label: t("enterprise.caseDetail.path"), a: aA?.logicalPath, b: aB?.logicalPath, ltr: true, breakAll: true, always: true },
    { key: "symbol", label: t("enterprise.caseDetail.symbol", { defaultValue: "Symbol" }), a: aA?.symbolName, b: aB?.symbolName, ltr: true, breakAll: true },
    { key: "lines", label: t("enterprise.caseDetail.lines"), a: aA ? `${aA.startLine}–${aA.endLine}` : undefined, b: aB ? `${aB.startLine}–${aB.endLine}` : undefined, ltr: true, always: true },
    { key: "language", label: t("enterprise.caseDetail.language"), a: aA?.language, b: aB?.language, always: true },
    { key: "tokens", label: t("enterprise.caseDetail.tokens", { defaultValue: "Tokens" }), a: aA?.tokenCount != null ? String(aA.tokenCount) : undefined, b: aB?.tokenCount != null ? String(aB.tokenCount) : undefined, ltr: true },
    { key: "hash", label: t("enterprise.caseDetail.hash", { defaultValue: "Norm. hash" }), a: aA?.normalizedHash, b: aB?.normalizedHash, ltr: true, hash: true },
  ].filter((r) => r.always || r.a || r.b);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
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
        kicker={t("enterprise.caseDetail.caseId", { defaultValue: "Case" })}
        title={
          <span className="tabular-nums">
            {t("enterprise.caseDetail.caseId")} <span className="font-mono">#{caseData.id}</span>
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
              <StatusTag tone={SEVERITY_TONE[caseData.severity]}>
                {t(`enterprise.severity.${caseData.severity}`)}
              </StatusTag>
            ),
          },
          {
            label: t("enterprise.caseDetail.status"),
            value: (
              <StatusTag tone={STATUS_TONE[caseData.status]}>
                {t(`enterprise.status.${caseData.status}`)}
              </StatusTag>
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

      {/* FIG.01 — confidence assessment: dominant ring + verdict + calibrated meter sheet */}
      <Figure
        n={1}
        label={t("enterprise.caseDetail.confidence")}
        actions={<Reading label={t("enterprise.caseDetail.cloneType")} value={caseData.cloneType} />}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Score dial — the dominant instrument, seated in a lightly gridded bezel
              (matching the Results verdict), stamped with the calibrated verdict below */}
          <div className="flex shrink-0 flex-col items-center gap-3 lg:w-44">
            <div className="relative h-40 w-40 self-center">
              <div
                className="paper-grid-fine pointer-events-none absolute inset-0 rounded-full opacity-40"
                aria-hidden="true"
              />
              <svg
                className="relative h-full w-full -rotate-90"
                viewBox="0 0 128 128"
                role="img"
                aria-label={`${t("enterprise.caseDetail.confidence")} ${confidence}%`}
              >
                <circle cx="64" cy="64" r="56" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 56}
                  strokeDashoffset={2 * Math.PI * 56 * (1 - Math.min(100, Math.max(0, confidence)) / 100)}
                  style={{ transition: "stroke-dashoffset 1s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={cn("font-mono text-[2.75rem] font-bold leading-none tabular-nums", bandText(confidence))}
                  style={{ letterSpacing: "-0.04em" }}
                >
                  {confidence}
                </span>
                <span
                  className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground"
                  style={{ letterSpacing: "0.04em" }}
                >
                  {t("enterprise.caseDetail.percentConfidence", { defaultValue: "% conf" })}
                </span>
              </div>
            </div>
            <span className="t-label">{t("enterprise.caseDetail.confidence")}</span>
            <Verdict score={confidence} />
          </div>

          {/* Metric breakdown — margin-label fields with calibrated semantic meters */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="t-label text-muted-foreground/70">
                {t("enterprise.caseDetail.breakdown", { defaultValue: "Breakdown" })}
              </span>
              <Reading label={t("enterprise.caseDetail.scale", { defaultValue: "Scale" })} value="0–100" />
            </div>
            <FieldSheet className="px-5 sm:px-6">
              {metrics.map(({ label, value }) => {
                const pct = Math.round(value);
                return (
                  <Field key={label} label={label} align="center">
                    <div className="flex items-center gap-3">
                      <Meter
                        value={pct}
                        tone="auto"
                        ticks={[50, 80]}
                        className="h-3.5 flex-1"
                        ariaLabel={`${label}: ${pct}%`}
                      />
                      <span className={cn("w-12 shrink-0 text-end font-mono text-sm font-bold tabular-nums", bandText(pct))}>
                        {pct}%
                      </span>
                    </div>
                  </Field>
                );
              })}
            </FieldSheet>
          </div>
        </div>
      </Figure>

      {/* Exhibits — one forensic compare sheet: A↔B side by side, divergence flagged */}
      <section>
        <SectionRule tick>
          <span className="flex items-center gap-2">
            {t("enterprise.caseDetail.exhibits", { defaultValue: "Sources" })}
            <span className="font-mono text-primary">A ⇄ B</span>
          </span>
        </SectionRule>
        <FieldSheet className="px-5 sm:px-6">
          {/* Pinned exhibit heads, aligned over their value columns */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-4 sm:grid-cols-[minmax(7rem,12rem)_1fr]">
            <div className="t-label pt-0.5 text-muted-foreground/70">
              {t("enterprise.caseDetail.artifact", { defaultValue: "Source" })}
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {exhibits.map((ex) => (
                <div key={ex.mark} className="flex items-center gap-2">
                  <Serial tone="primary">{ex.mark}</Serial>
                  <span className="t-label text-foreground">{ex.label}</span>
                </div>
              ))}
            </div>
          </div>
          {compareRows.map((r) => (
            <CompareRow
              key={r.key}
              label={r.label}
              a={r.a}
              b={r.b}
              ltr={r.ltr}
              breakAll={r.breakAll}
              hash={r.hash}
            />
          ))}
        </FieldSheet>
      </section>

      {/* Evidence — a ruled exhibit ledger with a running tally */}
      <section>
        <SectionRule tick>{t("enterprise.caseDetail.evidenceSection")}</SectionRule>
        <Ledger columns="3.5rem 9rem minmax(0,1fr)">
          <LedgerHead
            cells={[
              "#",
              t("enterprise.caseDetail.evidenceType", { defaultValue: "Type" }),
              t("enterprise.caseDetail.evidenceDetail", { defaultValue: "Detail" }),
            ]}
          />
          {caseData.evidence.length === 0 ? (
            <LedgerEmpty>{t("enterprise.caseDetail.noEvidence")}</LedgerEmpty>
          ) : (
            <>
              {caseData.evidence.map((ev, i) => (
                <LedgerRow key={ev.id}>
                  <LedgerCell mono>
                    <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                  </LedgerCell>
                  <LedgerCell>
                    <Tag tone="primary">{ev.evidenceType}</Tag>
                  </LedgerCell>
                  <LedgerCell className="truncate text-sm font-medium text-foreground">{ev.title}</LedgerCell>
                </LedgerRow>
              ))}
              <LedgerFooter
                left={t("enterprise.caseDetail.records", { defaultValue: "Records" })}
                right={String(caseData.evidence.length)}
              />
            </>
          )}
        </Ledger>
      </section>

      {/* Disposition — current ruling as margin-label fields, review controls in the header */}
      <Panel
        label={t("enterprise.caseDetail.matchSection", { defaultValue: "Disposition" })}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("enterprise.caseDetail.updateCase")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              {t("enterprise.caseDetail.submitFeedback")}
            </Button>
          </div>
        }
        bodyClassName="px-5 sm:px-6 py-0"
      >
        <Field label={t("enterprise.caseDetail.statusLabel")} align="center">
          <StatusTag tone={STATUS_TONE[caseData.status]}>{t(`enterprise.status.${caseData.status}`)}</StatusTag>
        </Field>
        <Field label={t("enterprise.caseDetail.severityLabel")} align="center">
          <StatusTag tone={SEVERITY_TONE[caseData.severity]}>{t(`enterprise.severity.${caseData.severity}`)}</StatusTag>
        </Field>
        <Field label={t("enterprise.caseDetail.notesLabel")}>
          <span className="text-sm text-foreground">
            {caseData.resolutionNotes?.trim() ? caseData.resolutionNotes : EM_DASH}
          </span>
        </Field>
      </Panel>

      {/* Update Case Dialog — printed spec form: margin-label fields, not stacked cards */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("enterprise.caseDetail.caseId")} #{caseData.id}
            </span>
            <DialogTitle>{t("enterprise.caseDetail.updateCase")}</DialogTitle>
          </DialogHeader>
          <FieldSheet className="mt-2 px-5 sm:px-6">
            <Field label={<label id="update-status-label" className="cursor-default">{t("enterprise.caseDetail.statusLabel")}</label>} align="center">
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CaseStatus)}>
                <SelectTrigger id="update-status" aria-labelledby="update-status-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={<label id="update-severity-label" className="cursor-default">{t("enterprise.caseDetail.severityLabel")}</label>} align="center">
              <Select value={newSeverity} onValueChange={(v) => setNewSeverity(v as CaseSeverity)}>
                <SelectTrigger id="update-severity" aria-labelledby="update-severity-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.severity.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={<label htmlFor="update-notes" className="cursor-text">{t("enterprise.caseDetail.notesLabel")}</label>}>
              <Textarea
                id="update-notes"
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </Field>
          </FieldSheet>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUpdateOpen(false)}>{t("enterprise.common.cancel")}</Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
              {t("enterprise.common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog — printed spec form */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("enterprise.caseDetail.caseId")} #{caseData.id}
            </span>
            <DialogTitle>{t("enterprise.caseDetail.submitFeedback")}</DialogTitle>
          </DialogHeader>
          <FieldSheet className="mt-2 px-5 sm:px-6">
            <Field label={<label id="feedback-type-label" className="cursor-default">{t("enterprise.caseDetail.feedbackLabel")}</label>} align="center">
              <Select value={feedbackLabel} onValueChange={(v) => setFeedbackLabel(v as FeedbackLabel)}>
                <SelectTrigger id="feedback-type" aria-labelledby="feedback-type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FEEDBACK.map((f) => (
                    <SelectItem key={f} value={f}>{t(`enterprise.feedback.${f}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={<label htmlFor="feedback-notes" className="cursor-text">{t("enterprise.caseDetail.feedbackNotesLabel")}</label>}>
              <Textarea
                id="feedback-notes"
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </Field>
          </FieldSheet>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFeedbackOpen(false)}>{t("enterprise.common.cancel")}</Button>
            <Button onClick={handleFeedback} disabled={submittingFeedback}>
              {submittingFeedback && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
              {t("enterprise.common.submit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
