import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BenchButton, BenchSelect, Kbd, Plate, PlateMeter, Segment, SegmentGroup } from "@/components/bench/Bench";
import { IconFilePlus, IconSwap } from "@/components/bench/icons";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { CLONE_THRESHOLD } from "@/lib/bands";
import { formatBytes, highlightSource } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/**
 * New comparison (design node 11:113): two lit plates on the bench, a spine
 * with the swap control between them, the language select and the run
 * button in the header, and the signal roster on the status line.
 */

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
  "python", "c", "java", "javascript", "ruby", "go", "typescript", "php", "kotlin", "r", "rust", "scala", "elixir", "haskell", "perl",
];
const INPUT_METHOD_IDS: InputMethod[] = ["paste", "file", "zip", "excel"];

function createEmptySource(): SourceState {
  return { method: "paste", code: "", file: null, zip: null, excelFile: null, excelRow: "" };
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
  if (source.method === "paste") return Boolean(source.code.trim());
  return Boolean(getSelectedFile(source));
}

function limitFor(method: InputMethod) {
  return method === "zip" ? MAX_ZIP_FILE_BYTES : method === "excel" ? MAX_EXCEL_FILE_BYTES : MAX_SOURCE_FILE_BYTES;
}

function methodForFile(file: File): Exclude<InputMethod, "paste"> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return "excel";
  return "file";
}

const encoder = new TextEncoder();

/* ────────────────────────────────────────────────────────────────────────
   Code on a plate: highlighted rows with a transparent textarea laid over
   the text column so caret, selection and paste stay native.
   ──────────────────────────────────────────────────────────────────────── */

