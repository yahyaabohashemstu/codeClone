import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Masthead, RegMark, Serial } from "@/components/dossier/Dossier";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

type InputMethod = "paste" | "file" | "zip" | "excel";

type SourceState = {
  method: InputMethod;
  code: string;
  file: File | null;
  zip: File | null;
  excelFile: File | null;
  excelRow: string;
};

const SUPPORTED_SOURCE_FILE_ACCEPT =
  ".py,.c,.java,.js,.jsx,.ts,.tsx,.rb,.go,.php,.kt,.r,.rs,.scala,.ex,.exs,.hs,.pl";
const TABULAR_FILE_ACCEPT = ".xlsx,.xls,.csv";
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024;
const FALLBACK_LANGUAGE_OPTIONS = [
  "python",
  "c",
  "java",
  "javascript",
  "ruby",
  "go",
  "typescript",
  "php",
  "kotlin",
  "r",
  "rust",
  "scala",
  "elixir",
  "haskell",
  "perl",
];

function createEmptySource(): SourceState {
  return {
    method: "paste",
    code: "",
    file: null,
    zip: null,
    excelFile: null,
    excelRow: "",
  };
}

function getSelectedFile(source: SourceState) {
  switch (source.method) {
    case "file":
      return source.file;
    case "zip":
      return source.zip;
    case "excel":
      return source.excelFile;
    default:
      return null;
  }
}

function sourceReady(source: SourceState) {
  return Boolean(source.code.trim() || getSelectedFile(source));
}

const METHOD_ICONS: Record<InputMethod, typeof Code2> = {
  paste: Code2,
  file: FileCode,
  zip: FileArchive,
  excel: FileSpreadsheet,
};

const INPUT_METHOD_IDS: InputMethod[] = ["paste", "file", "zip", "excel"];

function ExhibitPanel({
  label,
  source,
  onChange,
}: {
  label: "A" | "B";
  source: SourceState;
  onChange: (next: SourceState) => void;
}) {
  const { t } = useTranslation("analysis");
  const { isRTL } = useLanguage();

  const inputMethods = INPUT_METHOD_IDS.map((id) => ({
    id,
    label: t(`analysis.methods.${id}`),
    icon: METHOD_ICONS[id],
  }));

  const selectedFile = getSelectedFile(source);
  const isReady = sourceReady(source);

  const setMethod = (method: InputMethod) => onChange({ ...source, method });

  const setFile = (key: "file" | "zip" | "excelFile", nextFile: File | null) => {
    if (nextFile) {
      const maxBytes =
        key === "zip"
          ? MAX_ZIP_FILE_BYTES
          : key === "excelFile"
            ? MAX_EXCEL_FILE_BYTES
            : MAX_SOURCE_FILE_BYTES;
      if (nextFile.size > maxBytes) {
        const limitMb = Math.round(maxBytes / (1024 * 1024));
        toast.error(
          t("upload.fileTooLarge", {
            ns: "common",
            limitMb,
            defaultValue: `File too large. Maximum size is ${limitMb} MB.`,
          }),
        );
        return;
      }
    }
    onChange({
      ...source,
      file: key === "file" ? nextFile : source.file,
      zip: key === "zip" ? nextFile : source.zip,
      excelFile: key === "excelFile" ? nextFile : source.excelFile,
    });
  };

  const plateTone = label === "A" ? "plate-a" : "plate-b";
  const plateTextClass = label === "A" ? "text-plate-a-deep" : "text-plate-b-deep";
  const plateTabClass = label === "A" ? "bg-plate-a/10" : "bg-plate-b/10";

  return (
    <section className="overflow-hidden border border-border bg-card">
      {/* Plate header — identity marker + label + status */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Serial tone={isReady ? plateTone : "muted"}>{label}</Serial>
        <h2 className={cn("t-label flex-1", isReady ? plateTextClass : "text-foreground")}>
          {t("analysis.sourceTitle", { label })}
        </h2>
        {isReady ? (
          <span className="badge-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("analysis.ready")}
          </span>
        ) : (
          <span className="press-slug">{t("analysis.empty", { defaultValue: "empty" })}</span>
        )}
      </div>

      {/* Segmented method control — an instrument switch, not four cards */}
      <div className="flex border-b border-border">
        {inputMethods.map((method) => {
          const Icon = method.icon;
          const active = source.method === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setMethod(method.id)}
              className={cn(
                "press-slug flex-1 border-e border-border py-2 text-center transition-colors last:border-e-0",
                active ? cn(plateTabClass, "font-bold text-foreground") : "hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="mx-auto mb-1 h-3.5 w-3.5" />
              {method.label}
            </button>
          );
        })}
      </div>

      {/* Input area */}
      <div className="space-y-3 p-4">
        {source.method === "paste" && (
          <div className="relative">
            <Textarea
              value={source.code}
              onChange={(event) => onChange({ ...source, code: event.target.value })}
              placeholder={t("analysis.pastePlaceholder", { label })}
              className="code-surface min-h-[280px] resize-y p-4 text-xs leading-relaxed placeholder:text-muted-foreground/40"
            />
            {source.code && (
              <div
                className={cn(
                  "absolute bottom-2 font-mono text-[10px] text-muted-foreground",
                  isRTL ? "left-3" : "right-3",
                )}
              >
                {source.code.split("\n").length} {t("analysis.lines")}
              </div>
            )}
          </div>
        )}

        {source.method !== "paste" && (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-md border border-dashed border-border p-8 transition-colors hover:border-primary/60 hover:bg-primary/5">
            <input
              type="file"
              className="hidden"
              accept={
                source.method === "file"
                  ? SUPPORTED_SOURCE_FILE_ACCEPT
                  : source.method === "zip"
                    ? ".zip"
                    : TABULAR_FILE_ACCEPT
              }
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                const key =
                  source.method === "file"
                    ? "file"
                    : source.method === "zip"
                      ? "zip"
                      : "excelFile";
                setFile(key, nextFile);
              }}
            />
            <div className="text-muted-foreground">
              {source.method === "file" && <FileCode className="h-7 w-7" />}
              {source.method === "zip" && <FileArchive className="h-7 w-7" />}
              {source.method === "excel" && <FileSpreadsheet className="h-7 w-7" />}
            </div>
            {selectedFile ? (
              <div className="text-center">
                <p className="max-w-[260px] truncate font-mono text-sm font-semibold text-foreground">
                  {selectedFile.name}
                </p>
                <p className="mt-0.5 text-xs text-success">{t("analysis.ready")}</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">{t("analysis.clickOrDrop")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {source.method === "file"
                    ? t("analysis.codeFiles")
                    : source.method === "zip"
                      ? t("analysis.zipArchive")
                      : t("analysis.spreadsheet")}
                </p>
              </div>
            )}
          </label>
        )}

        {source.method === "excel" && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{t("analysis.excelRow")}</span>
            <input
              type="number"
              min={1}
              value={source.excelRow}
              onChange={(event) => onChange({ ...source, excelRow: event.target.value })}
              placeholder="1"
              className={cn(
                "input-focus h-8 w-20 rounded-sm border border-border bg-card px-2 font-mono text-foreground",
                isRTL ? "mr-auto text-right" : "ml-auto",
              )}
            />
          </div>
        )}
      </div>
    </section>
  );
}

