import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function SourceCard({
  label,
  colorClass,
  colorBgClass,
  source,
  onChange,
}: {
  label: "A" | "B";
  colorClass: string;
  colorBgClass: string;
  source: SourceState;
  onChange: (next: SourceState) => void;
}) {
  const { language, isRTL } = useLanguage();
  const inputMethods: Array<{
    id: InputMethod;
    label: string;
    description: string;
    icon: typeof Code2;
  }> =
    language === "ar"
      ? [
          { id: "paste", label: "لصق الشيفرة", description: "أدخل الشيفرة مباشرة", icon: Code2 },
          { id: "file", label: "ملف برمجي", description: "ارفع ملفًا برمجيًا واحدًا", icon: FileCode },
          { id: "zip", label: "أرشيف ZIP", description: "حلّل مشروعًا مضغوطًا", icon: FileArchive },
          { id: "excel", label: "Excel / CSV", description: "اختر صفًا من جدول", icon: FileSpreadsheet },
        ]
      : [
          { id: "paste", label: "Paste Code", description: "Enter code directly", icon: Code2 },
          { id: "file", label: "Code File", description: "Upload a single source file", icon: FileCode },
          { id: "zip", label: "ZIP Archive", description: "Analyze a project archive", icon: FileArchive },
          { id: "excel", label: "Excel / CSV", description: "Choose a row from a spreadsheet", icon: FileSpreadsheet },
        ];

  const copy =
    language === "ar"
      ? {
          sourceTitle: `المصدر ${label}`,
          sourceDescription: "اختر الطريقة التي تريد تزويد هذا المقطع البرمجي بها.",
          pastePlaceholder: `// ألصق شيفرة المصدر ${label} هنا…\nfunction example() {\n  return "Hello";\n}`,
          lines: "سطر",
          ready: "جاهز للتحليل",
          clickOrDrop: "انقر أو أسقط ملفًا هنا",
          codeFiles: "ملفات برمجية مثل .py و .java و .js و .ts و .go",
          zipArchive: "أرشيف ZIP لمستودع أو مجلد مشروع",
          spreadsheet: "ملف جدول يحتوي على العينة البرمجية داخل صف",
          rowNumber: "رقم الصف الذي يحتوي على العينة البرمجية:",
        }
      : {
          sourceTitle: `Source ${label}`,
          sourceDescription: "Select how you want to provide this code sample.",
          pastePlaceholder: `// Paste Source ${label} code here…\nfunction example() {\n  return "Hello";\n}`,
          lines: "lines",
          ready: "Ready for analysis",
          clickOrDrop: "Click or drop a file here",
          codeFiles: "Source code files such as .py, .java, .js, .ts, .go",
          zipArchive: "ZIP archive of a source repository or project folder",
          spreadsheet: "Spreadsheet file with the code sample in a row",
          rowNumber: "Row number containing the code sample:",
        };

  const selectedFile = getSelectedFile(source);
  const isReady = Boolean(source.code.trim() || selectedFile);

  const setMethod = (method: InputMethod) => onChange({ ...source, method });

  const setFile = (key: "file" | "zip" | "excelFile", nextFile: File | null) => {
    onChange({
      ...source,
      file: key === "file" ? nextFile : source.file,
      zip: key === "zip" ? nextFile : source.zip,
      excelFile: key === "excelFile" ? nextFile : source.excelFile,
    });
  };

  return (
    <div className="card-premium overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold", colorBgClass, colorClass)}>{label}</div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{copy.sourceTitle}</h2>
          <p className="text-xs text-muted-foreground">{copy.sourceDescription}</p>
        </div>
        {isReady && <CheckCircle2 className="ml-auto h-4 w-4 text-success" />}
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pt-4 lg:grid-cols-4">
        {inputMethods.map((method) => {
          const Icon = method.icon;
          const active = source.method === method.id;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setMethod(method.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all duration-150",
                active
                  ? "border-primary/50 bg-primary/8 text-primary"
                  : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="mb-2 h-4 w-4" />
              <div className="text-xs font-semibold">{method.label}</div>
              <div className="mt-1 text-[11px] leading-relaxed opacity-80">{method.description}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 p-4">
        {source.method === "paste" && (
          <div className="relative">
            <Textarea
              value={source.code}
              onChange={(event) => onChange({ ...source, code: event.target.value })}
              placeholder={copy.pastePlaceholder}
              className="code-surface min-h-[280px] resize-y p-4 text-xs leading-relaxed placeholder:text-muted-foreground/40"
            />
            {source.code && (
              <div className={cn("absolute bottom-2 text-[10px] text-muted-foreground/60 font-mono", isRTL ? "left-3" : "right-3")}>
                {source.code.split("\n").length} {copy.lines}
              </div>
            )}
          </div>
        )}

        {source.method !== "paste" && (
          <label className="drop-zone flex cursor-pointer flex-col items-center gap-3 p-8 hover:border-primary/50">
            <input
              type="file"
              className="hidden"
              accept={source.method === "file" ? SUPPORTED_SOURCE_FILE_ACCEPT : source.method === "zip" ? ".zip" : TABULAR_FILE_ACCEPT}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                const key = source.method === "file" ? "file" : source.method === "zip" ? "zip" : "excelFile";
                setFile(key, nextFile);
              }}
            />
            {source.method === "file" && <FileCode className="h-8 w-8 text-muted-foreground" />}
            {source.method === "zip" && <FileArchive className="h-8 w-8 text-muted-foreground" />}
            {source.method === "excel" && <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />}
            {selectedFile ? (
              <div className="text-center">
                <p className="max-w-[260px] truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                <p className="mt-0.5 text-xs text-success">{copy.ready}</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{copy.clickOrDrop}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {source.method === "file"
                    ? copy.codeFiles
                    : source.method === "zip"
                      ? copy.zipArchive
                      : copy.spreadsheet}
                </p>
              </div>
            )}
          </label>
        )}

        {source.method === "excel" && (
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{copy.rowNumber}</span>
            <input
              type="number"
              min={1}
              value={source.excelRow}
              onChange={(event) => onChange({ ...source, excelRow: event.target.value })}
              placeholder="1"
              className={cn(
                "h-8 w-20 rounded-md border border-border/60 bg-card/60 px-2 text-foreground focus:border-primary/60 focus:outline-none",
                isRTL ? "mr-auto text-right" : "ml-auto",
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
const Analysis = () => {
  const navigate = useNavigate();
  const { supportedLanguages } = useAuth();
  const { analyze, clearCurrentResult, isAnalyzing, analysisProgress } = useAnalysis();
  const { language: uiLanguage, localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sourceA, setSourceA] = useState<SourceState>(() => createEmptySource());
  const [sourceB, setSourceB] = useState<SourceState>(() => createEmptySource());

  const copy =
    uiLanguage === "ar"
      ? {
          pageTitle: "تحليل جديد",
          pageDescription: "زوّد مصدرين برمجيين عبر اللصق أو رفع الملفات أو أرشيفات ZIP أو صفوف الجداول.",
          language: "اللغة",
          step1: "تزويد المصادر",
          step2: "تشغيل التحليل",
          step3: "مراجعة النتائج",
          capabilitiesToggle: "قدرات التحليل المضمنة في هذه الجولة",
          capabilityLabels: [
            "تحليل التوكنات",
            "مقارنة رسم AST",
            "تشابه النص",
            "تحليل دلالي بالذكاء الاصطناعي",
            "قياسات الشيفرة",
            "كشف أنواع النسخ",
            "تحليل جودة الشيفرة",
          ],
          autoSave: "يتم حفظ التحليلات تلقائيًا في السجل بعد النجاح.",
          clearAll: "مسح الكل",
          analyzing: "جارٍ التحليل...",
          runAnalysis: "تشغيل التحليل",
          analysisCouldNotBeCompleted: "تعذر إكمال التحليل.",
          analysisFailed: "فشل التحليل.",
        }
      : {
          pageTitle: "New Analysis",
          pageDescription: "Provide two code sources using pasted code, uploaded files, ZIP archives, or spreadsheet rows.",
          language: "Language",
          step1: "Provide Sources",
          step2: "Run Analysis",
          step3: "Inspect Results",
          capabilitiesToggle: "Analysis capabilities included in this run",
          capabilityLabels: [
            "Token analysis",
            "AST graph comparison",
            "Text similarity",
            "AI semantic analysis",
            "Code metrics",
            "Clone-type detection",
            "Code smell analysis",
          ],
          autoSave: "Analyses are automatically saved to history after a successful run.",
          clearAll: "Clear All",
          analyzing: "Analyzing…",
          runAnalysis: "Run Analysis",
          analysisCouldNotBeCompleted: "Analysis could not be completed.",
          analysisFailed: "Analysis failed.",
        };

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
        setErrorMessage(result.error_message ? localizeRuntimeMessage(result.error_message) : copy.analysisCouldNotBeCompleted);
        return;
      }
      const nextUrl = result.saved_analysis_id ? `/results?analysisId=${result.saved_analysis_id}` : "/results";
      navigate(nextUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? localizeRuntimeMessage(error.message) : copy.analysisFailed);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{copy.pageTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.pageDescription}
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-border/60 bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{copy.language}</span>
            </div>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="mt-1 h-7 w-[160px] border-0 bg-transparent p-0 text-xs font-medium shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {getProgrammingLanguageLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
          <span className="font-medium text-foreground">{copy.step1}</span>
        </div>
        <div className="h-px max-w-8 flex-1 bg-border/50" />
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">2</span>
          <span>{copy.step2}</span>
        </div>
        <div className="h-px max-w-8 flex-1 bg-border/50" />
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">3</span>
          <span>{copy.step3}</span>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <SourceCard label="A" colorClass="text-primary" colorBgClass="bg-primary/12" source={sourceA} onChange={setSourceA} />
        <SourceCard label="B" colorClass="text-accent" colorBgClass="bg-accent/12" source={sourceB} onChange={setSourceB} />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {copy.capabilitiesToggle}
        </button>

        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-border/50 bg-card/50 p-4 animate-fade-in">
            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {copy.capabilityLabels.map((label) => (
                <div key={label} className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-xs text-muted-foreground">
          {copy.autoSave}
          {isAnalyzing && analysisProgress && (
            <div className="mt-2 text-xs text-blue-600">
              {localizeRuntimeMessage(analysisProgress.stage)}
              {analysisProgress.progress !== null && analysisProgress.progress !== undefined
                ? ` (${Math.round(analysisProgress.progress)}%)`
                : ""}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="h-10 border-border/60 text-xs" onClick={clearAll}>
            {copy.clearAll}
          </Button>
          <Button size="sm" className="h-10 gap-2 px-5 text-xs shadow-glow-sm" onClick={() => void handleAnalyze()} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {copy.analyzing}
              </span>
            ) : (
              <>
                {copy.runAnalysis}
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
