import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Info,
  Loader2,
  Sparkles,
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

const METHOD_ICONS: Record<InputMethod, typeof Code2> = {
  paste: Code2,
  file: FileCode,
  zip: FileArchive,
  excel: FileSpreadsheet,
};

const INPUT_METHOD_IDS: InputMethod[] = ["paste", "file", "zip", "excel"];

function SourceCard({
  label,
  accent,
  source,
  onChange,
}: {
  label: "A" | "B";
  accent: "primary" | "accent";
  source: SourceState;
  onChange: (next: SourceState) => void;
}) {
  const { t } = useTranslation("analysis");
  const { isRTL } = useLanguage();

  const inputMethods = INPUT_METHOD_IDS.map((id) => ({
    id,
    label: t(`analysis.methods.${id}`),
    description: t(`analysis.methodDescriptions.${id}`),
    icon: METHOD_ICONS[id],
  }));

  const selectedFile = getSelectedFile(source);
  const isReady = Boolean(source.code.trim() || selectedFile);

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

  const accentColor = accent === "primary" ? "hsl(var(--primary))" : "hsl(var(--accent))";
  const accentBg = accent === "primary" ? "hsl(var(--primary) / 0.12)" : "hsl(var(--accent) / 0.12)";

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card"
      style={{ boxShadow: "var(--card-shadow-rest)" }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 border-b border-border px-5 py-3"
        style={{ background: "hsl(var(--surface-2))" }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
          style={{ background: accentBg, color: accentColor }}
        >
          {label}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {t("analysis.sourceTitle", { label })}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {t("analysis.sourceDescription")}
          </p>
        </div>
        {isReady && (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("analysis.ready")}
          </span>
        )}
      </div>

      {/* Method tabs (pill row) */}
      <div
        className="grid grid-cols-2 gap-2 p-4 lg:grid-cols-4"
        style={{ background: "hsl(var(--surface-2) / 0.4)" }}
      >
        {inputMethods.map((method) => {
          const Icon = method.icon;
          const active = source.method === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setMethod(method.id)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
                active
                  ? "border-primary/40 text-foreground"
                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              )}
              style={{
                background: active
                  ? "hsl(var(--primary) / 0.08)"
                  : "hsl(var(--card))",
              }}
            >
              <Icon className="mb-1.5 h-4 w-4" style={active ? { color: "hsl(var(--primary))" } : undefined} />
              <div className="text-xs font-semibold">{method.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug opacity-80">{method.description}</div>
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
                  "absolute bottom-2 font-mono text-[10px] text-muted-foreground/60",
                  isRTL ? "left-3" : "right-3",
                )}
              >
                {source.code.split("\n").length} {t("analysis.lines")}
              </div>
            )}
          </div>
        )}

        {source.method !== "paste" && (
          <label
            className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 p-8 transition-all hover:border-primary/50 hover:bg-primary/5"
          >
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
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))" }}
            >
              {source.method === "file" && <FileCode className="h-7 w-7" />}
              {source.method === "zip" && <FileArchive className="h-7 w-7" />}
              {source.method === "excel" && <FileSpreadsheet className="h-7 w-7" />}
            </div>
            {selectedFile ? (
              <div className="text-center">
                <p className="max-w-[260px] truncate text-sm font-semibold text-foreground">
                  {selectedFile.name}
                </p>
                <p className="mt-0.5 text-xs text-success">{t("analysis.ready")}</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {t("analysis.clickOrDrop")}
                </p>
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
          <div
            className="flex items-center gap-2 rounded-xl border border-border/50 px-3 py-3 text-xs text-muted-foreground"
            style={{ background: "hsl(var(--surface-2))" }}
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{t("analysis.excelRow")}</span>
            <input
              type="number"
              min={1}
              value={source.excelRow}
              onChange={(event) => onChange({ ...source, excelRow: event.target.value })}
              placeholder="1"
              className={cn(
                "h-8 w-20 rounded-md border border-border/60 bg-card px-2 text-foreground focus:border-primary/60 focus:outline-none",
                isRTL ? "mr-auto text-right" : "ml-auto",
              )}
            />
          </div>
        )}
      </div>
    </div>
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sourceA, setSourceA] = useState<SourceState>(() => createEmptySource());
  const [sourceB, setSourceB] = useState<SourceState>(() => createEmptySource());

  const languageOptions = useMemo(() => {
    return supportedLanguages.length ? supportedLanguages : FALLBACK_LANGUAGE_OPTIONS;
  }, [supportedLanguages]);

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
        error instanceof Error
          ? localizeRuntimeMessage(error.message)
          : t("analysis.analysisFailed"),
      );
    }
  };

  const progressPercent =
    analysisProgress?.progress !== null && analysisProgress?.progress !== undefined
      ? Math.round(analysisProgress.progress)
      : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero band */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-64 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.3), transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t("analysis.eyebrow", { defaultValue: "Pairwise analysis" })}
            </div>
            <h1 className="mt-3 t-h2">{t("analysis.title")}</h1>
            <p className="mt-1 max-w-[60ch] t-body">{t("analysis.subtitle")}</p>
          </div>

          {/* Language selector */}
          <div
            className="shrink-0 rounded-xl border border-border/60 px-4 py-3"
            style={{ background: "hsl(var(--surface-2))" }}
          >
            <div className="flex items-center gap-2 t-label">
              <Code2 className="h-3.5 w-3.5" />
              {t("analysis.language")}
            </div>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="mt-1.5 h-8 w-[180px] border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option} value={option} className="text-sm">
                    {getProgrammingLanguageLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Step pills */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3 text-xs text-muted-foreground"
             style={{ background: "hsl(var(--surface-2) / 0.5)" }}>
          <div className="flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "var(--gradient-brand)" }}
            >
              1
            </span>
            <span className="font-semibold text-foreground">{t("analysis.steps.provide")}</span>
          </div>
          <div className="h-px w-6 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
              2
            </span>
            {t("analysis.steps.run")}
          </div>
          <div className="h-px w-6 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
              3
            </span>
            {t("analysis.steps.inspect")}
          </div>
        </div>
      </section>

      {errorMessage && (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "hsl(var(--destructive) / 0.25)",
            background: "hsl(var(--destructive) / 0.06)",
            color: "hsl(var(--destructive))",
          }}
          role="alert"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Two source cards */}
      <div className="grid gap-5 xl:grid-cols-2">
        <SourceCard label="A" accent="primary" source={sourceA} onChange={setSourceA} />
        <SourceCard label="B" accent="accent" source={sourceB} onChange={setSourceB} />
      </div>

      {/* Advanced capabilities */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {t("analysis.capabilities.toggle")}
        </button>

        {showAdvanced && (
          <div
            className="mt-3 animate-fade-in rounded-xl border border-border/50 p-4"
            style={{ background: "hsl(var(--surface-2) / 0.6)" }}
          >
            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITY_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-muted-foreground">{t(`analysis.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div className="text-xs text-muted-foreground">
          {t("analysis.autoSave")}
          {isAnalyzing && analysisProgress && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-[11px] font-semibold text-primary">
                  <span>{localizeRuntimeMessage(analysisProgress.stage)}</span>
                  {progressPercent !== null && <span className="font-mono">{progressPercent}%</span>}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressPercent ?? 20}%`,
                      background: "var(--gradient-brand)",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-10 border-border/60 text-sm"
            onClick={clearAll}
            disabled={isAnalyzing}
          >
            {t("analysis.clearAll")}
          </Button>
          <Button
            size="sm"
            className="h-10 gap-2 px-6 text-sm text-white"
            style={{
              background: "var(--gradient-brand)",
              boxShadow: "var(--glow-shadow-sm)",
            }}
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
                <Sparkles className="h-4 w-4" />
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
