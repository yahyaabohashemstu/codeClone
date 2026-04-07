import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  Code2,
  Cpu,
  Download,
  FileText,
  GitCompare,
  MessageSquare,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Diff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { AnalysisReport } from "@/components/results/AnalysisReport";
import { AstGraphPanel } from "@/components/results/AstGraphPanel";
import { DiffViewer } from "@/components/results/DiffViewer";
import { MetricsComparison } from "@/components/results/MetricsComparison";
import { PdfExportDialog } from "@/components/results/PdfExportDialog";
import { SimilarityRadar } from "@/components/results/SimilarityRadar";
import { StructuredReport } from "@/components/results/StructuredReport";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage, type AppLanguage } from "@/context/LanguageContext";
import type { AnalysisResult, CloneItem, SimilarityItem } from "@/types/api";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";

type ResultTab = "overview" | "diff" | "graphs" | "metrics" | "quality" | "report" | "chat";

function getTabs(language: AppLanguage): Array<{ id: ResultTab; label: string; icon: typeof BarChart3 }> {
  return language === "ar"
    ? [
        { id: "overview", label: "نظرة عامة", icon: BarChart3 },
        { id: "diff", label: "الفروق", icon: Diff },
        { id: "graphs", label: "الرسوم", icon: Cpu },
        { id: "metrics", label: "القياسات", icon: TrendingUp },
        { id: "quality", label: "الجودة", icon: ShieldAlert },
        { id: "report", label: "تقرير الذكاء", icon: FileText },
        { id: "chat", label: "اسأل الذكاء", icon: MessageSquare },
      ]
    : [
        { id: "overview", label: "Overview", icon: BarChart3 },
        { id: "diff", label: "Diff", icon: Diff },
        { id: "graphs", label: "Graphs", icon: Cpu },
        { id: "metrics", label: "Metrics", icon: TrendingUp },
        { id: "quality", label: "Quality", icon: ShieldAlert },
        { id: "report", label: "AI Report", icon: FileText },
        { id: "chat", label: "Ask AI", icon: MessageSquare },
      ];
}

function translateSimilarityName(name: string, language: AppLanguage) {
  const map: Record<string, Record<AppLanguage, string>> = {
    "Text Similarity": { en: "Text Similarity", ar: "تشابه النص" },
    "Token-Based Similarity": { en: "Token-Based Similarity", ar: "تشابه التوكنات" },
    "Token Similarity (ordered)": { en: "Token Similarity (ordered)", ar: "تشابه التوكنات (مرتب)" },
    "Token Similarity (ordered, excluding comments and whitespace)": {
      en: "Token Similarity (ordered, excluding comments and whitespace)",
      ar: "تشابه التوكنات (مرتب، بدون التعليقات والمسافات البيضاء)",
    },
    "Token Similarity (unordered, with comments and whitespace)": {
      en: "Token Similarity (unordered, with comments and whitespace)",
      ar: "تشابه التوكنات (غير مرتب، مع التعليقات والمسافات البيضاء)",
    },
    "Token Similarity (unordered, excluding comments and whitespace)": {
      en: "Token Similarity (unordered, excluding comments and whitespace)",
      ar: "تشابه التوكنات (غير مرتب، بدون التعليقات والمسافات البيضاء)",
    },
    "Renamed Clone Similarity": { en: "Renamed Clone Similarity", ar: "تشابه النسخ المعاد تسميتها" },
    "Graph-Based Similarity": { en: "Graph-Based Similarity", ar: "تشابه الرسم البنيوي" },
    "Combined Similarity": { en: "Combined Similarity", ar: "التشابه الكلي" },
    "AI Similarity": { en: "AI Similarity", ar: "تشابه الذكاء الاصطناعي" },
  };

  const exactMatch = map[name]?.[language];
  if (exactMatch) {
    return exactMatch;
  }

  if (language === "ar" && name.startsWith("Token Similarity")) {
    return name
      .replace("Token Similarity", "تشابه التوكنات")
      .replace("ordered", "مرتب")
      .replace("unordered", "غير مرتب")
      .replace("excluding comments and whitespace", "بدون التعليقات والمسافات البيضاء")
      .replace("with comments and whitespace", "مع التعليقات والمسافات البيضاء");
  }

  return name;
}

function getCombinedScore(result: AnalysisResult) {
  const combined = result.similarity_items.find((item) => item.name === "Combined Similarity");
  return combined ? combined.value : 0;
}

function getScoreTone(score: number, language: AppLanguage) {
  if (score >= 80) return { color: "text-destructive", label: language === "ar" ? "تشابه مرتفع" : "High Similarity", badge: "badge-error" };
  if (score >= 50) return { color: "text-warning", label: language === "ar" ? "تشابه متوسط" : "Moderate Similarity", badge: "badge-warning" };
  return { color: "text-success", label: language === "ar" ? "تشابه منخفض" : "Low Similarity", badge: "badge-success" };
}

function formatSimilarityValue(item: SimilarityItem) {
  return `${item.value.toFixed(2)}%`;
}