const CAPABILITY_KEYS = [
  "capabilities.tokenAnalysis",
  "capabilities.astComparison",
  "capabilities.textSimilarity",
  "capabilities.aiAnalysis",
  "capabilities.codeMetrics",
  "capabilities.cloneDetection",
  "capabilities.codeSmell",
] as const;

const Analysis = () => {
  const navigate = useNavigate();
  const { supportedLanguages } = useAuth();
  const { analyze, clearCurrentResult, isAnalyzing, analysisProgress } = useAnalysis();
  const { localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const { t } = useTranslation("analysis");
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [errorMessage, setErrorMessage] = useState("");
  const [sourceA, setSourceA] = useState<SourceState>(() => createEmptySource());
  const [sourceB, setSourceB] = useState<SourceState>(() => createEmptySource());

  const languageOptions = useMemo(() => {
    return supportedLanguages.length ? supportedLanguages : FALLBACK_LANGUAGE_OPTIONS;
  }, [supportedLanguages]);

  const readyCount = (sourceReady(sourceA) ? 1 : 0) + (sourceReady(sourceB) ? 1 : 0);
  const bothReady = readyCount === 2;

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("language", selectedLanguage);
    formData.append("code1", sourceA.code);
    formData.append("code2", sourceB.code);

    if (sourceA.method === "file" && sourceA.file) formData.append("file1", sourceA.file);
    if (sourceA.method === "zip" && sourceA.zip) formData.append("zip1", sourceA.zip);
    if (sourceA.method === "excel" && sourceA.excelFile) {
      formData.append("excel_file1", sourceA.excelFile);
      formData.append("excel_row1", sourceA.excelRow || "1");
    }

    if (sourceB.method === "file" && sourceB.file) formData.append("file2", sourceB.file);
    if (sourceB.method === "zip" && sourceB.zip) formData.append("zip2", sourceB.zip);
    if (sourceB.method === "excel" && sourceB.excelFile) {
      formData.append("excel_file2", sourceB.excelFile);
      formData.append("excel_row2", sourceB.excelRow || "1");
    }

    return formData;
  };

  const clearAll = () => {
    setSourceA(createEmptySource());
    setSourceB(createEmptySource());
    setErrorMessage("");
    clearCurrentResult();
  };

  const handleAnalyze = async () => {
    setErrorMessage("");
    try {
      const result = await analyze(buildFormData());
      if (!result.has_results) {
        setErrorMessage(
          result.error_message
            ? localizeRuntimeMessage(result.error_message)
            : t("analysis.analysisCouldNotBeCompleted"),
        );
        return;
      }
      const nextUrl = result.saved_analysis_id
        ? `/results?analysisId=${result.saved_analysis_id}`
        : "/results";
      navigate(nextUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? localizeRuntimeMessage(error.message) : t("analysis.analysisFailed"),
      );
    }
  };

  const progressPercent =
    analysisProgress?.progress !== null && analysisProgress?.progress !== undefined
      ? Math.round(analysisProgress.progress)
      : null;

  return (
    <div className="space-y-6">
      <Masthead
        kicker={t("analysis.eyebrow", { defaultValue: "Pairwise analysis" })}
        title={t("analysis.title")}
        description={t("analysis.subtitle")}
      />

      {errorMessage && (
        <div
          className="flex items-start gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* The imposition desk: plates on the table, the job ticket clipped beside them */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* ── The two plates, joined at the registration seam ── */}
        <div>
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
            <span className="t-label text-muted-foreground">{t("home.pairwise", { ns: "common", defaultValue: "Pairwise" })}</span>
            <span className="press-slug">A ⊕ B</span>
          </div>
          <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
            <ExhibitPanel label="A" source={sourceA} onChange={setSourceA} />
            {/* The seam — a dotted registration column between the plates */}
            <div className="relative hidden items-center justify-center px-1 lg:flex" aria-hidden>
              <span className="absolute inset-y-2 start-1/2 w-px border-s border-dashed border-border" />
              <RegMark
                className={cn(
                  "relative z-[1] h-7 w-7 bg-card py-0.5 transition-colors",
                  bothReady ? "text-primary" : "text-muted-foreground/60",
                )}
              />
            </div>
            <div className="flex items-center justify-center lg:hidden" aria-hidden>
              <RegMark className={cn("h-6 w-6 transition-colors", bothReady ? "text-primary" : "text-muted-foreground/60")} />
            </div>
            <ExhibitPanel label="B" source={sourceB} onChange={setSourceB} />
          </div>
        </div>

        {/* ── The job ticket — the spec that travels with this run ── */}
        <aside className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="t-label flex items-center gap-2 text-foreground">
              <span className="reg-dot h-3 w-3 text-primary" aria-hidden />
              {t("analysis.jobTicket", { defaultValue: "Job ticket" })}
            </span>
            {bothReady ? (
              <span className="badge-success">{t("analysis.ready")}</span>
            ) : (
              <span className="badge-warning">{readyCount}/2</span>
            )}
          </div>

          <div className="px-4">
            <div className="grid grid-cols-1 gap-y-1 border-b border-border py-3.5">
              <span className="t-label">{t("analysis.language")}</span>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="mt-1 h-9 w-full border-border bg-card font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option} value={option} className="font-mono text-sm">
                      {getProgrammingLanguageLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plate readiness — the ticket's checkboxes */}
            <div className="border-b border-border py-3.5">
              <span className="t-label">{t("home.pairwise", { ns: "common", defaultValue: "Pairwise" })}</span>
              <div className="mt-2 space-y-1.5">
                {([["A", sourceReady(sourceA)], ["B", sourceReady(sourceB)]] as const).map(([plate, ready]) => (
                  <div key={plate} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-2.5",
                        plate === "A" ? (ready ? "bg-plate-a" : "border border-plate-a/50") : ready ? "bg-plate-b" : "border border-plate-b/50",
                      )}
                    />
                    <span className="press-slug text-foreground">{t("analysis.sourceTitle", { label: plate })}</span>
                    <span className="press-slug ms-auto">
                      {ready ? t("analysis.ready") : t("analysis.empty", { defaultValue: "empty" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* What this run prints — the engine checklist, always on the ticket */}
            <div className="py-3.5">
              <span className="t-label">{t("analysis.capabilities.toggle")}</span>
              <dl className="mt-2">
                {CAPABILITY_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2 border-b border-border/50 py-1.5 text-xs last:border-b-0">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                    <dt className="text-muted-foreground">{t(`analysis.${key}`)}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </aside>
      </div>

      {/* Run footer — the press control: status slug + actions */}
      <div className="sticky bottom-0 flex flex-col gap-3 border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {isAnalyzing && analysisProgress ? (
            <div className="flex items-center gap-3">
              <span className="press-slug text-foreground">
                {localizeRuntimeMessage(analysisProgress.stage)}
                {progressPercent !== null && <span className="tabular-nums"> · {progressPercent}%</span>}
              </span>
              <div className="h-1.5 w-40 overflow-hidden border border-border bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-500"
                  style={{ width: `${progressPercent ?? 20}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="press-slug">{t("analysis.autoSave")}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="h-10 text-sm" onClick={clearAll} disabled={isAnalyzing}>
            {t("analysis.clearAll")}
          </Button>
          <Button
            size="sm"
            className="h-10 gap-2 px-6 text-sm"
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("analysis.analyzing")}
              </span>
            ) : (
              <>
                {t("analysis.submit")}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
