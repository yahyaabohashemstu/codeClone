import type { AnalysisResult } from "@/types/api";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * Client-side PDF export.
 *
 * The project intentionally ships no heavyweight PDF library in the bundle, so
 * we build a self-contained, print-styled HTML document and open it in a new
 * window; the user prints it or chooses "Save as PDF". All user/AI-derived text
 * is HTML-escaped, and the one rich-HTML field (analysis_html) is run through
 * the same DOMPurify sanitizer used everywhere else.
 */

export interface PdfSections {
  cover: boolean;
  executiveSummary: boolean;
  similarityMetrics: boolean;
  cloneDetection: boolean;
  aiStructuredReport: boolean;
  aiAnalysisText: boolean;
  codeQuality: boolean;
  sourceCode: boolean;
}

export const DEFAULT_SECTIONS: PdfSections = {
  cover: true,
  executiveSummary: true,
  similarityMetrics: true,
  cloneDetection: true,
  aiStructuredReport: true,
  aiAnalysisText: true,
  codeQuality: true,
  sourceCode: false,
};

type Lang = "en" | "ar";

const LABELS: Record<Lang, Record<string, string>> = {
  en: {
    title: "Code Similarity Analysis Report",
    generated: "Generated",
    language: "Language",
    execSummary: "Executive Summary",
    verdict: "Verdict",
    risk: "Risk level",
    similarityMetrics: "Similarity Metrics",
    metric: "Metric",
    value: "Value",
    cloneDetection: "Clone Detection",
    type: "Clone type",
    detected: "Detected",
    yes: "Yes",
    no: "No",
    findings: "Findings",
    refactoring: "Refactoring Suggestion",
    aiAnalysis: "AI Analysis",
    codeQuality: "Code Quality",
    source: "Source Code",
    sourceA: "Source A",
    sourceB: "Source B",
    print: "Print / Save as PDF",
  },
  ar: {
    title: "تقرير تحليل تشابه الشيفرة",
    generated: "أُنشئ في",
    language: "اللغة",
    execSummary: "الملخص التنفيذي",
    verdict: "الحكم",
    risk: "مستوى الخطورة",
    similarityMetrics: "مؤشرات التشابه",
    metric: "المؤشر",
    value: "القيمة",
    cloneDetection: "كشف النسخ",
    type: "نوع النسخة",
    detected: "مكتشَف",
    yes: "نعم",
    no: "لا",
    findings: "النتائج",
    refactoring: "اقتراح إعادة الهيكلة",
    aiAnalysis: "تحليل الذكاء الاصطناعي",
    codeQuality: "جودة الشيفرة",
    source: "الشيفرة المصدرية",
    sourceA: "المصدر أ",
    sourceB: "المصدر ب",
    print: "طباعة / حفظ PDF",
  },
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function section(title: string, inner: string): string {
  return `<section><h2>${esc(title)}</h2>${inner}</section>`;
}

export function openPdfReport(result: AnalysisResult, sections: PdfSections, lang: Lang): void {
  const L = LABELS[lang] ?? LABELS.en;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const parts: string[] = [];

  if (sections.cover) {
    parts.push(`
      <header class="cover">
        <h1>${esc(L.title)}</h1>
        <p>${esc(L.generated)}: ${esc(new Date().toLocaleString(lang === "ar" ? "ar" : "en-US"))}</p>
        <p>${esc(L.language)}: ${esc(result.language)}</p>
      </header>`);
  }

  const structured = result.analysis_structured;
  if (sections.executiveSummary && structured) {
    parts.push(
      section(
        L.execSummary,
        `<p><strong>${esc(L.verdict)}:</strong> ${esc(structured.verdict)}</p>` +
          `<p><strong>${esc(L.risk)}:</strong> ${esc(structured.risk_level)}</p>` +
          `<p>${esc(structured.summary)}</p>`,
      ),
    );
  }

  if (sections.similarityMetrics && Array.isArray(result.similarity_items) && result.similarity_items.length) {
    const rows = result.similarity_items
      .map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(Number(item.value).toFixed(2))}%</td></tr>`)
      .join("");
    parts.push(
      section(
        L.similarityMetrics,
        `<table><thead><tr><th>${esc(L.metric)}</th><th>${esc(L.value)}</th></tr></thead><tbody>${rows}</tbody></table>`,
      ),
    );
  }

  if (sections.cloneDetection && Array.isArray(result.clone_items) && result.clone_items.length) {
    const rows = result.clone_items
      .map((item) => `<tr><td>${esc(item.name)}</td><td>${item.detected ? esc(L.yes) : esc(L.no)}</td></tr>`)
      .join("");
    parts.push(
      section(
        L.cloneDetection,
        `<table><thead><tr><th>${esc(L.type)}</th><th>${esc(L.detected)}</th></tr></thead><tbody>${rows}</tbody></table>`,
      ),
    );
  }

  if (sections.aiStructuredReport && structured) {
    const findings = (structured.findings ?? [])
      .map(
        (f) =>
          `<li><strong>[${esc(f.severity)}] ${esc(f.title)}</strong><br/>${esc(f.description)}</li>`,
      )
      .join("");
    parts.push(
      section(
        L.findings,
        (findings ? `<ul>${findings}</ul>` : "") +
          (structured.refactoring_suggestion
            ? `<h3>${esc(L.refactoring)}</h3><p>${esc(structured.refactoring_suggestion)}</p>`
            : ""),
      ),
    );
  }

  if (sections.aiAnalysisText && (result.analysis_html || result.analysis_text)) {
    const inner = result.analysis_html
      ? sanitizeHtml(result.analysis_html)
      : `<pre class="analysis-text">${esc(result.analysis_text)}</pre>`;
    parts.push(section(L.aiAnalysis, `<div class="analysis-html">${inner}</div>`));
  }

  if (sections.codeQuality && result.code_smell) {
    const a = esc(result.code_smell.code1_analysis);
    const b = esc(result.code_smell.code2_analysis);
    parts.push(
      section(
        L.codeQuality,
        `<h3>${esc(L.sourceA)}</h3><pre>${a}</pre><h3>${esc(L.sourceB)}</h3><pre>${b}</pre>`,
      ),
    );
  }

  if (sections.sourceCode) {
    parts.push(
      section(
        L.source,
        `<h3>${esc(result.source_labels?.code1 || L.sourceA)}</h3><pre>${esc(result.code1)}</pre>` +
          `<h3>${esc(result.source_labels?.code2 || L.sourceB)}</h3><pre>${esc(result.code2)}</pre>`,
      ),
    );
  }

  const doc = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/>
<title>${esc(L.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, "Noto Sans Arabic", sans-serif; color: #1a1a1a; margin: 32px; line-height: 1.5; }
  .cover { border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
  .cover h1 { color: #4f46e5; margin: 0 0 8px; font-size: 26px; }
  h2 { color: #4f46e5; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; font-size: 18px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: ${dir === "rtl" ? "right" : "left"}; font-size: 13px; }
  th { background: #f3f4f6; }
  pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 12px; }
  ul { padding-inline-start: 20px; }
  .print-btn { position: fixed; top: 12px; ${dir === "rtl" ? "left" : "right"}: 12px; background: #4f46e5; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  @media print { .print-btn { display: none; } body { margin: 0; } }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">${esc(L.print)}</button>
  ${parts.join("\n")}
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    // Popup blocked — fall back to a downloadable HTML file.
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${result.saved_analysis_id ?? "report"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();
}
