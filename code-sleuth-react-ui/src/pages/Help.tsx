import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  FileQuestion,
  HelpCircle,
  Mail,
  MessageSquare,
  BookOpen,
  ExternalLink,
  Code2,
  GitCompare,
  Shield,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

const Help = () => {
  const { language } = useLanguage();
  const copy =
    language === "ar"
      ? {
          faqItems: [
            {
              q: "ما لغات البرمجة المدعومة؟",
              a: "يدعم CodeSimilar لغات Java وJavaScript وTypeScript وPython وC/C++ وC# وGo وRuby وPHP وSwift وKotlin. كما يستطيع التحليل الدلالي والمدعوم بالذكاء الاصطناعي اكتشاف الأنماط عبر لغات مختلفة.",
            },
            {
              q: "كيف يعمل كشف النسخ؟",
              a: "يعتمد النظام على أربع طبقات: تحليل التوكنات للنسخ من النوعين 1 و2، وتشابه النص للنسخ القريبة، ومقارنة رسم AST للأنماط البنيوية، والتحليل الدلالي بالذكاء الاصطناعي للشيفرات المتكافئة وظيفيًا رغم اختلافها نحويًا.",
            },
            {
              q: "ما أنواع الملفات التي يمكنني رفعها؟",
              a: "ملفات برمجية فردية (.java و.js و.ts و.py وغيرها)، أو أرشيفات ZIP لمشاريع كاملة، أو ملفات Excel/CSV تحتوي على مقاطع برمجية مع إمكانية اختيار الصف.",
            },
            {
              q: "كيف تُحسب نسبة التشابه؟",
              a: "النسبة الكلية هي متوسط موزون لنتائج التوكنات والنص ورسم AST والتشابه المدعوم بالذكاء الاصطناعي. يتم تحديد الأوزان ديناميكيًا وفق خصائص الشيفرة لتحقيق أعلى دقة ممكنة.",
            },
            {
              q: "هل يمكنني دمج النظام مع مسار CI/CD؟",
              a: "نعم. يوفّر CodeSimilar واجهات API يمكنك استدعاؤها من أي نظام CI/CD. ويمكنك ضبط حدود للتشابه تؤدي إلى فشل البناء عند تجاوز التكرار المستوى المقبول.",
            },
            {
              q: "هل شيفرتي آمنة عند رفعها؟",
              a: "تُشفَّر الشيفرة أثناء النقل والتخزين، ولا نشاركها مع أي طرف ثالث. ويمكن لعملاء المؤسسات طلب نشر داخلي كامل للحفاظ على سيادة البيانات.",
            },
          ],
          supportCards: [
            {
              icon: BookOpen,
              title: "التوثيق",
              desc: "أدلة شاملة ومراجع API وشروحات تكامل مفصلة.",
              action: "استعرض التوثيق",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: MessageSquare,
              title: "الدردشة المباشرة",
              desc: "دعم فوري من فريقنا التقني، وغالبًا يكون الرد خلال دقائق.",
              action: "ابدأ الدردشة",
              color: "text-success",
              bg: "bg-success/10",
              href: "/chat",
            },
            {
              icon: Mail,
              title: "الدعم عبر البريد",
              desc: "مساعدة مفصلة للمشكلات المعقدة، وعادةً يكون الرد خلال يوم عمل واحد.",
              action: "أرسل بريدًا",
              color: "text-accent",
              bg: "bg-accent/10",
            },
          ],
          quickLinks: [
            { icon: Code2, label: "شغّل تحليلًا جديدًا", href: "/analysis" },
            { icon: GitCompare, label: "اعرض نتائج نموذجية", href: "/results" },
            { icon: Shield, label: "الأسئلة الأمنية", href: "#faq" },
            { icon: Zap, label: "دليل تكامل API", href: "#faq" },
          ],
          title: "المساعدة والدعم",
          description: "اعثر على الإجابات، واقرأ التوثيق، أو تواصل مع فريق الدعم.",
          quickLinksTitle: "روابط سريعة",
          faqTitle: "الأسئلة الشائعة",
        }
      : {
          faqItems: [
            {
              q: "What programming languages are supported?",
              a: "CodeSimilar supports Java, JavaScript, TypeScript, Python, C/C++, C#, Go, Ruby, PHP, Swift, and Kotlin. Semantic and AI-based analysis can detect patterns across different languages.",
            },
            {
              q: "How does clone detection work?",
              a: "The system uses four layers: token-based analysis for Type 1 & 2 clones, text similarity for near-duplicates, AST graph comparison for structural patterns, and AI-driven semantic analysis for functionally equivalent but syntactically different code.",
            },
            {
              q: "What file types can I upload?",
              a: "Individual code files (.java, .js, .ts, .py, etc.), ZIP archives of full projects, or Excel/CSV files containing code snippets with configurable row selection.",
            },
            {
              q: "How is the similarity score calculated?",
              a: "The overall score is a weighted average of token, text, AST graph, and AI similarity scores. Weights are determined dynamically based on code characteristics to maximize accuracy.",
            },
            {
              q: "Can I integrate this with my CI/CD pipeline?",
              a: "Yes. CodeSimilar exposes API endpoints you can call from any CI/CD system. Set similarity thresholds to fail builds when code duplication exceeds acceptable levels.",
            },
            {
              q: "Is my code secure when I upload it?",
              a: "All code is encrypted in transit and at rest. We never share your code with third parties. Enterprise customers can request on-premises deployment for complete data sovereignty.",
            },
          ],
          supportCards: [
            {
              icon: BookOpen,
              title: "Documentation",
              desc: "Comprehensive guides, API references, and integration tutorials.",
              action: "Browse Docs",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: MessageSquare,
              title: "Live Chat",
              desc: "Real-time support from our technical team — typically responds within minutes.",
              action: "Start Chat",
              color: "text-success",
              bg: "bg-success/10",
              href: "/chat",
            },
            {
              icon: Mail,
              title: "Email Support",
              desc: "Detailed help for complex issues. Usually replied within one business day.",
              action: "Send Email",
              color: "text-accent",
              bg: "bg-accent/10",
            },
          ],
          quickLinks: [
            { icon: Code2, label: "Run New Analysis", href: "/analysis" },
            { icon: GitCompare, label: "View Sample Results", href: "/results" },
            { icon: Shield, label: "Security FAQ", href: "#faq" },
            { icon: Zap, label: "API Integration Guide", href: "#faq" },
          ],
          title: "Help & Support",
          description: "Find answers, read documentation, or contact our support team.",
          quickLinksTitle: "Quick Links",
          faqTitle: "Frequently Asked Questions",
        };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          {copy.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.description}
        </p>
      </div>

      {/* Support cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {copy.supportCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card-premium p-5 space-y-3">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
              {card.href ? (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs border-border/60 gap-1.5">
                  <Link to={card.href}>
                    {card.action}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs border-border/60 gap-1.5">
                  {card.action}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="card-premium p-5">
        <h2 className="text-sm font-semibold mb-4 text-foreground">{copy.quickLinksTitle}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {copy.quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                to={link.href}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/10 px-4 py-3 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary group"
              >
                <Icon className="h-4 w-4 shrink-0 group-hover:text-primary transition-colors" />
                {link.label}
                <ExternalLink className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="card-premium overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{copy.faqTitle}</h2>
        </div>
        <div className="p-5">
          <Accordion type="single" collapsible className="space-y-1" id="faq">
            {copy.faqItems.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border/40 rounded-lg px-4 overflow-hidden">
                <AccordionTrigger className="text-sm font-medium text-foreground hover:text-primary py-3 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
};

export default Help;
