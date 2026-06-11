import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  User,
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
} from "@/types/enterprise";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<CaseStatus, string> = {
  open: "bg-accent/15 text-accent border-accent/30",
  in_review: "bg-warning/15 text-warning border-warning/30",
  confirmed_clone: "bg-destructive/15 text-destructive border-destructive/30",
  false_positive: "bg-muted text-muted-foreground border-border/60",
  dismissed: "bg-muted text-muted-foreground border-border/60",
  resolved: "bg-success/15 text-success border-success/30",
};

const SEVERITY_BADGE: Record<CaseSeverity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-warning/15 text-warning border-warning/30",
  medium: "bg-warning/12 text-warning border-warning/25",
  low: "bg-accent/15 text-accent border-accent/30",
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
        className="mx-auto flex max-w-4xl items-center justify-center gap-2 py-24 text-muted-foreground"
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
        className="mx-auto flex max-w-4xl flex-col items-center gap-3 py-24 text-destructive"
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

  // Ring geometry
  const ringSize = 120;
  const ringRadius = 52;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, confidence)) / 100);
  const ringColor =
    confidence >= 80 ? "hsl(var(--destructive))"
      : confidence >= 60 ? "hsl(14 85% 38%)"
      : confidence >= 40 ? "hsl(var(--warning))"
      : "hsl(var(--primary))";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
          {t("enterprise.caseDetail.back")}
        </button>
      </div>

      {/* Hero score card */}
      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="flex flex-wrap items-center gap-6 p-6">
          {/* Score ring */}
          <svg
            width={ringSize}
            height={ringSize}
            viewBox={`0 0 ${ringSize} ${ringSize}`}
            className="shrink-0"
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
                fontSize: 28,
                fontWeight: 700,
                fill: "hsl(var(--foreground))",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {confidence}
            </text>
            <text
              x={ringSize / 2}
              y={ringSize / 2 + 22}
              textAnchor="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fill: "hsl(var(--muted-foreground))",
              }}
            >
              % match
            </text>
          </svg>

          <div className="min-w-0 flex-1">
            {/* Badge row */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "hsl(var(--secondary))",
                  color: "hsl(var(--secondary-foreground))",
                  borderColor: "hsl(var(--border))",
                }}
              >
                #{caseData.id}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                  SEVERITY_BADGE[caseData.severity],
                )}
              >
                <Shield className="mr-1 h-3 w-3" />
                {t(`enterprise.severity.${caseData.severity}`)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_BADGE[caseData.status],
                )}
              >
                {t(`enterprise.status.${caseData.status}`)}
              </span>
            </div>

            <h1 className="h-3 text-foreground">
              {t("enterprise.caseDetail.caseId")} #{caseData.id}
            </h1>
            <p className="mt-1 t-body">
              {t("enterprise.caseDetail.cloneType")}:{" "}
              <span className="font-medium text-foreground">{caseData.cloneType}</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              className="gap-1.5 text-white"
              style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              onClick={() =>
                window.open(getCasePdfUrl(caseData.id), "_blank", "noopener,noreferrer")
              }
            >
              <Download className="h-3.5 w-3.5" />
              {t("enterprise.caseDetail.downloadPdf")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {t("enterprise.caseDetail.updateCase")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              {t("enterprise.caseDetail.submitFeedback")}
            </Button>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-2 gap-3 px-6 pb-6 md:grid-cols-4">
          {[
            { label: t("enterprise.caseDetail.similarity"), value: match.similarityScore },
            { label: t("enterprise.caseDetail.structural"), value: match.structuralScore },
            { label: t("enterprise.caseDetail.semantic"), value: match.semanticScore },
            { label: t("enterprise.caseDetail.token"), value: match.tokenScore },
          ].map(({ label, value }) => {
            const pct = Math.round(value);
            return (
              <div
                key={label}
                className="rounded-xl p-4"
                style={{
                  background: "hsl(var(--surface-2))",
                  border: "1px solid hsl(var(--border) / 0.5)",
                }}
              >
                <div className="t-label">{label}</div>
                <div
                  className="mt-1 text-xl font-semibold tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "-0.01em",
                    color: pct >= 80 ? "hsl(var(--destructive))" : pct >= 60 ? "hsl(14 85% 38%)" : "hsl(var(--foreground))",
                  }}
                >
                  {pct}%
                </div>
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full"
                  style={{ background: "hsl(var(--muted))" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "var(--gradient-brand)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Match / Artifacts section */}
      <section
        className="space-y-4 rounded-2xl border border-border bg-card p-6"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="t-label text-foreground">{t("enterprise.caseDetail.matchSection")}</h2>
        </div>

        {/* Artifacts */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: t("enterprise.caseDetail.artifactA"), artifact: match.artifactA },
            { label: t("enterprise.caseDetail.artifactB"), artifact: match.artifactB },
          ].map(({ label, artifact }) => (
            <div
              key={label}
              className="space-y-1.5 rounded-xl p-4"
              style={{
                background: "hsl(var(--surface-2))",
                border: "1px solid hsl(var(--border) / 0.5)",
              }}
            >
              <div className="flex items-center gap-1.5 t-label">
                <User className="h-3 w-3 text-primary" />
                {label}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("enterprise.caseDetail.path")}:</span>{" "}
                <span className="font-mono text-foreground">{artifact?.logicalPath ?? "\u2014"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("enterprise.caseDetail.lines")}:</span>{" "}
                <span className="font-mono tabular-nums">
                  {artifact?.startLine}
                  {"–"}
                  {artifact?.endLine}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("enterprise.caseDetail.language")}:</span>{" "}
                {artifact?.language ?? "\u2014"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence */}
      <section
        className="space-y-3 rounded-2xl border border-border bg-card p-6"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h2 className="t-label text-foreground">{t("enterprise.caseDetail.evidenceSection")}</h2>
        </div>
        {caseData.evidence.length === 0 ? (
          <p className="t-sm">{t("enterprise.caseDetail.noEvidence")}</p>
        ) : (
          <div className="space-y-2">
            {caseData.evidence.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-lg p-3"
                style={{
                  background: "hsl(var(--surface-2))",
                  border: "1px solid hsl(var(--border) / 0.5)",
                }}
              >
                <span
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "hsl(var(--primary) / 0.12)",
                    color: "hsl(var(--primary))",
                    borderColor: "hsl(var(--primary) / 0.25)",
                  }}
                >
                  {ev.evidenceType}
                </span>
                <span className="text-sm font-medium text-foreground">{ev.title}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
              <Button
                onClick={handleUpdate}
                disabled={updating}
                className="text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
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
              <Button
                onClick={handleFeedback}
                disabled={submittingFeedback}
                className="text-white"
                style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
              >
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
