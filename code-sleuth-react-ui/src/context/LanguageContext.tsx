import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setApiLanguage } from "@/lib/api";

export type AppLanguage = "en" | "ar";

type LanguageMeta = {
  code: AppLanguage;
  label: string;
  nativeName: string;
  locale: string;
  dir: "ltr" | "rtl";
};

interface LanguageContextValue {
  language: AppLanguage;
  meta: LanguageMeta;
  isRTL: boolean;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  localizeRuntimeMessage: (message: string) => string;
  getProgrammingLanguageLabel: (languageCode: string) => string;
}

const STORAGE_KEY = "codesimilar.language";

const languageMeta: Record<AppLanguage, LanguageMeta> = {
  en: {
    code: "en",
    label: "EN",
    nativeName: "English",
    locale: "en-US",
    dir: "ltr",
  },
  ar: {
    code: "ar",
    label: "AR",
    nativeName: "العربية",
    locale: "ar",
    dir: "rtl",
  },
};

// Programming-language names are proper nouns / brand names, so they stay in
// their canonical English (Latin) form in every UI language — never transliterated.
const programmingLanguageLabels: Record<string, string> = {
  python: "Python",
  c: "C",
  java: "Java",
  javascript: "JavaScript",
  ruby: "Ruby",
  go: "Go",
  typescript: "TypeScript",
  php: "PHP",
  kotlin: "Kotlin",
  r: "R",
  rust: "Rust",
  scala: "Scala",
  elixir: "Elixir",
  haskell: "Haskell",
  perl: "Perl",
};

const runtimeMessageMap: Record<AppLanguage, Record<string, string>> = {
  en: {},
  ar: {
    "Request failed": "فشل الطلب.",
    "Authentication failed.": "فشلت عملية تسجيل الدخول.",
    "Authentication required.": "يلزم تسجيل الدخول للمتابعة.",
    "The assistant is unavailable right now.": "المساعد غير متاح حاليًا.",
    "Invalid analysis identifier.": "معرّف التحليل غير صالح.",
    "No saved or active analysis is available yet.": "لا يوجد تحليل محفوظ أو نشط حتى الآن.",
    "No current analysis found": "لا يوجد تحليل حالي.",
    "No analysis is currently available.": "لا يوجد تحليل متاح حاليًا.",
    "Analysis not found": "لم يتم العثور على التحليل.",
    "Analysis not found.": "لم يتم العثور على التحليل.",
    "Unable to load the analysis result.": "تعذر تحميل نتيجة التحليل.",
    "Unable to rerun this analysis.": "تعذر إعادة تشغيل هذا التحليل.",
    "Unable to load history.": "تعذر تحميل السجل.",
    "Unable to load the analysis preview.": "تعذر تحميل معاينة التحليل.",
    "Unable to open this analysis.": "تعذر فتح هذا التحليل.",
    "Unable to export this analysis.": "تعذر تصدير هذا التحليل.",
    "Unable to delete this analysis.": "تعذر حذف هذا التحليل.",
    "Unable to load analysis.": "تعذر تحميل التحليل.",
    "No analysis loaded": "لا يوجد تحليل محمّل.",
    "Analysis failed.": "فشل التحليل.",
    "Analysis could not be completed.": "تعذر إكمال التحليل.",
    "Username and password are required.": "اسم المستخدم وكلمة المرور مطلوبان.",
    "Invalid credentials.": "بيانات الدخول غير صحيحة.",
    "Username already exists.": "اسم المستخدم مستخدم بالفعل.",
    "Unsupported language selected.": "تم اختيار لغة غير مدعومة.",
    "Uploaded archive must be a valid ZIP file.": "يجب أن يكون الأرشيف المرفوع ملف ZIP صالحًا.",
    "Unable to generate quality report because pylint is not installed on the server.": "تعذر إنشاء تقرير الجودة لأن pylint غير مثبت على الخادم.",
    "Loading your workspace…": "جارٍ تحميل مساحة العمل...",
    "Loading analysis results…": "جارٍ تحميل نتائج التحليل...",
    "Loading the latest analysis context…": "جارٍ تحميل أحدث سياق للتحليل...",
    "Unable to load analysis results.": "تعذر تحميل نتائج التحليل.",
    "Unable to load help content.": "تعذر تحميل محتوى المساعدة.",
    "Starting analysis": "بدء التحليل",
    "Starting analysis...": "بدء التحليل...",
    "Unsupported language": "اللغة غير مدعومة",
    "Computing code metrics": "جارٍ حساب قياسات الشيفرة",
    "Generating code graph data": "جارٍ توليد بيانات جراف الشيفرة",
    "Generating AI analysis text": "جارٍ توليد نص التحليل بالذكاء الاصطناعي",
    "Analysis complete": "اكتمل التحليل",
    "Similarity analysis: preprocessing": "تحليل التشابه: التحضير المسبق",
    "Similarity analysis: computing base similarity scores": "تحليل التشابه: حساب درجات التشابه الأساسية",
    "Similarity analysis: advanced clone metrics": "تحليل التشابه: حساب مؤشرات النسخ المتقدمة",
    "Similarity analysis: combining metrics": "تحليل التشابه: دمج القياسات",
    "Similarity analysis: AI similarity scoring": "تحليل التشابه: تقييم التشابه بالذكاء الاصطناعي",
    "Similarity analysis: finished calculations": "تحليل التشابه: انتهت الحسابات",
  },
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
  return value === "en" || value === "ar";
}

function getInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "en";
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (isSupportedLanguage(storedValue)) {
    return storedValue;
  }

  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("ar") ? "ar" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => getInitialLanguage());
  const meta = languageMeta[language];
  const isRTL = meta.dir === "rtl";

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    startTransition(() => {
      setLanguageState(nextLanguage);
    });
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ar" : "en");
  }, [language, setLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = meta.dir;
    document.body.dir = meta.dir;
    setApiLanguage(language);

    // Sync i18next language
    import("@/i18n").then((mod) => {
      const i18n = mod.default;
      if (i18n.language !== language) {
        i18n.changeLanguage(language);
      }
    }).catch(() => { /* i18n not yet initialized */ });
  }, [language, meta.dir]);

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(meta.locale, options).format(value),
    [meta.locale],
  );

  const formatDate = useCallback(
    (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => {
      const parsed = new Date(value);
      // An invalid/empty date makes Intl.format throw RangeError, which blanks
      // the whole page. Degrade gracefully to the raw string instead.
      if (Number.isNaN(parsed.getTime())) {
        return typeof value === "string" ? value : "";
      }
      return new Intl.DateTimeFormat(meta.locale, options).format(parsed);
    },
    [meta.locale],
  );

  const localizeRuntimeMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return trimmed;
      }

      const exactMatch = runtimeMessageMap[language][trimmed];
      if (exactMatch) {
        return exactMatch;
      }

      if (language === "ar") {
        if (trimmed.startsWith("Unsupported language:")) {
          return `اللغة غير مدعومة: ${trimmed.replace("Unsupported language:", "").trim()}`;
        }

        if (trimmed.startsWith("Missing required fields:")) {
          return `الحقول المطلوبة مفقودة: ${trimmed.replace("Missing required fields:", "").trim()}`;
        }

        if (trimmed.startsWith("Error during analysis:")) {
          return `حدث خطأ أثناء التحليل: ${trimmed.replace("Error during analysis:", "").trim()}`;
        }

        if (trimmed.startsWith("Invalid row number")) {
          return "رقم الصف غير صالح في ملف الجدول.";
        }

        if (trimmed.startsWith("ZIP archive contains too many files")) {
          return "يحتوي أرشيف ZIP على عدد ملفات أكبر من الحد المسموح.";
        }

        if (trimmed.startsWith("ZIP member")) {
          return "أحد ملفات أرشيف ZIP يتجاوز حد الحجم المسموح.";
        }

        if (trimmed.startsWith("ZIP archive total uncompressed size exceeds the allowed limit.")) {
          return "يتجاوز الحجم الإجمالي بعد فك ضغط أرشيف ZIP الحد المسموح.";
        }

        if (trimmed.startsWith("Zip Slip detected:")) {
          return `تم اكتشاف محاولة استخراج غير آمنة داخل أرشيف ZIP: ${trimmed.replace("Zip Slip detected:", "").trim()}`;
        }

        if (trimmed.includes("pylint")) {
          return trimmed
            .replace("Unable to generate quality report:", "تعذر إنشاء تقرير الجودة:")
            .replace("Stored snapshot fallback view. Run a re-analysis to regenerate the full quality report.", "هذا عرض احتياطي من لقطة محفوظة. أعد تشغيل التحليل لإعادة توليد تقرير الجودة الكامل.")
            .replace("Code smell analysis is currently available for Python only.", "تحليل جودة الكود متاح حاليًا للغة Python فقط.");
        }

        if (trimmed.startsWith("Unable to generate quality report:")) {
          return `تعذر إنشاء تقرير الجودة: ${trimmed.replace("Unable to generate quality report:", "").trim()}`;
        }
      }

      return trimmed;
    },
    [language],
  );

  const getProgrammingLanguageLabel = useCallback(
    (languageCode: string) => programmingLanguageLabels[languageCode.toLowerCase()] || languageCode,
    [],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      meta,
      isRTL,
      setLanguage,
      toggleLanguage,
      formatNumber,
      formatDate,
      localizeRuntimeMessage,
      getProgrammingLanguageLabel,
    }),
    [language, meta, isRTL, setLanguage, toggleLanguage, formatNumber, formatDate, localizeRuntimeMessage, getProgrammingLanguageLabel],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
