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
  open: "bg-blue-500/15 text-blue-600",
  in_review: "bg-yellow-500/15 text-yellow-600",
  confirmed_clone: "bg-destructive/15 text-destructive",
  false_positive: "bg-muted text-muted-foreground",
  dismissed: "bg-muted text-muted-foreground",
  resolved: "bg-green-500/15 text-green-600",
};

const SEVERITY_COLOR: Record<CaseSeverity, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-blue-500",
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
      <div className="flex items-center gap-2 justify-center py-24 text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("enterprise.common.loading")}
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-destructive" dir={isRTL ? "rtl" : "ltr"}>
        <AlertCircle className="h-6 w-6" />
        <p>{error ?? t("enterprise.caseDetail.errorMsg")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          {t("enterprise.caseDetail.back")}
        </Button>
      </div>
    );
  }

  const { match } = caseData;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className={cn("h-3.5 w-3.5", isRTL && "rotate-180")} />
          {t("enterprise.caseDetail.back")}
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-xl font-bold text-foreground">
          {t("enterprise.caseDetail.caseId")} #{caseData.id}
        </h1>
      </div>

      {/* Summary bar */}
      <div className="card-premium flex flex-wrap items-center gap-4 p-4">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", STATUS_BADGE[caseData.status])}>
          {t(`enterprise.status.${caseData.status}`)}
        </span>
        <span className={cn("text-sm font-semibold capitalize", SEVERITY_COLOR[caseData.severity])}>
          <Shield className="mr-1 inline h-3.5 w-3.5" />
          {t(`enterprise.severity.${caseData.severity}`)}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("enterprise.caseDetail.cloneType")}: <span className="font-medium text-foreground">{caseData.cloneType}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {t("enterprise.caseDetail.confidence")}: <span className="font-medium text-foreground">{Math.round(caseData.confidenceScore)}%</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.updateCase")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.submitFeedback")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(getCasePdfUrl(caseData.id), "_blank", "noopener,noreferrer")}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {t("enterprise.caseDetail.downloadPdf")}
          </Button>
        </div>
      </div>

      {/* Match Details */}
      <section className="card-premium space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          {t("enterprise.caseDetail.matchSection")}
        </h2>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t("enterprise.caseDetail.similarity"), value: match.similarityScore },
            { label: t("enterprise.caseDetail.structural"), value: match.structuralScore },
            { label: t("enterprise.caseDetail.semantic"), value: match.semanticScore },
            { label: t("enterprise.caseDetail.token"), value: match.tokenScore },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
              <div className="text-2xl font-bold text-primary">{Math.round(value)}%</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {/* Artifacts */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: t("enterprise.caseDetail.artifactA"), artifact: match.artifactA },
            { label: t("enterprise.caseDetail.artifactB"), artifact: match.artifactB },
          ].map(({ label, artifact }) => (
            <div key={label} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs uppercase tracking-wide">
                <User className="h-3 w-3 text-primary" />
                {label}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("enterprise.caseDetail.path")}:</span>{" "}
                <span className="font-mono">{artifact?.logicalPath ?? "\u2014"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("enterprise.caseDetail.lines")}:</span>{" "}
                {artifact?.startLine}\u2013{artifact?.endLine}
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
      <section className="card-premium space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {t("enterprise.caseDetail.evidenceSection")}
        </h2>
        {caseData.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("enterprise.caseDetail.noEvidence")}</p>
        ) : (
          <div className="space-y-2">
            {caseData.evidence.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase">
                    {ev.evidenceType}
                  </span>
                  <span className="font-medium text-foreground">{ev.title}</span>
                </div>
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
