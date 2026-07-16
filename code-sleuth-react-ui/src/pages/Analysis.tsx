import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
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
import {
  Masthead,
  FieldSheet,
  Field,
  Serial,
  MetaStrip,
  StatusTag,
  Tag,
  Meter,
  Panel,
  IndexRow,
  Notice,
} from "@/components/dossier/Dossier";
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

/** Human-readable byte size for the forensic size readings. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Live measurement of one source: line count (pasted only) and byte weight. */
function sourceMetrics(source: SourceState): { lines: number | null; bytes: number | null } {
  if (source.method === "paste") {
    if (!source.code.trim()) return { lines: null, bytes: null };
    return { lines: source.code.split("\n").length, bytes: new Blob([source.code]).size };
  }
  const file = getSelectedFile(source);
  return { lines: null, bytes: file ? file.size : null };
}

/** Compact readout string for a source measurement ("42 L · 1.2 KB" / "1.2 KB" / "—"). */
function metricReadout(metrics: { lines: number | null; bytes: number | null }): string {
  if (metrics.bytes == null) return "—";
  const size = formatBytes(metrics.bytes);
  return metrics.lines != null ? `${metrics.lines} L · ${size}` : size;
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

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Exhibit header — serial marker + label + status stamp */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Serial tone={isReady ? "primary" : "muted"}>{label}</Serial>
        <h2 className="t-label flex-1 text-foreground">{t("analysis.sourceTitle", { label })}</h2>
        <StatusTag tone={isReady ? "ok" : "muted"}>
          {isReady ? t("analysis.meta.ready") : t("analysis.empty", { defaultValue: "empty" })}
        </StatusTag>
      </div>

      {/* Segmented mono method control — an instrument switch, not four cards */}
      <div
        className="flex border-b border-border"
        role="group"
        aria-label={t("analysis.methodGroupLabel", { label, defaultValue: `Input method for source ${label}` })}
      >
        {inputMethods.map((method) => {
          const Icon = method.icon;
          const active = source.method === method.id;
          return (
            <button
              key={method.id}
              type="button"
              aria-pressed={active}
              onClick={() => setMethod(method.id)}
              className={cn(
                "flex-1 border-e border-border py-2 text-center font-mono text-[11px] uppercase tracking-wide transition-colors last:border-e-0",
                active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
              <div className="absolute bottom-2 end-3 font-mono text-[10px] text-muted-foreground">
                {source.code.split("\n").length} {t("analysis.lines")}
              </div>
            )}
          </div>
        )}

        {source.method !== "paste" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-dashed border-border p-4 transition-colors hover:border-primary/60 hover:bg-primary/5">
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
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {source.method === "file" && <FileCode className="h-5 w-5" />}
              {source.method === "zip" && <FileArchive className="h-5 w-5" />}
              {source.method === "excel" && <FileSpreadsheet className="h-5 w-5" />}
            </span>
            {selectedFile ? (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-label">{t("analysis.fileLabel", { defaultValue: "File" })}</span>
                  <StatusTag tone="ok">{t("analysis.meta.ready")}</StatusTag>
                </div>
                <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">{selectedFile.name}</p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="t-label text-foreground">{t("analysis.clickOrDrop")}</div>
                <p className="mt-1 text-xs text-muted-foreground">
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
              className="input-focus ms-auto h-8 w-20 rounded-sm border border-border bg-card px-2 font-mono text-foreground"
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sourceA, setSourceA] = useState<SourceState>(() => createEmptySource());
  const [sourceB, setSourceB] = useState<SourceState>(() => createEmptySource());

  const languageOptions = useMemo(() => {
    return supportedLanguages.length ? supportedLanguages : FALLBACK_LANGUAGE_OPTIONS;
  }, [supportedLanguages]);

  const readyCount = (sourceReady(sourceA) ? 1 : 0) + (sourceReady(sourceB) ? 1 : 0);
  const bothReady = readyCount === 2;

  const metricsA = sourceMetrics(sourceA);
  const metricsB = sourceMetrics(sourceB);

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
        meta={[
          { label: t("analysis.meta.mode"), value: t("analysis.meta.pairwise") },
          {
            label: t("analysis.meta.status"),
            value: bothReady ? (
              <StatusTag tone="ok">{t("analysis.meta.ready")}</StatusTag>
            ) : (
              <StatusTag tone="warn">
                {t("analysis.meta.draft")} · {readyCount}/2
              </StatusTag>
            ),
          },
          { label: t("analysis.meta.autosave"), value: t("analysis.meta.on") },
        ]}
      />

      {/* Case parameters — a real spec sheet of margin-label fields */}
      <FieldSheet>
        <Field label={t("analysis.language")} align="center">
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="h-9 w-full max-w-[220px] rounded-sm border-border bg-card font-mono text-sm">
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
        </Field>
        <Field label={t("analysis.params.comparator", { defaultValue: "Comparator" })} align="center">
          <span className="font-mono text-sm tabular-nums text-foreground">SRC.A ⇄ SRC.B</span>
        </Field>
        <Field label={t("analysis.params.method", { defaultValue: "Method" })} align="center">
          <span className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
            {`A · ${sourceA.method}`}
            <span className="px-2 text-border">/</span>
            {`B · ${sourceB.method}`}
          </span>
        </Field>
        <Field label={t("analysis.params.case", { defaultValue: "Case" })} align="center">
          <Tag tone="signal">{t("analysis.meta.pairwise")}</Tag>
        </Field>
      </FieldSheet>

      {errorMessage && (
        <div role="alert" aria-live="assertive">
          <Notice tone="danger">{errorMessage}</Notice>
        </div>
      )}

      {/* Live comparator readout — a dense instrument strip, not stat tiles */}
      <MetaStrip
        className="border-y border-border bg-muted/20 px-4 py-3"
        items={[
          { label: "SRC.A", value: metricReadout(metricsA) },
          { label: "SRC.B", value: metricReadout(metricsB) },
          {
            label: t("analysis.meta.ready"),
            value: (
              <StatusTag tone={bothReady ? "ok" : "warn"}>
                {readyCount}/2
              </StatusTag>
            ),
          },
          { label: t("analysis.language"), value: getProgrammingLanguageLabel(selectedLanguage) },
        ]}
      />

      {/* Two exhibits on the examination bench — framed either side of a live
          A ⇄ B comparator axis, the way a case file pins two specimens for review. */}
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)]">
        <ExhibitPanel label="A" source={sourceA} onChange={setSourceA} />

        {/* Comparator axis — a hairline run through an amber ⇄ node (vertical on wide,
            horizontal when the exhibits stack) */}
        <div className="flex items-center justify-center gap-3 xl:flex-col xl:gap-0" aria-hidden="true">
          <span className="h-px flex-1 bg-border xl:h-auto xl:w-px" />
          <span className="my-0 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 font-mono text-base font-bold text-primary xl:my-3">
            ⇄
          </span>
          <span className="h-px flex-1 bg-border xl:h-auto xl:w-px" />
        </div>

        <ExhibitPanel label="B" source={sourceB} onChange={setSourceB} />
      </div>

      {/* Engine capabilities — a numbered module index, not a green checklist */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          aria-expanded={showAdvanced}
          aria-controls="engine-modules"
          className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {t("analysis.capabilities.toggle")}
        </button>

        {showAdvanced && (
          <div id="engine-modules">
            <Panel
              label={t("analysis.engine.label", { defaultValue: "Engine modules" })}
              actions={
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {CAPABILITY_KEYS.length}
                </span>
              }
              bodyClassName="p-0"
              className="mt-3"
            >
              <ul className="divide-y divide-border">
                {CAPABILITY_KEYS.map((key, i) => (
                  <li key={key}>
                    <IndexRow
                      serial={<Serial>{String(i + 1).padStart(2, "0")}</Serial>}
                      title={t(`analysis.${key}`)}
                      meta={<StatusTag tone="signal">{t("analysis.engine.online", { defaultValue: "Online" })}</StatusTag>}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>

      {/* Run footer — mono status line + semantic progress meter + actions */}
      <div className="sticky bottom-0 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 font-mono text-[11px] text-muted-foreground">
          {isAnalyzing && analysisProgress ? (
            <div className="flex items-center gap-3">
              <span className="uppercase tracking-wide text-foreground">
                {localizeRuntimeMessage(analysisProgress.stage)}
                {progressPercent !== null && <span className="tabular-nums"> · {progressPercent}%</span>}
              </span>
              <Meter
                value={progressPercent ?? 20}
                tone="primary"
                className="w-40"
                ariaLabel={localizeRuntimeMessage(analysisProgress.stage)}
              />
            </div>
          ) : (
            <span className="uppercase tracking-wide">{t("analysis.autoSave")}</span>
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
              t("analysis.submit")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
