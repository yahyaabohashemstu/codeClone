import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Masthead, Panel, Field, ScaleRuler } from "@/components/dossier/Dossier";
import { Reading, Scale, Tag, type TagTone } from "@/components/bench/Bench";
import { IconChevronLeft, IconDownload } from "@/components/bench/icons";
import { PageError } from "@/components/common/PageError";
import { PageLoader } from "@/components/common/PageLoader";
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

/** Dispositions take the three tag tones: a confirmed clone is hot, a case still open is advisory. */
const STATUS_TONE: Record<CaseStatus, TagTone> = {
  open: "advisory",
  in_review: "advisory",
  confirmed_clone: "hot",
  false_positive: "neutral",
  dismissed: "neutral",
  resolved: "neutral",
};

const SEVERITY_TONE: Record<CaseSeverity, TagTone> = {
  critical: "hot",
  high: "hot",
  medium: "advisory",
  low: "neutral",
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
const CLONE_THRESHOLD = 80;

/* Ruled readings: two columns on small screens, four from lg; hairlines between cells and rows. */
const READINGS_ROW =
  "grid grid-cols-2 border-y border-bench-hair lg:grid-cols-4 [&>*]:px-4 lg:[&>*]:px-6 [&>*:first-child]:ps-0 [&>*:nth-child(even)]:border-s [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0 lg:[&>*:not(:first-child)]:border-s";

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

  const backLink = (
    <button type="button" onClick={() => navigate(-1)} className="link inline-flex items-center gap-1 text-[12.5px]">
      <IconChevronLeft className="rtl:-scale-x-100" />
      {t("enterprise.caseDetail.back")}
    </button>
  );

  if (loading) {
    return (
      <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
        <PageLoader message={t("enterprise.common.loading")} />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
        <PageError message={error ?? t("enterprise.caseDetail.errorMsg")} />
        <div className="flex justify-center">{backLink}</div>
      </div>
    );
  }

  const { match } = caseData;
  const confidence = Math.round(caseData.confidenceScore);
  const similarity = Math.round(match.similarityScore);

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

  const statusTag = <Tag tone={STATUS_TONE[caseData.status]}>{t(`enterprise.status.${caseData.status}`)}</Tag>;
  const severityTag = <Tag tone={SEVERITY_TONE[caseData.severity]}>{t(`enterprise.severity.${caseData.severity}`)}</Tag>;

  return (
    <div className="pt-7" dir={isRTL ? "rtl" : "ltr"}>
      <div className="pb-5">{backLink}</div>

      <Masthead
        kicker={t("enterprise.caseDetail.kicker", { defaultValue: "Case file" })}
        title={
          <span dir="ltr">
            {t("enterprise.caseDetail.caseId")} #{caseData.id}
          </span>
        }
        description={
          <>
            {t("enterprise.caseDetail.cloneType")}:{" "}
            <span className="mono-value text-txt-primary" dir="ltr">{caseData.cloneType}</span>
          </>
        }
        actions={
          <Button
            variant="outline"
            onClick={() =>
              window.open(getCasePdfUrl(caseData.id), "_blank", "noopener,noreferrer")
            }
          >
            <IconDownload />
            {t("enterprise.caseDetail.downloadPdf")}
          </Button>
        }
      />

      {/* Readings */}
      <div className={READINGS_ROW}>
        <Reading label={t("enterprise.caseDetail.similarity")} value={similarity} note="/ 100" />
        <Reading label={t("enterprise.caseDetail.confidence")} value={confidence} note={t("history.readings.threshold", { ns: "common", value: CLONE_THRESHOLD })} />
        <Reading label={t("enterprise.caseDetail.severity")} value={t(`enterprise.severity.${caseData.severity}`)} note={severityTag} />
        <Reading label={t("enterprise.caseDetail.status")} value={t(`enterprise.status.${caseData.status}`)} note={statusTag} />
      </div>

      <div className="mt-8 space-y-5">
        {/* Confidence on the instrument */}
        <Panel label={t("enterprise.caseDetail.confidence")}>
          <ScaleRuler
            value={confidence}
            threshold={CLONE_THRESHOLD}
            thresholdLabel={`${CLONE_THRESHOLD}`}
            label={`${t("enterprise.caseDetail.confidence")}: ${confidence}%`}
          />
          <div className="mt-6 border-t border-bench-hair">
            {metrics.map(({ label, value }) => {
              const pct = Math.round(value);
              return (
                <Field key={label} label={label} align="center">
                  <div className="flex items-center gap-4">
                    <Scale value={pct} quiet={pct < 50} className="flex-1" label={`${label}: ${pct}%`} />
                    <span className="mono-value w-12 shrink-0 text-end text-txt-primary" dir="ltr">
                      {pct}
                    </span>
                  </div>
                </Field>
              );
            })}
          </div>
        </Panel>

        {/* Exhibits — the two artifacts, named by letter */}
        <div className="grid gap-5 md:grid-cols-2">
          {exhibits.map(({ mark, label, artifact }) => (
            <Panel
              key={mark}
              bodyClassName="px-5 py-0"
              label={
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="label-tag text-txt-muted">{mark}</span>
                  {label}
                </span>
              }
            >
              <div>
                <Field label={t("enterprise.caseDetail.path")}>
                  <span className="mono-filename block break-all leading-relaxed text-txt-primary" dir="ltr">
                    {artifact?.logicalPath ?? EM_DASH}
                  </span>
                </Field>
                {artifact?.symbolName && (
                  <Field label={t("enterprise.caseDetail.symbol", { defaultValue: "Symbol" })}>
                    <span className="mono-filename block break-all leading-relaxed text-txt-primary" dir="ltr">
                      {artifact.symbolName}
                    </span>
                  </Field>
                )}
                <Field label={t("enterprise.caseDetail.lines")}>
                  <span className="mono-value text-txt-primary" dir="ltr">
                    {artifact?.startLine}
                    {"–"}
                    {artifact?.endLine}
                  </span>
                </Field>
                <Field label={t("enterprise.caseDetail.language")}>
                  <span className="mono-value text-txt-primary" dir="ltr">{artifact?.language ?? EM_DASH}</span>
                </Field>
                {artifact?.tokenCount != null && (
                  <Field label={t("enterprise.caseDetail.tokens", { defaultValue: "Tokens" })}>
                    <span className="mono-value text-txt-primary" dir="ltr">
                      {artifact.tokenCount}
                    </span>
                  </Field>
                )}
                {artifact?.normalizedHash && (
                  <Field label={t("enterprise.caseDetail.hash", { defaultValue: "Norm. hash" })}>
                    <span className="mono-filename block truncate text-txt-muted" dir="ltr">
                      {artifact.normalizedHash}
                    </span>
                  </Field>
                )}
              </div>
            </Panel>
          ))}
        </div>

        {/* Evidence — a ruled, numbered list */}
        <Panel label={t("enterprise.caseDetail.evidenceSection")} bodyClassName="p-0">
          {caseData.evidence.length === 0 ? (
            <p className="p-5 text-center text-[13px] text-txt-muted">{t("enterprise.caseDetail.noEvidence")}</p>
          ) : (
            <ol className="divide-y divide-bench-hair">
              {caseData.evidence.map((ev, i) => (
                <li key={ev.id} className="flex h-[46px] items-center gap-4 px-5">
                  <span className="mono-ordinal w-8 shrink-0 text-txt-muted">{String(i + 1).padStart(2, "0")}</span>
                  <Tag tone="neutral">{ev.evidenceType}</Tag>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-txt-primary" dir="auto">{ev.title}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* Disposition — the current ruling */}
        <Panel label={t("enterprise.caseDetail.matchSection", { defaultValue: "Disposition" })} bodyClassName="px-5 py-0">
          <div>
            <Field label={t("enterprise.caseDetail.statusLabel")} align="center">
              {statusTag}
            </Field>
            <Field label={t("enterprise.caseDetail.severityLabel")} align="center">
              {severityTag}
            </Field>
            <Field label={t("enterprise.caseDetail.notesLabel")}>
              <span className="text-[13px] leading-relaxed text-txt-primary" dir="auto">
                {caseData.resolutionNotes?.trim() ? caseData.resolutionNotes : EM_DASH}
              </span>
            </Field>
          </div>
        </Panel>

        {/* Review actions */}
        <Panel label={t("enterprise.caseDetail.reviewActions", { defaultValue: "Review actions" })}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setUpdateOpen(true)}>
              {t("enterprise.caseDetail.updateCase")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)}>
              {t("enterprise.caseDetail.submitFeedback")}
            </Button>
          </div>
        </Panel>
      </div>

      {/* Update Case Dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="t-h4">{t("enterprise.caseDetail.updateCase")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="label text-txt-muted">{t("enterprise.caseDetail.statusLabel")}</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CaseStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="label text-txt-muted">{t("enterprise.caseDetail.severityLabel")}</Label>
              <Select value={newSeverity} onValueChange={(v) => setNewSeverity(v as CaseSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`enterprise.severity.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="label text-txt-muted">{t("enterprise.caseDetail.notesLabel")}</Label>
              <Textarea
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setUpdateOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleUpdate} disabled={updating}>
                {t("enterprise.common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="border-bench-strong bg-bench-raised text-txt-primary sm:max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="t-h4">{t("enterprise.caseDetail.submitFeedback")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="label text-txt-muted">{t("enterprise.caseDetail.feedbackLabel")}</Label>
              <Select value={feedbackLabel} onValueChange={(v) => setFeedbackLabel(v as FeedbackLabel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FEEDBACK.map((f) => (
                    <SelectItem key={f} value={f}>{t(`enterprise.feedback.${f}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="label text-txt-muted">{t("enterprise.caseDetail.feedbackNotesLabel")}</Label>
              <Textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                rows={3}
                placeholder={t("enterprise.caseDetail.notesPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setFeedbackOpen(false)}>{t("enterprise.common.cancel")}</Button>
              <Button onClick={handleFeedback} disabled={submittingFeedback}>
                {t("enterprise.common.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