function exportAsJson(result: AnalysisResult) {
  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.json`, JSON.stringify(result, null, 2), "application/json");
}

function exportAsText(result: AnalysisResult, language: AppLanguage) {
  const lines = [
    `${language === "ar" ? "رقم التحليل" : "Analysis ID"}: ${result.saved_analysis_id ?? (language === "ar" ? "الحالي" : "current")}`,
    `${language === "ar" ? "اللغة" : "Language"}: ${result.language}`,
    `${language === "ar" ? "المصدر A" : "Source A"}: ${result.source_labels.code1}`,
    `${language === "ar" ? "المصدر B" : "Source B"}: ${result.source_labels.code2}`,
    "",
    language === "ar" ? "مؤشرات التشابه:" : "Similarity Metrics:",
    ...result.similarity_items.map((item) => `- ${translateSimilarityName(item.name, language)}: ${formatSimilarityValue(item)}`),
    "",
    language === "ar" ? "كشف النسخ:" : "Clone Detection:",
    ...result.clone_items.map((item) => `- ${translateCloneName(item.name, language)}: ${item.detected ? (language === "ar" ? "مكتشف" : "Detected") : language === "ar" ? "غير مكتشف" : "Not detected"}`),
    "",
    language === "ar" ? "التحليل بين الشيفرتين:" : "Inter-Code Analysis:",
    result.analysis_text,
  ];

  downloadText(`analysis-${result.saved_analysis_id ?? "current"}.txt`, lines.join("\n"));
}


function SimilarityBars({ items }: { items: SimilarityItem[] }) {
  const { language } = useLanguage();
  return (
    <div className="card-premium p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="h-4 w-4 text-primary" />
        {language === "ar" ? "مؤشرات التشابه" : "Similarity Indicators"}
      </h3>
      <div className="space-y-4">
        {items.map((item) => {
          const barTone = item.value >= 80 ? "from-destructive to-destructive/70" : item.value >= 50 ? "from-warning to-warning/70" : "from-success to-success/70";
          return (
            <div key={item.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{translateSimilarityName(item.name, language)}</span>
                <span className={cn("font-bold tabular-nums", item.value >= 80 ? "text-destructive" : item.value >= 50 ? "text-warning" : "text-success")}>
                  {formatSimilarityValue(item)}
                </span>
              </div>
              <div className="metric-bar-track w-full">
                <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", barTone)} style={{ width: `${item.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CloneMeta = {
  summary: string;
  detectedMeaning: string;
  absentMeaning: string;
  family: string;
  whyItMatters: string;
};

function translateCloneName(name: string, language: AppLanguage) {
  const map: Record<string, Record<AppLanguage, string>> = {
    "Exact Clone": { en: "Exact Clone", ar: "نسخ حرفي" },
    "Near Miss Clone": { en: "Near Miss Clone", ar: "نسخ شبه مطابق" },
    "Parameterized Clone": { en: "Parameterized Clone", ar: "نسخ بمعلمات مختلفة" },
    "Function Clone": { en: "Function Clone", ar: "نسخ على مستوى الدالة" },
    "Non-Contiguous Clone": { en: "Non-Contiguous Clone", ar: "نسخ غير متجاور" },
    "Structural Clone": { en: "Structural Clone", ar: "نسخ بنيوي" },
    "Reordered Clone": { en: "Reordered Clone", ar: "نسخ معاد الترتيب" },
    "Function Reordered Clone": { en: "Function Reordered Clone", ar: "نسخ دوال معاد ترتيبه" },
    "Gapped Clone": { en: "Gapped Clone", ar: "نسخ متقطع" },
    "Intertwined Clone": { en: "Intertwined Clone", ar: "نسخ متداخل" },
    "Semantic Clone": { en: "Semantic Clone", ar: "نسخ دلالي" },
  };

  return map[name]?.[language] || name;
}

const cloneTypeMetaEn: Record<string, CloneMeta> = {
  "Exact Clone": {
    summary: "Nearly identical code with only trivial formatting or whitespace differences.",
    detectedMeaning: "This is the strongest duplication signal and often points to direct copy-paste reuse.",
    absentMeaning: "The match is not a literal copy; the similarity comes from transformed or adapted logic instead.",
    family: "Direct reuse",
    whyItMatters: "Exact duplication is the clearest indicator of copy-paste similarity and usually deserves the highest review attention.",
  },
  "Near Miss Clone": {
    summary: "Mostly the same logic, but with small edits such as changed statements, operators, or conditions.",
    detectedMeaning: "The code appears to come from the same baseline with light modifications layered on top.",
    absentMeaning: "The relationship is either more exact than a near-miss or more transformed than simple statement edits.",
    family: "Edited reuse",
    whyItMatters: "Near-miss matches often hide copied solutions behind minor edits, making them important for manual review.",
  },
  "Parameterized Clone": {
    summary: "Identifiers, literals, or parameters vary while the structural pattern remains aligned.",
    detectedMeaning: "This usually indicates reuse with renamed variables or swapped constant values rather than new logic.",
    absentMeaning: "The overlap is not mainly driven by renamed placeholders or parameter substitutions.",
    family: "Renamed pattern",
    whyItMatters: "This pattern is common when a copied solution is lightly personalized without changing its underlying logic.",
  },
  "Function Clone": {
    summary: "Functions or routines preserve the same operational pattern or callable behavior.",
    detectedMeaning: "The main behavior is replicated at the function level, even if local details changed.",
    absentMeaning: "The similarity is not concentrated around function-level reuse as a dominant pattern.",
    family: "Functional reuse",
    whyItMatters: "Function-level reuse suggests that entire solution units may have been preserved across the two sources.",
  },
  "Non-Contiguous Clone": {
    summary: "Shared logic is split across separated fragments instead of appearing as one continuous block.",
    detectedMeaning: "The duplicated behavior is distributed through the code, which often suggests refactoring or interleaving edits.",
    absentMeaning: "The overlap is more contiguous and appears in larger uninterrupted regions.",
    family: "Fragmented reuse",
    whyItMatters: "Distributed matching fragments can be harder to spot manually even though they still indicate strong reuse.",
  },
  "Structural Clone": {
    summary: "Control flow and syntax tree shape align strongly even when exact tokens do not.",
    detectedMeaning: "The two sources are architecturally similar, which is a strong sign of reused solution structure.",
    absentMeaning: "The similarity is driven more by tokens or semantics than by matching syntax-tree structure.",
    family: "Structural match",
    whyItMatters: "AST-level alignment is a strong signal when someone preserves the same scaffold but changes surface details.",
  },
  "Reordered Clone": {
    summary: "Equivalent statements exist, but their order has been rearranged.",
    detectedMeaning: "The logic was likely preserved while blocks were shuffled to look different or fit a new flow.",
    absentMeaning: "Statement ordering still differs enough that reordering is not a major explanation for the overlap.",
    family: "Order variation",
    whyItMatters: "Reordering is a common disguise tactic because it changes appearance while preserving most of the logic.",
  },
  "Function Reordered Clone": {
    summary: "Equivalent functions or callable segments appear in a different arrangement or sequence.",
    detectedMeaning: "The implementation keeps the same functional building blocks while changing their outer organization.",
    absentMeaning: "Function-level rearrangement is not the main pattern explaining the match.",
    family: "Reorganized functions",
    whyItMatters: "Function shuffling can make two solutions look original even when the same building blocks are reused.",
  },
  "Gapped Clone": {
    summary: "Shared logic exists with inserted or removed gaps between the matching parts.",
    detectedMeaning: "The clone was modified by adding unrelated code between duplicated fragments without changing the core pattern.",
    absentMeaning: "The overlap is not primarily interrupted by inserted gaps or omissions.",
    family: "Interrupted reuse",
    whyItMatters: "Inserted gaps often indicate deliberate attempts to break up duplicated logic and reduce obvious matches.",
  },
  "Intertwined Clone": {
    summary: "Clone fragments are woven together with unrelated statements or alternative logic.",
    detectedMeaning: "The original structure appears to have been blended with extra logic, making reuse harder to spot directly.",
    absentMeaning: "The clone evidence is cleaner and less entangled with unrelated implementation details.",
    family: "Blended reuse",
    whyItMatters: "Intertwined clones are important because they can hide shared logic inside otherwise noisy implementation details.",
  },
  "Semantic Clone": {
    summary: "Behavior is equivalent even when syntax differs noticeably.",
    detectedMeaning: "This is a deeper signal that the two sources may solve the same problem in functionally matching ways.",
    absentMeaning: "The overlap is better explained by syntax and structure than by purely semantic equivalence.",
    family: "Behavioral match",
    whyItMatters: "Semantic matches matter most when two submissions converge on the same behavior despite visible code differences.",
  },
};

const cloneTypeMetaAr: Record<string, CloneMeta> = {
  "Exact Clone": {
    summary: "شيفرة متطابقة تقريبًا مع فروقات شكلية طفيفة فقط مثل التنسيق أو المسافات.",
    detectedMeaning: "هذه أقوى إشارة على التكرار وغالبًا تشير إلى نسخ مباشر وإعادة استخدام بالنقل واللصق.",
    absentMeaning: "التطابق ليس نسخًا حرفيًا؛ بل يأتي التشابه من منطق معدل أو مكيّف.",
    family: "إعادة استخدام مباشرة",
    whyItMatters: "النسخ الحرفي هو أوضح مؤشر على النقل المباشر ويستحق أعلى مستوى من المراجعة عادة.",
  },
  "Near Miss Clone": {
    summary: "المنطق متشابه إلى حد كبير لكن مع تعديلات صغيرة مثل تغيير العبارات أو العوامل أو الشروط.",
    detectedMeaning: "يبدو أن الشيفرتين خرجتا من أساس واحد مع طبقة تعديلات خفيفة فوقه.",
    absentMeaning: "العلاقة إما أكثر تطابقًا من نسخة شبه مطابقة أو أكثر تحورًا من مجرد تعديلات بسيطة.",
    family: "إعادة استخدام معدّلة",
    whyItMatters: "هذا النوع قد يخفي النسخ خلف تعديلات بسيطة، لذلك يبقى مهمًا للمراجعة اليدوية.",
  },
  "Parameterized Clone": {
    summary: "تختلف المعرّفات أو القيم أو المعاملات بينما يبقى النمط البنيوي متوافقًا.",
    detectedMeaning: "غالبًا ما يدل هذا على إعادة استخدام مع تغيير أسماء المتغيرات أو القيم الثابتة بدل بناء منطق جديد.",
    absentMeaning: "التشابه ليس مدفوعًا أساسًا باستبدال الأسماء أو المعاملات.",
    family: "نمط معاد التسمية",
    whyItMatters: "هذا النمط شائع عندما يجري تخصيص حل منسوخ بشكل خفيف دون تغيير منطقه الأساسي.",
  },
  "Function Clone": {
    summary: "تحافظ الدوال أو الروتينات على النمط التشغيلي نفسه أو السلوك القابل للاستدعاء.",
    detectedMeaning: "السلوك الرئيسي مكرر على مستوى الدالة حتى لو تغيّرت التفاصيل المحلية.",
    absentMeaning: "التشابه ليس متركزًا حول إعادة استخدام على مستوى الدالة كونه النمط المهيمن.",
    family: "إعادة استخدام وظيفية",
    whyItMatters: "إعادة استخدام الدوال توحي بأن وحدات حل كاملة ربما انتقلت بين المصدرين.",
  },
  "Non-Contiguous Clone": {
    summary: "المنطق المشترك موزع على مقاطع منفصلة بدل أن يظهر في كتلة متصلة واحدة.",
    detectedMeaning: "السلوك المتكرر موزع داخل الشيفرة، وغالبًا ما يشير ذلك إلى إعادة صياغة أو إدراج تعديلات بين المقاطع.",
    absentMeaning: "التطابق أكثر اتصالًا ويظهر في مناطق أكبر غير منقطعة.",
    family: "إعادة استخدام مجزأة",
    whyItMatters: "المقاطع الموزعة أصعب في الاكتشاف اليدوي رغم أنها قد تدل على إعادة استخدام قوية.",
  },
  "Structural Clone": {
    summary: "يتطابق تدفق التحكم وشكل شجرة البنية النحوية بقوة حتى لو اختلفت التوكنات حرفيًا.",
    detectedMeaning: "المصدران متشابهان معماريًا، وهي إشارة قوية إلى إعادة استخدام بنية الحل.",
    absentMeaning: "التشابه ناتج أكثر عن التوكنات أو الدلالة لا عن تطابق بنية الشجرة النحوية.",
    family: "تطابق بنيوي",
    whyItMatters: "محاذاة AST مهمة عندما يحافظ شخص ما على الهيكل العام نفسه مع تغيير التفاصيل السطحية.",
  },
  "Reordered Clone": {
    summary: "توجد عبارات مكافئة لكن ترتيبها تغيّر.",
    detectedMeaning: "يبدو أن المنطق بقي كما هو مع إعادة ترتيب الكتل ليبدو مختلفًا أو ليلائم تدفقًا جديدًا.",
    absentMeaning: "لا يزال ترتيب العبارات مختلفًا بما يكفي بحيث لا يكون إعادة الترتيب هو التفسير الأبرز للتشابه.",
    family: "تنويع في الترتيب",
    whyItMatters: "إعادة الترتيب حيلة شائعة لتغيير المظهر مع الحفاظ على معظم المنطق.",
  },
  "Function Reordered Clone": {
    summary: "تظهر دوال أو مقاطع قابلة للاستدعاء مكافئة لكن بترتيب أو تسلسل مختلف.",
    detectedMeaning: "التنفيذ يحتفظ بلبنات البناء الوظيفية نفسها مع تغيير التنظيم الخارجي.",
    absentMeaning: "إعادة ترتيب الدوال ليست النمط الرئيسي الذي يفسر هذا التشابه.",
    family: "إعادة تنظيم الدوال",
    whyItMatters: "تحريك الدوال قد يجعل حلين يبدوان أصليين رغم إعادة استخدام اللبنات نفسها.",
  },
  "Gapped Clone": {
    summary: "يوجد منطق مشترك لكن مع فجوات أُضيفت أو أُزيلت بين الأجزاء المتطابقة.",
    detectedMeaning: "تم تعديل النسخ بإدراج شيفرة غير مرتبطة بين الأجزاء المكررة دون تغيير النمط الأساسي.",
    absentMeaning: "التطابق ليس متقطعًا أساسًا بفجوات أو حذف.",
    family: "إعادة استخدام متقطعة",
    whyItMatters: "إدخال الفجوات غالبًا محاولة لتفكيك المنطق المنسوخ وجعله أقل وضوحًا.",
  },
  "Intertwined Clone": {
    summary: "مقاطع النسخ منسوجة مع عبارات غير مرتبطة أو منطق بديل.",
    detectedMeaning: "يبدو أن البنية الأصلية مزجت مع منطق إضافي مما يجعل إعادة الاستخدام أصعب في الاكتشاف المباشر.",
    absentMeaning: "أدلة النسخ هنا أوضح وأقل تشابكًا مع تفاصيل تنفيذ غير مرتبطة.",
    family: "إعادة استخدام ممزوجة",
    whyItMatters: "هذا النوع مهم لأنه قد يخفي المنطق المشترك داخل تنفيذ مليء بالضوضاء.",
  },
  "Semantic Clone": {
    summary: "السلوك متكافئ حتى عندما تختلف البنية النحوية بشكل ملحوظ.",
    detectedMeaning: "هذه إشارة أعمق إلى أن المصدرين قد يحلان المشكلة نفسها بطرق متكافئة وظيفيًا.",
    absentMeaning: "التشابه يفسَّر بالبنية أو الصياغة أكثر من التكافؤ الدلالي الخالص.",
    family: "تطابق سلوكي",
    whyItMatters: "التطابقات الدلالية مهمة جدًا عندما تتقارب الحلول سلوكيًا رغم اختلاف الشيفرة الظاهر.",
  },
};

function getCloneTypeMeta(language: AppLanguage) {
  return language === "ar" ? cloneTypeMetaAr : cloneTypeMetaEn;
}

const clonePriority: Record<string, number> = {
  "Exact Clone": 100,
  "Semantic Clone": 95,
  "Structural Clone": 90,
  "Near Miss Clone": 85,
  "Parameterized Clone": 80,
  "Function Clone": 75,
  "Non-Contiguous Clone": 70,
  "Reordered Clone": 65,
  "Function Reordered Clone": 60,
  "Gapped Clone": 55,
  "Intertwined Clone": 50,
};

function summarizeCloneProfile(items: CloneItem[], language: AppLanguage) {
  const detectedCount = items.filter((item) => item.detected).length;
  const exactDetected = items.some((item) => item.name === "Exact Clone" && item.detected);
  const semanticDetected = items.some((item) => item.name === "Semantic Clone" && item.detected);

  if (detectedCount === 0) {
    return language === "ar"
      ? "لم تُرفع أي إشارات نسخ في هذه الجولة، ما يعني أن المحرك لم يجد نمط تكرار ذا دلالة ضمن اختبارات أنواع النسخ."
      : "No clone signatures were raised in this run, which means the engine did not find a meaningful duplication pattern across its clone-type checks.";
  }

  if (exactDetected) {
    return language === "ar"
      ? "ظهرت إشارة نسخ حرفي، ما يعني أن التداخل قريب من التكرار المباشر لا مجرد تشابه بنيوي."
      : "An exact-clone signal is present, which means the overlap is close to direct duplication rather than only structural resemblance.";
  }

  if (semanticDetected && detectedCount >= 4) {
    return language === "ar"
      ? "تم اكتشاف عدة إشارات لنسخ متحوّل، من بينها تشابه دلالي، ما يوحي بإعادة استخدام منطق جرى تكييفه بدل نسخه حرفيًا."
      : "Multiple transformed clone signatures were detected, including semantic overlap, which suggests reused logic that has been adapted rather than copied verbatim.";
  }

  if (detectedCount >= 4) {
    return language === "ar"
      ? "تم اكتشاف عدة أنماط نسخ متحوّلة، ما يشير إلى جذور تنفيذ مشتركة مع إعادة تسمية أو ترتيب أو تعديلات محلية."
      : "Several transformed clone patterns were detected, which points to shared implementation roots with renaming, reordering, or local edits applied.";
  }

  return language === "ar"
    ? "تم اكتشاف مجموعة أصغر من إشارات النسخ، ما يوحي بإعادة استخدام انتقائية لا تطابقًا واسعًا واحدًا لواحد."
    : "A smaller set of clone signatures was detected, suggesting selective reuse rather than broad one-to-one duplication.";
}

function getCloneProfileLabel(items: CloneItem[], language: AppLanguage) {
  const detectedCount = items.filter((item) => item.detected).length;

  if (detectedCount === 0) return language === "ar" ? "لا توجد إشارة نسخ نشطة" : "No active clone signature";
  if (items.some((item) => item.name === "Exact Clone" && item.detected)) return language === "ar" ? "ملف نسخ مباشر" : "Direct duplication profile";
  if (items.some((item) => item.name === "Semantic Clone" && item.detected)) return language === "ar" ? "ملف تكافؤ متحوّل" : "Transformed-but-equivalent profile";
  if (detectedCount >= 4) return language === "ar" ? "ملف إعادة استخدام متعدد الأنماط" : "Multi-pattern reuse profile";
  return language === "ar" ? "ملف إعادة استخدام انتقائي" : "Selective reuse profile";
}

function getCloneFocus(items: CloneItem[], language: AppLanguage) {
  const detectedItems = items
    .filter((item) => item.detected)
    .sort((left, right) => (clonePriority[right.name] ?? 0) - (clonePriority[left.name] ?? 0));

  if (!detectedItems.length) {
    return language === "ar" ? "لم يتم تفعيل أي عائلة نسخ في هذه الجولة." : "No clone families were activated in this run.";
  }

  return detectedItems.slice(0, 3).map((item) => translateCloneName(item.name, language)).join(" • ");
}

function CloneDetection({ items }: { items: CloneItem[] }) {
  const { language } = useLanguage();
  const detectedItems = items.filter((item) => item.detected);
  const detectedCount = detectedItems.length;
  const undetectedCount = items.length - detectedCount;
  const coverage = items.length ? Math.round((detectedCount / items.length) * 100) : 0;
  const cloneTypeMeta = getCloneTypeMeta(language);
  const sortedItems = [...items].sort((left, right) => {
    const detectedDelta = Number(right.detected) - Number(left.detected);
    if (detectedDelta !== 0) return detectedDelta;
    return (clonePriority[right.name] ?? 0) - (clonePriority[left.name] ?? 0);
  });

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitCompare className="h-4 w-4 text-primary" />
              {language === "ar" ? "كشف أنواع النسخ" : "Clone-Type Detection"}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {summarizeCloneProfile(items, language)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={detectedCount > 0 ? "badge-warning" : "badge-success"}>
              {detectedCount} {language === "ar" ? "مكتشف" : "detected"}
            </span>
            <span className="badge-info">{undetectedCount} {language === "ar" ? "غير مكتشف" : "not detected"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border/50 p-5 xl:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            {language === "ar" ? "ملف النسخ" : "Clone profile"}
          </p>
          <p className="mt-3 text-base font-semibold text-foreground">
            {getCloneProfileLabel(items, language)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {language === "ar"
              ? "هذا هو التفسير الأبرز لأدلة النسخ التي رفعتها المقارنة الحالية."
              : "This is the dominant interpretation of the clone evidence raised by the current comparison."}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
              {language === "ar" ? "تغطية الاكتشاف" : "Detection coverage"}
            </p>
            <span className={detectedCount > 0 ? "badge-warning" : "badge-success"}>
              {coverage}%
            </span>
          </div>
          <div className="metric-bar-track mt-3 w-full">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                detectedCount > 0 ? "bg-gradient-to-r from-warning to-warning/70" : "bg-gradient-to-r from-success to-success/70",
              )}
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {language === "ar"
              ? `تم تفعيل ${detectedCount} من أصل ${items.length} عائلات نسخ في هذه الجولة.`
              : `${detectedCount} of ${items.length} clone families were activated in this run.`}
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            {language === "ar" ? "أقوى الإشارات" : "Strongest signals"}
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {getCloneFocus(items, language)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {language === "ar"
              ? "تُعرض الفئات الأكثر دلالة أولًا حتى يفهم المراجع نمط التشابه بسرعة."
              : "The most meaningful detected categories are surfaced first so reviewers can understand the similarity pattern quickly."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {sortedItems.map((item) => {
          const meta = cloneTypeMeta[item.name] ?? {
            summary: "This clone category is part of the detection model used for the current comparison.",
            detectedMeaning: "The engine found evidence for this clone pattern in the current result.",
            absentMeaning: "The engine did not find enough evidence for this clone pattern in the current result.",
            family: "General signal",
            whyItMatters: "This category helps explain how the two sources may relate when viewed through clone-pattern analysis.",
          };

          return (
            <div
              key={item.name}
              className={cn(
                "rounded-xl border p-4 transition-all duration-200",
                item.detected
                  ? "border-warning/30 bg-warning/5"
                  : "border-border/40 bg-muted/10",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                    item.detected
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border/50 bg-muted/30 text-muted-foreground/60",
                  )}
                >
                  {item.detected ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-info">{meta.family}</span>
                    <h4 className={cn("text-sm font-semibold", item.detected ? "text-warning" : "text-foreground")}>{translateCloneName(item.name, language)}</h4>
                    <span className={item.detected ? "badge-warning" : "badge-info"}>
                      {item.detected ? (language === "ar" ? "مكتشف" : "Detected") : language === "ar" ? "غير مكتشف" : "Not detected"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.summary}</p>

                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/85">
                    <span className={cn("font-semibold", item.detected ? "text-warning" : "text-foreground/85")}>
                      {item.detected ? (language === "ar" ? "التفسير:" : "Interpretation:") : language === "ar" ? "القراءة:" : "Reading:"}
                    </span>{" "}
                    {item.detected ? meta.detectedMeaning : meta.absentMeaning}
                  </p>

                  <div className="mt-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                    <p className="text-[11px] font-semibold text-foreground/90">{language === "ar" ? "لماذا يهم" : "Why it matters"}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                      {meta.whyItMatters}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CodeComparisonPanel({
  result,
  description,
}: {
  result: AnalysisResult;
  description?: string;
}) {
  const { language } = useLanguage();
  const resolvedDescription =
    description ||
    (language === "ar"
      ? "راجع المصدرين البرمجيين مباشرة إلى جانب النتائج التحليلية."
      : "Review both submitted sources directly alongside the analytical findings.");

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Code2 className="h-4 w-4 text-primary" />
          {language === "ar" ? "مقارنة الشيفرة المصدرية" : "Source Code Comparison"}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-2">
        {[
          { title: result.source_labels.code1, code: result.code1, tone: "primary" },
          { title: result.source_labels.code2, code: result.code2, tone: "accent" },
        ].map((source, index) => (
          <div key={source.title + index} className="overflow-hidden rounded-xl border border-border/50 bg-muted/10">
            <div className="border-b border-border/50 bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", source.tone === "primary" ? "bg-primary" : "bg-accent")} />
                <span className="text-xs font-medium text-foreground">{source.title}</span>
              </div>
            </div>
            <pre className="code-surface m-4 max-h-[680px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed scrollbar-thin">
              <code>{source.code}</code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatQualityAnalysis(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value.trim() ? value : fallback;
  }

  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return `Unable to generate quality report: ${(value as { error: string }).error}`;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

type QualitySeverity = "critical" | "warning" | "style" | "info";

type QualityIssue = {
  rawType: string;
  severity: QualitySeverity;
  symbol: string | null;
  message: string;
  line: number | null;
  column: number | null;
};

type QualityReport = {
  text: string;
  issues: QualityIssue[];
  score: number | null;
  ratingLine: string | null;
  generalNotes: string[];
  counts: Record<QualitySeverity, number>;
  dominantSymbols: string[];
  statusTone: "excellent" | "healthy" | "watch" | "critical" | "neutral";
  headline: string;
  summary: string;
};

const qualitySeverityMeta: Record<
  QualitySeverity,
  {
    label: string;
    icon: typeof AlertTriangle;
    badgeClass: string;
    iconClass: string;
    cardClass: string;
  }
> = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    badgeClass: "badge-error",
    iconClass: "border-destructive/30 bg-destructive/10 text-destructive",
    cardClass: "border-destructive/18 bg-destructive/[0.04]",
  },
  warning: {
    label: "Warning",
    icon: ShieldAlert,
    badgeClass: "badge-warning",
    iconClass: "border-warning/30 bg-warning/10 text-warning",
    cardClass: "border-warning/18 bg-warning/[0.04]",
  },
  style: {
    label: "Style",
    icon: FileText,
    badgeClass: "badge-info",
    iconClass: "border-primary/25 bg-primary/10 text-primary",
    cardClass: "border-primary/16 bg-primary/[0.04]",
  },
  info: {
    label: "Info",
    icon: TrendingUp,
    badgeClass: "badge-info",
    iconClass: "border-accent/25 bg-accent/10 text-accent",
    cardClass: "border-accent/16 bg-accent/[0.04]",
  },
};

function getQualitySeverity(rawType: string): QualitySeverity {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "fatal" || normalized === "error") {
    return "critical";
  }
  if (normalized === "warning" || normalized === "refactor") {
    return "warning";
  }
  if (normalized === "convention") {
    return "style";
  }
  return "info";
}

function buildQualityHeadline(statusTone: QualityReport["statusTone"], totalFindings: number, sourceName: string, language: AppLanguage) {
  if (totalFindings === 0) {
    if (statusTone === "healthy" || statusTone === "excellent") {
      return language === "ar" ? `${sourceName} نظيف حاليًا` : `${sourceName} is currently clean`;
    }
    return language === "ar" ? `${sourceName} لا يحتوي على ملاحظات منظمة` : `${sourceName} has no structured findings`;
  }

  if (statusTone === "critical") {
    return language === "ar" ? `${sourceName} يحتاج معالجة فورية` : `${sourceName} needs immediate cleanup`;
  }
  if (statusTone === "watch") {
    return language === "ar" ? `${sourceName} يظهر تراجعًا ملحوظًا في الجودة` : `${sourceName} has notable quality drift`;
  }
  if (statusTone === "excellent") {
    return language === "ar" ? `${sourceName} في حالة قوية` : `${sourceName} is in strong shape`;
  }
  return language === "ar" ? `${sourceName} يحتاج مراجعة خفيفة` : `${sourceName} needs light review`;
}

function parseQualityReport(rawValue: unknown, sourceName: string, fallback: string, language: AppLanguage): QualityReport {
  const text = formatQualityAnalysis(rawValue, fallback);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts: Record<QualitySeverity, number> = {
    critical: 0,
    warning: 0,
    style: 0,
    info: 0,
  };
  const issues: QualityIssue[] = [];
  const generalNotes: string[] = [];
  let score: number | null = null;
  let ratingLine: string | null = null;

  for (const line of lines) {
    const scoreMatch = line.match(/Your code has been rated at\s+(-?\d+(?:\.\d+)?)\/10/i);
    if (scoreMatch) {
      score = Number.parseFloat(scoreMatch[1]);
      ratingLine = line;
      continue;
    }

    const issueMatch = line.match(/^([A-Za-z]+)\s+\[([^\]]+)\]:\s+(.*?)(?:\s+\(Line\s+(\d+)(?:,\s+Column\s+(\d+))?\))?$/);
    if (issueMatch) {
      const [, rawType, symbol, message, lineNumber, columnNumber] = issueMatch;
      const severity = getQualitySeverity(rawType);
      counts[severity] += 1;
      issues.push({
        rawType,
        severity,
        symbol: symbol || null,
        message,
        line: lineNumber ? Number.parseInt(lineNumber, 10) : null,
        column: columnNumber ? Number.parseInt(columnNumber, 10) : null,
      });
      continue;
    }

    generalNotes.push(line);
  }

  const totalFindings = issues.length;
  const dominantSymbols = Array.from(
    issues.reduce((map, issue) => {
      if (!issue.symbol) return map;
      map.set(issue.symbol, (map.get(issue.symbol) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([symbol]) => symbol);

  let statusTone: QualityReport["statusTone"] = "neutral";
  if (score !== null) {
    if (score >= 8.5) statusTone = "excellent";
    else if (score >= 7) statusTone = "healthy";
    else if (score >= 5) statusTone = "watch";
    else statusTone = "critical";
  } else if (counts.critical > 0) {
    statusTone = "critical";
  } else if (counts.warning > 0) {
    statusTone = "watch";
  } else if (totalFindings === 0 && generalNotes.length === 0) {
    statusTone = "healthy";
  } else if (totalFindings > 0) {
    statusTone = "healthy";
  }

  const summary =
    totalFindings > 0
      ? language === "ar"
        ? `تم تحديد ${counts.critical} ملاحظات حرجة و${counts.warning} تحذيرات و${counts.style} ملاحظات أسلوبية و${counts.info} ملاحظات معلوماتية.`
        : `${counts.critical} critical, ${counts.warning} warning, ${counts.style} style, and ${counts.info} informational findings were identified.`
      : generalNotes[0] || (language === "ar" ? "لم يتم الإبلاغ عن ملاحظات منظّمة من أداة الفحص لهذا المصدر." : "No structured linter findings were reported for this source.");

  return {
    text,
    issues,
    score,
    ratingLine,
    generalNotes,
    counts,
    dominantSymbols,
    statusTone,
    headline: buildQualityHeadline(statusTone, totalFindings, sourceName, language),
    summary,
  };
}

function getQualityToneMeta(statusTone: QualityReport["statusTone"], language: AppLanguage) {
  if (statusTone === "excellent") {
    return {
      badgeClass: "badge-success",
      containerClass: "border-success/20 bg-[radial-gradient(circle_at_top_right,rgba(22,163,74,0.16),transparent_45%),linear-gradient(180deg,rgba(22,163,74,0.04),rgba(10,14,25,0.22))]",
      scoreClass: "text-success",
      label: language === "ar" ? "ممتاز" : "Excellent",
      icon: ShieldCheck,
    };
  }
  if (statusTone === "healthy") {
    return {
      badgeClass: "badge-success",
      containerClass: "border-success/14 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_45%),linear-gradient(180deg,rgba(34,197,94,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-success",
      label: language === "ar" ? "سليم" : "Healthy",
      icon: CheckCircle2,
    };
  }
  if (statusTone === "watch") {
    return {
      badgeClass: "badge-warning",
      containerClass: "border-warning/18 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_45%),linear-gradient(180deg,rgba(245,158,11,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-warning",
      label: language === "ar" ? "يحتاج مراجعة" : "Needs Review",
      icon: ShieldAlert,
    };
  }
  if (statusTone === "critical") {
    return {
      badgeClass: "badge-error",
      containerClass: "border-destructive/18 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.12),transparent_45%),linear-gradient(180deg,rgba(239,68,68,0.03),rgba(10,14,25,0.22))]",
      scoreClass: "text-destructive",
      label: language === "ar" ? "مخاطرة مرتفعة" : "High Risk",
      icon: AlertTriangle,
    };
  }
  return {
    badgeClass: "badge-info",
    containerClass: "border-border/60 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_45%),linear-gradient(180deg,rgba(99,102,241,0.03),rgba(10,14,25,0.22))]",
    scoreClass: "text-foreground",
    label: language === "ar" ? "عرض تشخيصي" : "Diagnostic View",
    icon: FileText,
  };
}

function QualitySourceCard({
  title,
  accentClass,
  report,
}: {
  title: string;
  accentClass: string;
  report: QualityReport;
}) {
  const { language } = useLanguage();
  const totalFindings = report.issues.length;
  const toneMeta = getQualityToneMeta(report.statusTone, language);
  const ToneIcon = toneMeta.icon;
  const topIssues = report.issues.slice(0, 8);
  const severityLabels =
    language === "ar"
      ? { critical: "حرج", warning: "تحذير", style: "أسلوب", info: "معلومة" }
      : { critical: "Critical", warning: "Warning", style: "Style", info: "Info" };

  return (
    <div className={cn("card-premium overflow-hidden border", toneMeta.containerClass)}>
      <div className="border-b border-border/50 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor]", accentClass)} />
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <span className={toneMeta.badgeClass}>{toneMeta.label}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{report.headline}</p>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
            </div>
          </div>

          <div className="min-w-[168px] rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-right shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/75">
                {language === "ar" ? "نقاط الجودة" : "Quality Score"}
              </span>
              <ToneIcon className={cn("h-4 w-4", toneMeta.scoreClass)} />
            </div>
            <div className={cn("mt-3 text-4xl font-bold tracking-tight", toneMeta.scoreClass)}>
              {report.score !== null ? report.score.toFixed(1) : "—"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {report.ratingLine
                ? language === "ar"
                  ? "مستخرجة من تقييم pylint."
                  : "Derived from pylint rating output."
                : language === "ar"
                  ? "مبنية على التشخيص النصي فقط."
                  : "Based on textual diagnostics only."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border/50 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "الملاحظات" : "Findings"}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{totalFindings}</p>
          <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "عناصر منظّمة مستخرجة من تقرير الجودة." : "Structured items extracted from the quality report."}</p>
        </div>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.04] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "حرج" : "Critical"}</p>
          <p className="mt-3 text-2xl font-semibold text-destructive">{report.counts.critical}</p>
          <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "أخطاء ومشكلات حرجة قد تكسر السلوك." : "Errors and fatal findings that can break behavior."}</p>
        </div>
        <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "التحذيرات" : "Warnings"}</p>
          <p className="mt-3 text-2xl font-semibold text-warning">{report.counts.warning + report.counts.style}</p>
          <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "تحذيرات وملاحظات إعادة هيكلة وديون أسلوبية تحتاج إلى تنظيف." : "Warnings, refactors, and style debt that need cleanup."}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "الإشارات المهيمنة" : "Dominant Signals"}</p>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {report.dominantSymbols.length ? report.dominantSymbols.join(" • ") : language === "ar" ? "لا يوجد نمط قواعد متكرر" : "No repeated rule pattern"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "معرّفات القواعد الأكثر تكرارًا في مراجعة هذا المصدر." : "The most recurring rule IDs in this source review."}</p>
        </div>
      </div>

      <div className="p-5">
        {topIssues.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">{language === "ar" ? "الملاحظات ذات الأولوية" : "Priority Findings"}</h4>
            </div>
            <div className="space-y-3">
              {topIssues.map((issue, index) => {
                const meta = qualitySeverityMeta[issue.severity];
                const IssueIcon = meta.icon;
                return (
                  <div key={`${issue.symbol ?? issue.message}-${index}`} className={cn("rounded-2xl border p-4 transition-all duration-200", meta.cardClass)}>
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", meta.iconClass)}>
                        <IssueIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={meta.badgeClass}>{severityLabels[issue.severity]}</span>
                          {issue.symbol && <span className="badge-info">{issue.symbol}</span>}
                          {(issue.line !== null || issue.column !== null) && (
                            <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                              {issue.line !== null ? (language === "ar" ? `السطر ${issue.line}` : `Line ${issue.line}`) : language === "ar" ? "السطر —" : "Line —"}
                              {issue.column !== null ? language === "ar" ? `، العمود ${issue.column}` : `, Column ${issue.column}` : ""}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">{issue.message}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/85">
                          {language === "ar" ? "تم الإبلاغ عنها من أداة الفحص بصفتها" : "Reported by the linter as"}{" "}
                          <span className="font-semibold text-foreground/85">{issue.rawType}</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-success/18 bg-success/[0.05] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{language === "ar" ? "لم تظهر ملاحظات منظّمة" : "No structured findings surfaced"}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {report.generalNotes[0] || (language === "ar" ? "لم يُنتج هذا المصدر أي ملاحظات منظّمة في تمريرة الجودة الحالية." : "This source did not produce any structured linter findings in the current quality pass.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {(report.generalNotes.length > 0 || report.text) && (
          <details className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-background/35">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
              {language === "ar" ? "التقرير التشخيصي الخام" : "Raw Diagnostic Report"}
            </summary>
            <div className="border-t border-border/40 px-4 py-4">
              {report.generalNotes.length > 0 && (
                <div className="mb-3 space-y-2">
                  {report.generalNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {note}
                    </div>
                  ))}
                </div>
              )}
              <pre className="code-surface max-h-[320px] overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed scrollbar-thin">
                {report.text}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function QualityPanel({ result }: { result: AnalysisResult }) {
  const { language } = useLanguage();
  const sourceReports = [
    {
      id: "A",
      title: language === "ar" ? "مراجعة جودة المصدر A" : "Source A Quality Review",
      accentClass: "bg-primary text-primary",
      report: parseQualityReport(
        result.code_smell.code1_analysis,
        language === "ar" ? "المصدر A" : "Source A",
        language === "ar" ? "لم يتم إرجاع ملاحظات جودة للمصدر A." : "No quality notes were returned for Source A.",
        language,
      ),
    },
    {
      id: "B",
      title: language === "ar" ? "مراجعة جودة المصدر B" : "Source B Quality Review",
      accentClass: "bg-accent text-accent",
      report: parseQualityReport(
        result.code_smell.code2_analysis,
        language === "ar" ? "المصدر B" : "Source B",
        language === "ar" ? "لم يتم إرجاع ملاحظات جودة للمصدر B." : "No quality notes were returned for Source B.",
        language,
      ),
    },
  ] as const;

  const totalFindings = sourceReports.reduce((sum, source) => sum + source.report.issues.length, 0);
  const averageScore =
    sourceReports.every((source) => source.report.score !== null)
      ? sourceReports.reduce((sum, source) => sum + (source.report.score ?? 0), 0) / sourceReports.length
      : null;
  const healthierSource = [...sourceReports].sort((left, right) => {
    const leftScore = left.report.score ?? -1;
    const rightScore = right.report.score ?? -1;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return left.report.issues.length - right.report.issues.length;
  })[0];

  return (
    <div className="space-y-5">
      <div className="card-premium overflow-hidden border-primary/16 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.10),transparent_36%),linear-gradient(180deg,rgba(99,102,241,0.04),rgba(10,14,25,0.18))]">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-info">{language === "ar" ? "ذكاء الجودة" : "Quality Intelligence"}</span>
              <span className="badge-info">{language === "ar" ? "مراجعة مدفوعة بأداة الفحص" : "Linter-driven review"}</span>
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{language === "ar" ? "تشخيصات جودة أوضح لكلا المصدرين" : "Cleaner quality diagnostics for both sources"}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {language === "ar"
                ? "يعرض هذا القسم أهم الملاحظات أولًا، ويلخّص توزيع الخطورة، ويُبقي التقرير الخام متاحًا فقط عند الحاجة إلى الفحص العميق."
                : "This view now surfaces the most important findings first, summarizes severity distribution, and keeps the raw diagnostic output available only when you need deep inspection."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "إجمالي الملاحظات" : "Total Findings"}</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{totalFindings}</p>
              <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "ملاحظات منظّمة عبر مراجعة المصدرين." : "Structured issues across both source reviews."}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "متوسط النقاط" : "Average Score"}</p>
              <p className={cn("mt-3 text-3xl font-semibold", averageScore !== null && averageScore >= 7 ? "text-success" : averageScore !== null && averageScore >= 5 ? "text-warning" : averageScore !== null ? "text-destructive" : "text-foreground")}>
                {averageScore !== null ? averageScore.toFixed(1) : "—"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{language === "ar" ? "يظهر فقط عندما يتضمن التقريرين تقييمات رقمية من pylint." : "Only shown when both reports include numeric pylint ratings."}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">{language === "ar" ? "المصدر الأصح" : "Healthier Source"}</p>
              <p className="mt-3 text-sm font-semibold text-foreground">{healthierSource.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {healthierSource.report.score !== null
                  ? language === "ar"
                    ? `أعلى نقطة جودة حالية: ${healthierSource.report.score.toFixed(1)}/10`
                    : `Highest current quality score: ${healthierSource.report.score.toFixed(1)}/10`
                  : language === "ar"
                    ? "تم اختياره لأنه يحمل أثرًا أخف من الملاحظات في التشخيص الحالي."
                    : "Chosen by the lighter issue footprint in the current diagnostics."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {sourceReports.map((source) => (
          <QualitySourceCard
            key={source.id}
            title={source.title}
            accentClass={source.accentClass}
            report={source.report}
          />
        ))}
      </div>
    </div>
  );
}

const Results = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentResult, loadCurrent, loadById, rerunById, clearCurrentResult } = useAnalysis();
  const { language, localizeRuntimeMessage, getProgrammingLanguageLabel } = useLanguage();
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const tabs = useMemo(() => getTabs(language), [language]);
  const copy =
    language === "ar"
      ? {
          invalidId: "معرّف التحليل غير صالح.",
          noSavedOrActive: "لا يوجد تحليل محفوظ أو نشط حتى الآن.",
          unableToLoad: "تعذر تحميل نتيجة التحليل.",
          unableToRerun: "تعذر إعادة تشغيل هذا التحليل.",
          loading: "جارٍ تحميل نتائج التحليل...",
          emptyTitle: "لا يوجد تحليل محمّل",
          unableToLoadTitle: "تعذر تحميل التحليل",
          emptyDescription: "شغّل مقارنة جديدة أو أعد فتح تحليل من السجل لملء مساحة النتائج الكاملة.",
          startAnalysis: "ابدأ التحليل",
          openHistory: "فتح السجل",
          title: "نتائج التحليل",
          saved: "محفوظ",
          autoSaveUnavailable: "الحفظ التلقائي غير متاح",
          export: "تصدير",
          exportPdf: "تصدير PDF",
          exportJson: "تصدير JSON",
          exportTxt: "تصدير TXT",
          rerun: "إعادة التشغيل",
          similarity: "التشابه",
          summaryDescription: "تجمع هذه النتيجة إشارات تشابه النص والتوكنات والرسم وأنماط النسخ والذكاء الاصطناعي في مساحة مراجعة واحدة لفحص البنية والسرد الداعم معًا.",
          overviewDescription: "استعرض المصدرين مباشرة داخل النظرة العامة قبل الانتقال عبر مؤشرات التشابه وأدلة النسخ والسرد الذكي.",
          graph1: "جراف الشيفرة 1",
          graph2: "جراف الشيفرة 2",
        }
      : {
          invalidId: "Invalid analysis identifier.",
          noSavedOrActive: "No saved or active analysis is available yet.",
          unableToLoad: "Unable to load the analysis result.",
          unableToRerun: "Unable to rerun this analysis.",
          loading: "Loading analysis results…",
          emptyTitle: "No analysis loaded",
          unableToLoadTitle: "Unable to load analysis",
          emptyDescription: "Run a fresh comparison or reopen one from history to populate the full results workspace.",
          startAnalysis: "Start Analysis",
          openHistory: "Open History",
          title: "Analysis Results",
          saved: "Saved",
          autoSaveUnavailable: "Auto-save unavailable",
          export: "Export",
          exportPdf: "Export PDF",
          exportJson: "Export JSON",
          exportTxt: "Export TXT",
          rerun: "Re-run",
          similarity: "Similarity",
          summaryDescription: "This result combines text, token, graph, clone-pattern, and AI similarity signals into a single review surface so you can inspect structure and narrative evidence together.",
          overviewDescription: "Inspect both source inputs directly inside the overview before moving through similarity signals, clone evidence, and the AI narrative.",
          graph1: "Code 1 Graph",
          graph2: "Code 2 Graph",
        };

  const requestedId = searchParams.get("analysisId");

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      setError("");
      setIsLoading(true);
      try {
        if (requestedId) {
          const numericId = Number(requestedId);
          if (Number.isNaN(numericId) || numericId <= 0) {
            throw new Error(copy.invalidId);
          }

          if (currentResult?.saved_analysis_id !== numericId) {
            await loadById(numericId);
          }
          return;
        }

        if (!currentResult) {
          const loaded = await loadCurrent();
          if (!loaded && isMounted) {
            setError(copy.noSavedOrActive);
          }
        }
      } catch (loadError) {
        if (isMounted) {
          clearCurrentResult();
          setError(loadError instanceof Error ? localizeRuntimeMessage(loadError.message) : copy.unableToLoad);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [requestedId, currentResult, loadById, loadCurrent, clearCurrentResult, copy.invalidId, copy.noSavedOrActive, copy.unableToLoad, localizeRuntimeMessage]);

  const requestedAnalysisId = requestedId ? Number(requestedId) : null;
  const result = requestedId
    ? Number.isFinite(requestedAnalysisId) && currentResult?.saved_analysis_id === requestedAnalysisId
      ? currentResult
      : null
    : currentResult;
  const overallScore = result ? getCombinedScore(result) : 0;
  const scoreTone = getScoreTone(overallScore, language);
  const overallScoreLabel = overallScore.toFixed(1);
  const isCompactOverallScore = overallScoreLabel.length >= 5;

  const handleRerun = async () => {
    if (!result?.saved_analysis_id) {
      navigate("/analysis");
      return;
    }

    setIsLoading(true);
    try {
      await rerunById(result.saved_analysis_id);
      setActiveTab("overview");
    } catch (rerunError) {
      setError(rerunError instanceof Error ? localizeRuntimeMessage(rerunError.message) : copy.unableToRerun);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          {copy.loading}
        </div>
      </div>
    );
  }

  if (!result) {
    const emptyStateTitle = error && !error.startsWith(copy.noSavedOrActive) ? copy.unableToLoadTitle : copy.emptyTitle;
    const emptyStateDescription = error || copy.emptyDescription;

    return (
      <div className="card-premium mx-auto max-w-2xl p-10 text-center">
        <h2 className="text-2xl font-bold text-foreground">{emptyStateTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {emptyStateDescription}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/analysis">{copy.startAnalysis}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/history">{copy.openHistory}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" ref={resultRef}>
      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/analysis">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{copy.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.source_labels.code1} ↔ {result.source_labels.code2} · {getProgrammingLanguageLabel(result.language)}
              {result.saved_analysis_id ? ` · ${copy.saved} #${result.saved_analysis_id}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-success/30 text-success" disabled>
            <Bookmark className="h-3.5 w-3.5 fill-success" />
            {result.saved_analysis_id ? copy.saved : copy.autoSaveUnavailable}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/8 hover:border-primary/60"
            onClick={() => setPdfOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            {copy.exportPdf}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-border/60">
                <Download className="h-3.5 w-3.5" />
                {copy.export}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAsJson(result)}>{copy.exportJson}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAsText(result, language)}>{copy.exportTxt}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void handleRerun()} disabled={isLoading}>
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.rerun}
          </Button>
        </div>
      </div>

      <div className="card-premium flex flex-wrap items-center gap-6 px-6 py-5">
        <div className="relative h-24 w-24 shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="transparent"
              stroke={overallScore >= 80 ? "hsl(var(--destructive))" : overallScore >= 50 ? "hsl(var(--warning))" : "hsl(var(--success))"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={2 * Math.PI * 34 * (1 - overallScore / 100)}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-[13px] flex flex-col items-center justify-center rounded-full border border-border/50 bg-background/85 shadow-[inset_0_1px_0_hsl(var(--background)/0.9),0_10px_24px_hsl(var(--background)/0.22)] backdrop-blur-[2px]">
            <div className="flex items-end justify-center leading-none">
              <span
                className={cn(
                  "tabular-nums font-bold tracking-[-0.06em]",
                  isCompactOverallScore ? "text-[1.28rem]" : "text-[1.45rem]",
                  scoreTone.color,
                )}
              >
                {overallScoreLabel}
              </span>
              <span className={cn("mb-0.5 text-[0.72rem] font-semibold", scoreTone.color)}>%</span>
            </div>
            <span className="mt-1 text-[0.52rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{copy.similarity}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-lg font-bold", scoreTone.color)}>{scoreTone.label}</span>
            <span className={scoreTone.badge}>{getProgrammingLanguageLabel(result.language)}</span>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {copy.summaryDescription}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {result.similarity_items.slice(0, 3).map((item) => (
            <div key={item.name} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-center">
              <div className="text-sm font-bold text-foreground">{item.value.toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground">{translateSimilarityName(item.name, language)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-all",
                activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="animate-fade-in-fast">
        {activeTab === "overview" && (
          <div className="space-y-5">
            <CodeComparisonPanel
              result={result}
              description={copy.overviewDescription}
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SimilarityBars items={result.similarity_items} />
              <SimilarityRadar items={result.similarity_items} />
            </div>
            <CloneDetection items={result.clone_items} />
          </div>
        )}

        {activeTab === "diff" && (
          <DiffViewer
            analysisId={result.saved_analysis_id}
            labelA={result.source_labels.code1}
            labelB={result.source_labels.code2}
          />
        )}

        {activeTab === "graphs" && (
          <div className="grid gap-5 xl:grid-cols-2">
            <AstGraphPanel title={copy.graph1} color="primary" elements={result.graph_json1} />
            <AstGraphPanel title={copy.graph2} color="accent" elements={result.graph_json2} />
          </div>
        )}

        {activeTab === "metrics" && <MetricsComparison metricsA={result.metrics1} metricsB={result.metrics2} />}

        {activeTab === "quality" && <QualityPanel result={result} />}

        {activeTab === "report" && (
          <div className="space-y-6">
            {result.analysis_structured && (
              <StructuredReport data={result.analysis_structured} />
            )}
            <AnalysisReport html={result.analysis_html} />
          </div>
        )}

        {activeTab === "chat" && (
          <AnalysisChatPanel contextLabel={`${result.source_labels.code1} ↔ ${result.source_labels.code2}`} />
        )}
      </div>

      <PdfExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={result}
      />
    </div>
  );
};

export default Results;
