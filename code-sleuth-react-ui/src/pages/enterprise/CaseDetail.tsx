import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { useToast } from "@/hooks/use-toast";
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
  const { language, isRTL } = useLanguage();
  const { toast } = useToast();
  const ar = language === "ar";

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

  const copy = ar
    ? {
        back: "رجوع",
        caseId: "رقم القضية",
        status: "الحالة",
        severity: "الخطورة",
        cloneType: "نوع النسخ",
        confidence: "الثقة",
        updateCase: "تحديث الحالة",
        submitFeedback: "إرسال تغذية راجعة",
        downloadPdf: "تنزيل التقرير PDF",
        statusLabel: "الحالة",
        severityLabel: "الخطورة",
        notesLabel: "ملاحظات القرار (اختياري)",
        cancel: "إلغاء",
        save: "حفظ",
        submit: "إرسال",
        feedbackLabel: "التصنيف",
        feedbackNotesLabel: "ملاحظات (اختياري)",
        matchSection: "تفاصيل التطابق",
        evidenceSection: "الأدلة",
        artifactA: "الأداة الأولى",
        artifactB: "الأداة الثانية",
        path: "المسار",
        lines: "الأسطر",
        language: "اللغة",
        similarity: "التشابه الكلي",
        structural: "التشابه الهيكلي",
        semantic: "التشابه الدلالي",
        token: "التشابه الرمزي",
        noEvidence: "لا توجد أدلة مسجلة.",
        loading: "جاري التحميل...",
        errorMsg: "فشل تحميل القضية",
        statusNames: {
          open: "مفتوحة",
          in_review: "قيد المراجعة",
          confirmed_clone: "نسخ مؤكد",
          false_positive: "إيجابية خاطئة",
          dismissed: "مرفوضة",
          resolved: "محلولة",
        } as Record<CaseStatus, string>,
        severityNames: {
          critical: "حرج",
          high: "عالي",
          medium: "متوسط",
          low: "منخفض",
        } as Record<CaseSeverity, string>,
        feedbackNames: {
          confirmed_clone: "نسخ مؤكد",
          confirmed_plagiarism: "سرقة مؤكدة",
          false_positive: "إيجابية خاطئة",
          benign_similarity: "تشابه بريء",
          needs_more_review: "تحتاج مراجعة إضافية",
        } as Record<FeedbackLabel, string>,
      }
    : {
        back: "Back",
        caseId: "Case ID",
        status: "Status",
        severity: "Severity",
        cloneType: "Clone Type",
        confidence: "Confidence",
        updateCase: "Update Case",
        submitFeedback: "Submit Feedback",
        downloadPdf: "Download PDF Report",
        statusLabel: "Status",
        severityLabel: "Severity",
        notesLabel: "Resolution notes (optional)",
        cancel: "Cancel",
        save: "Save",
        submit: "Submit",
        feedbackLabel: "Label",
        feedbackNotesLabel: "Notes (optional)",
        matchSection: "Match Details",
        evidenceSection: "Evidence",
        artifactA: "Artifact A",
        artifactB: "Artifact B",
        path: "Path",
        lines: "Lines",
        language: "Language",
        similarity: "Overall Similarity",
        structural: "Structural",
        semantic: "Semantic",
        token: "Token",
        noEvidence: "No evidence recorded.",
        loading: "Loading...",
        errorMsg: "Failed to load case",
        statusNames: {
          open: "Open",
          in_review: "In Review",
          confirmed_clone: "Confirmed Clone",
          false_positive: "False Positive",
          dismissed: "Dismissed",
          resolved: "Resolved",
        } as Record<CaseStatus, string>,
        severityNames: {
          critical: "Critical",
          high: "High",
          medium: "Medium",
          low: "Low",
        } as Record<CaseSeverity, string>,
        feedbackNames: {
          confirmed_clone: "Confirmed Clone",
          confirmed_plagiarism: "Confirmed Plagiarism",
          false_positive: "False Positive",
          benign_similarity: "Benign Similarity",
          needs_more_review: "Needs More Review",
        } as Record<FeedbackLabel, string>,
      };

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    getCase(Number(caseId))
      .then((c) => {
        setCaseData(c);
        setNewStatus(c.status);
        setNewSeverity(c.severity);
      })
      .catch((e) => setError(e?.message ?? copy.errorMsg))
      .finally(() => setLoading(false));
  }, [caseId]);

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
      toast({ title: ar ? "تم التحديث" : "Updated", description: ar ? "تم تحديث القضية." : "Case updated successfully." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: ar ? "فشل التحديث" : "Update failed", description: (e as { message?: string })?.message ?? String(e) });
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
      toast({ title: ar ? "تم الإرسال" : "Feedback submitted" });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: ar ? "فشل الإرسال" : "Submission failed", description: (e as { message?: string })?.message ?? String(e) });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center py-24 text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {copy.loading}
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-destructive" dir={isRTL ? "rtl" : "ltr"}>
        <AlertCircle className="h-6 w-6" />
        <p>{error ?? copy.errorMsg}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          {copy.back}
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
          {copy.back}
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-xl font-bold text-foreground">
          {copy.caseId} #{caseData.id}
        </h1>
      </div>

      {/* Summary bar */}
      <div className="card-premium flex flex-wrap items-center gap-4 p-4">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", STATUS_BADGE[caseData.status])}>
          {copy.statusNames[caseData.status]}
        </span>
        <span className={cn("text-sm font-semibold capitalize", SEVERITY_COLOR[caseData.severity])}>
          <Shield className="mr-1 inline h-3.5 w-3.5" />
          {copy.severityNames[caseData.severity]}
        </span>
        <span className="text-sm text-muted-foreground">
          {copy.cloneType}: <span className="font-medium text-foreground">{caseData.cloneType}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {copy.confidence}: <span className="font-medium text-foreground">{Math.round(caseData.confidenceScore * 100)}%</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setUpdateOpen(true)} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.updateCase}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)} className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {copy.submitFeedback}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(getCasePdfUrl(caseData.id), "_blank")}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {copy.downloadPdf}
          </Button>
        </div>
      </div>

      {/* Match Details */}
      <section className="card-premium space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          {copy.matchSection}
        </h2>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: copy.similarity, value: match.similarityScore },
            { label: copy.structural, value: match.structuralScore },
            { label: copy.semantic, value: match.semanticScore },
            { label: copy.token, value: match.tokenScore },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
              <div className="text-2xl font-bold text-primary">{Math.round(value * 100)}%</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {/* Artifacts */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: copy.artifactA, artifact: match.artifactA },
            { label: copy.artifactB, artifact: match.artifactB },
          ].map(({ label, artifact }) => (
            <div key={label} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs uppercase tracking-wide">
                <User className="h-3 w-3 text-primary" />
                {label}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{copy.path}:</span>{" "}
                <span className="font-mono">{artifact?.logicalPath ?? "—"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{copy.lines}:</span>{" "}
                {artifact?.startLine}–{artifact?.endLine}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{copy.language}:</span>{" "}
                {artifact?.language ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence */}
      <section className="card-premium space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {copy.evidenceSection}
        </h2>
        {caseData.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.noEvidence}</p>
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
            <DialogTitle>{copy.updateCase}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{copy.statusLabel}</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CaseStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{copy.statusNames[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{copy.severityLabel}</Label>
              <Select value={newSeverity} onValueChange={(v) => setNewSeverity(v as CaseSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{copy.severityNames[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{copy.notesLabel}</Label>
              <Textarea
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                rows={3}
                placeholder={ar ? "ملاحظات اختيارية..." : "Optional notes..."}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setUpdateOpen(false)}>{copy.cancel}</Button>
              <Button onClick={handleUpdate} disabled={updating}>
                {updating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {copy.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{copy.submitFeedback}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{copy.feedbackLabel}</Label>
              <Select value={feedbackLabel} onValueChange={(v) => setFeedbackLabel(v as FeedbackLabel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FEEDBACK.map((f) => (
                    <SelectItem key={f} value={f}>{copy.feedbackNames[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{copy.feedbackNotesLabel}</Label>
              <Textarea
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                rows={3}
                placeholder={ar ? "ملاحظات اختيارية..." : "Optional notes..."}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setFeedbackOpen(false)}>{copy.cancel}</Button>
              <Button onClick={handleFeedback} disabled={submittingFeedback}>
                {submittingFeedback && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {copy.submit}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