function CodeRows({ code, language, readOnly = false }: { code: string; language: string; readOnly?: boolean }) {
  const lines = useMemo(() => highlightSource(code, language), [code, language]);
  return (
    <div aria-hidden={!readOnly} className="plate-code">
      {lines.map((tokens, i) => (
        <div key={i} className="code-line">
          <span className="code-marker" />
          <span className="code-gutter">{i + 1}</span>
          <span className="code-text is-wrap [overflow-wrap:break-word]">
            {tokens.map((tok, j) =>
              tok.kind === "plain" ? (
                tok.text
              ) : (
                <span key={j} className={tok.kind === "kw" ? "code-kw" : tok.kind === "comment" ? "code-comment" : "code-str"}>
                  {tok.text}
                </span>
              ),
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function CodeEditor({
  value,
  onChange,
  language,
  label,
  textareaRef,
}: {
  value: string;
  onChange: (next: string) => void;
  language: string;
  label: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div className="relative min-h-full">
      <CodeRows code={value} language={language} />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={label}
        dir="ltr"
        className="plate-code absolute inset-y-0 end-0 start-[44px] block h-full resize-none overflow-hidden border-0 bg-transparent p-0 pe-3 text-transparent outline-none [caret-color:var(--plate-ink)] selection:bg-[color:rgba(242,83,42,.28)]"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   One plate
   ──────────────────────────────────────────────────────────────────────── */

function SourcePlate({
  label,
  source,
  onChange,
  language,
}: {
  label: "A" | "B";
  source: SourceState;
  onChange: (next: SourceState) => void;
  language: string;
}) {
  const { t } = useTranslation("analysis");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileText, setFileText] = useState<string | null>(null);
  const rowId = useId();

  const selectedFile = getSelectedFile(source);
  const limit = limitFor(source.method);
  const bytes = source.method === "paste" ? encoder.encode(source.code).length : (selectedFile?.size ?? 0);
  const lineCount = source.method === "paste" ? (source.code ? source.code.split("\n").length : 0) : fileText ? fileText.split("\n").length : 0;

  // Preview the chosen source file on the plate (text only, bounded by the limit).
  useEffect(() => {
    if (source.method !== "file" || !source.file) {
      setFileText(null);
      return;
    }
    let cancelled = false;
    source.file
      .text()
      .then((text) => {
        if (!cancelled) setFileText(text);
      })
      .catch(() => {
        if (!cancelled) setFileText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source.method, source.file]);

  const setMethod = (method: InputMethod) => onChange({ ...source, method });

  const setFile = useCallback(
    (method: Exclude<InputMethod, "paste">, nextFile: File | null) => {
      if (nextFile) {
        const maxBytes = limitFor(method);
        if (nextFile.size > maxBytes) {
          const limitMb = Math.round(maxBytes / (1024 * 1024));
          toast.error(
            t("upload.fileTooLarge", { ns: "common", limitMb, defaultValue: `File too large. Maximum size is ${limitMb} MB.` }),
          );
          return;
        }
      }
      onChange({
        ...source,
        method,
        file: method === "file" ? nextFile : source.file,
        zip: method === "zip" ? nextFile : source.zip,
        excelFile: method === "excel" ? nextFile : source.excelFile,
      });
    },
    [onChange, source, t],
  );

  const clearPlate = () => {
    onChange({ ...createEmptySource(), method: source.method });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    setFile(methodForFile(dropped), dropped);
  };

  const filename =
    source.method === "paste" ? null : selectedFile?.name ?? null;
  const accept =
    source.method === "file" ? SUPPORTED_SOURCE_FILE_ACCEPT : source.method === "zip" ? ".zip" : TABULAR_FILE_ACCEPT;
  const dropCopy =
    source.method === "file" ? t("analysis.bench.dropFile") : source.method === "zip" ? t("analysis.bench.dropZip") : t("analysis.bench.dropSheet");

  return (
    <Plate
      className={cn("h-[576px] min-w-0 transition-shadow", dragging && "ring-2 ring-signal")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Strip: identity + source mode */}
      <div className="plate-strip">
        <div className="flex min-w-0 items-center gap-3">
          <span className="label shrink-0 text-plate-ink">{t("analysis.bench.plate", { label, defaultValue: `Plate ${label}` })}</span>
          <span className={cn("mono-filename min-w-0 truncate", filename ? "text-plate-soft" : "text-plate-placeholder")} dir="ltr">
            {filename ?? "untitled"}
          </span>
        </div>
        <SegmentGroup surface="plate" aria-label={t("analysis.bench.sourceMode")}>
          {INPUT_METHOD_IDS.map((id) => (
            <Segment key={id} surface="plate" on={source.method === id} onClick={() => setMethod(id)}>
              {t(`analysis.bench.modes.${id}`)}
            </Segment>
          ))}
        </SegmentGroup>
      </div>

      {/* Body */}
      <div className="relative min-h-0 flex-1 overflow-auto scrollbar-thin">
        {source.method === "paste" ? (
          <div className="min-h-full cursor-text py-3.5" onClick={() => textareaRef.current?.focus()}>
            <CodeEditor
              value={source.code}
              onChange={(code) => onChange({ ...source, code })}
              language={language}
              label={t("analysis.sourceTitle", { label })}
              textareaRef={textareaRef}
            />
            {!source.code && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <IconFilePlus className="text-plate-soft" />
                <p className="text-[15px] text-plate-ink">{t("analysis.bench.dropHint")}</p>
                <p className="mono-meta text-plate-soft" dir="ltr">{t("analysis.bench.dropFormats")}</p>
              </div>
            )}
          </div>
        ) : source.method === "file" && source.file && fileText != null ? (
          <div className="py-3.5">
            <CodeRows code={fileText} language={language} readOnly />
          </div>
        ) : selectedFile ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <IconFilePlus className="text-plate-soft" />
            <p className="mono-value text-plate-ink" dir="ltr">{selectedFile.name}</p>
            <p className="mono-meta text-plate-soft" dir="ltr">
              {formatBytes(selectedFile.size)}
              {source.method === "zip" && " · zip"}
            </p>
            {source.method === "excel" && (
              <label htmlFor={rowId} className="mt-2 flex items-center gap-3">
                <span className="label text-plate-soft">{t("analysis.bench.sheetRow")}</span>
                <span className="plate-well h-9 w-24 !px-3">
                  <input
                    id={rowId}
                    type="number"
                    min={1}
                    value={source.excelRow}
                    onChange={(event) => onChange({ ...source, excelRow: event.target.value })}
                    placeholder="1"
                    dir="ltr"
                    className="font-mono text-[13px]"
                  />
                </span>
              </label>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-1 text-[12.5px] text-plate-ink underline underline-offset-2 hover:text-signal-plate">
              {t("analysis.bench.chooseAnother", { defaultValue: "Choose another file" })}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center"
          >
            <IconFilePlus className="text-plate-soft" />
            <span className="text-[15px] text-plate-ink">{dropCopy}</span>
            <span className="mono-meta text-plate-soft" dir="ltr">
              {source.method === "file" ? SUPPORTED_SOURCE_FILE_ACCEPT.replace(/,/g, " ") : source.method === "zip" ? ".zip" : TABULAR_FILE_ACCEPT.replace(/,/g, " ")}
            </span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            if (next) setFile(source.method === "paste" ? methodForFile(next) : source.method, next);
          }}
        />
      </div>

      {/* Footer: readings */}
      <div className="plate-footer">
        <span className="flex min-w-0 items-center gap-2 truncate" dir="ltr">
          <span>
            {t("analysis.bench.footerLines", { count: lineCount })}
            {bytes > 0 && ` · ${formatBytes(bytes)}`}
            {bytes > 0 && (source.method === "paste" || source.method === "file") && " · UTF-8"}
          </span>
          {sourceReady(source) && (
            <button type="button" onClick={clearPlate} className="underline underline-offset-2 hover:text-plate-ink">
              {t("analysis.bench.clear")}
            </button>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2" dir="ltr">
          <span>{t("analysis.bench.footerOf", { size: formatBytes(bytes), limit: formatBytes(limit) })}</span>
          <PlateMeter fraction={bytes / limit} />
        </span>
      </div>
    </Plate>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────── */

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

  const languageOptions = useMemo(
    () => (supportedLanguages.length ? supportedLanguages : FALLBACK_LANGUAGE_OPTIONS),
    [supportedLanguages],
  );

  const readyA = sourceReady(sourceA);
  const readyB = sourceReady(sourceB);
  const bothReady = readyA && readyB;

  const buildFormData = () => {
    const formData = new FormData();
    formData.append("language", selectedLanguage);
    formData.append("code1", sourceA.method === "paste" ? sourceA.code : "");
    formData.append("code2", sourceB.method === "paste" ? sourceB.code : "");

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

  const swapPlates = () => {
    setSourceA(sourceB);
    setSourceB(sourceA);
  };

  const handleAnalyze = useCallback(async () => {
    if (!bothReady || isAnalyzing) return;
    setErrorMessage("");
    clearCurrentResult();
    try {
      const result = await analyze(buildFormData());
      if (!result.has_results) {
        setErrorMessage(
          result.error_message ? localizeRuntimeMessage(result.error_message) : t("analysis.analysisCouldNotBeCompleted"),
        );
        return;
      }
      navigate(result.saved_analysis_id ? `/results?analysisId=${result.saved_analysis_id}` : "/results");
    } catch (error) {
      setErrorMessage(error instanceof Error ? localizeRuntimeMessage(error.message) : t("analysis.analysisFailed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothReady, isAnalyzing, sourceA, sourceB, selectedLanguage, analyze, navigate, localizeRuntimeMessage, t, clearCurrentResult]);

  // Ctrl/⌘ + Enter runs the comparison, as the button advertises.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void handleAnalyze();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAnalyze]);

  const progressPercent =
    analysisProgress?.progress !== null && analysisProgress?.progress !== undefined ? Math.round(analysisProgress.progress) : null;

  const statusCopy = bothReady
    ? t("analysis.bench.platesReady")
    : !readyA && !readyB
      ? t("analysis.bench.platesEmpty")
      : t("analysis.bench.plateEmpty", { label: readyA ? "B" : "A" });

  return (
    <div className="pt-7">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2.5">
          <span className="label text-txt-muted">{t("analysis.bench.kicker")}</span>
          <h1 className="t-page text-txt-primary">{t("analysis.bench.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-txt-muted">{statusCopy}</span>
          <BenchSelect
            size="large"
            label={t("analysis.bench.languageLabel")}
            value={selectedLanguage}
            onChange={setSelectedLanguage}
            options={languageOptions.map((option) => ({ value: option, label: getProgrammingLanguageLabel(option) }))}
          />
          <BenchButton
            tone={bothReady ? "primary" : "secondary"}
            disabled={!bothReady || isAnalyzing}
            onClick={() => void handleAnalyze()}
            trailing={<Kbd className={cn(bothReady && !isAnalyzing && "border-[color:rgba(27,27,25,.35)] text-plate-ink")}>Ctrl ↵</Kbd>}
          >
            {isAnalyzing ? t("analysis.bench.running") : t("analysis.bench.run")}
          </BenchButton>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="mt-5 border border-signal px-4 py-3 text-[13px] text-signal-bench">
          {errorMessage}
        </div>
      )}

      {/* Plates + spine */}
      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:gap-0">
        <div className="min-w-0 flex-1">
          <SourcePlate label="A" source={sourceA} onChange={setSourceA} language={selectedLanguage} />
        </div>
        <div className="relative flex items-center justify-center lg:w-12 lg:shrink-0">
          <span aria-hidden className="absolute inset-x-0 top-1/2 hidden h-px bg-bench-hair lg:inset-x-auto lg:inset-y-0 lg:start-1/2 lg:block lg:h-auto lg:w-px" />
          <button
            type="button"
            onClick={swapPlates}
            className="relative z-[1] flex h-8 w-8 items-center justify-center border border-bench-strong bg-bench-raised text-txt-primary hover:border-txt-muted"
            aria-label={t("analysis.bench.swap")}
            title={t("analysis.bench.swap")}
          >
            <IconSwap />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <SourcePlate label="B" source={sourceB} onChange={setSourceB} language={selectedLanguage} />
        </div>
      </div>

      {/* Status line */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {isAnalyzing && analysisProgress ? (
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span className="text-[12.5px] text-txt-secondary">
              {localizeRuntimeMessage(analysisProgress.stage)}
              {progressPercent !== null && <span className="mono-meta ms-2 text-txt-muted">{progressPercent}%</span>}
            </span>
            <span className="metric-bar-track w-40">
              <span className="metric-bar-fill block" style={{ width: `${progressPercent ?? 20}%` }} />
            </span>
          </div>
        ) : (
          <span className="text-[12.5px] text-txt-secondary">{t("analysis.bench.signals")}</span>
        )}
        <span className="mono-meta text-txt-muted" dir="ltr">
          {t("analysis.bench.thresholdLine", { threshold: CLONE_THRESHOLD })}
        </span>
      </div>
    </div>
  );
};

export default Analysis;
