import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  GitCompare,
  MessageSquare,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { HomeResponse } from "@/types/api";

const Home = () => {
  const { isAuthenticated } = useAuth();
  const { language, formatNumber } = useLanguage();
  const [home, setHome] = useState<HomeResponse | null>(null);

  const copy =
    language === "ar"
      ? {
          badge: "منصة ذكاء لتحليل الشيفرة",
          titlePrefix: "اكتشف تشابه الشيفرة",
          titleHighlight: "بدقة",
          description:
            "قارن بين مصدرين برمجيين عبر التوكنات، وشجرة AST، وأنواع النسخ، والقياسات، والتحليل بالذكاء الاصطناعي، ثم انتقل خلال سير مراجعة منظم ومصمم للفحص التقني الجاد.",
          primarySignedIn: "ابدأ التحليل",
          primarySignedOut: "سجّل الدخول للبدء",
          secondary: "اعرض أحدث النتائج",
          trustSignals: ["سير عمل واعٍ بالسجل", "رسوم AST مدمجة", "دردشة مدعومة بجلسة التحليل"],
          stats: {
            analysesRun: "عدد التحليلات",
            languagesSupported: "اللغات المدعومة",
            currentUserAnalyses: "تحليلات المستخدم الحالي",
            historyReady: "جاهزية السجل",
            yes: "نعم",
            awaiting: "بانتظار أول تحليل",
          },
          featuresTitle: "كل ما تحتاجه لتحليل الشيفرة",
          featuresDescription: "مساحة تحليل متكاملة مبنية على React ومدعومة بمحرك المقارنة الحقيقي، وليست بيانات تجريبية.",
          ctaTitle: "هل أنت مستعد لتحليل شيفرتك؟",
          ctaDescription:
            "ألصق مقطعين برمجيين أو ارفع ملفات ومشاريع ZIP وصفوف جداول، ثم ابدأ مراجعة تشابه كاملة خلال ثوانٍ.",
          ctaSignedIn: "ابدأ أول تحليل لك",
          ctaSignedOut: "افتح مساحة العمل",
          features: [
            {
              icon: GitCompare,
              title: "تشابه متعدد الأبعاد",
              description: "مقارنة متزامنة عبر التوكنات، ورسم AST، والنص، والتحليل المدعوم بالذكاء الاصطناعي.",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: BarChart3,
              title: "لوحة قياسات غنية",
              description: "أسطر الشيفرة، والتعقيد الدوري، وعدد الدوال، ومؤشرات القابلية للصيانة في مكان واحد.",
              color: "text-accent",
              bg: "bg-accent/10",
            },
            {
              icon: MessageSquare,
              title: "رؤى مدعومة بالذكاء الاصطناعي",
              description: "تقارير سياقية ودردشة متابعة مبنية على نتيجة المقارنة الفعلية نفسها.",
              color: "text-success",
              bg: "bg-success/10",
            },
            {
              icon: Shield,
              title: "كشف أنواع النسخ",
              description: "تصنيف النسخ الحرفية، والمعاد تسميتها، والقريبة، والمعاد ترتيبها، والدلالية بشكل واضح.",
              color: "text-warning",
              bg: "bg-warning/10",
            },
            {
              icon: Zap,
              title: "سريع وموثوق",
              description: "مسار عمل محسّن يشمل الرسوم، وتوليد المخططات، وسجل الجلسات، ودعم المتابعة الذكية.",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: Code2,
              title: "ملف + ZIP + Excel",
              description: "حلّل نصوصًا ملصقة أو ملفات برمجية أو مشاريع ZIP أو عينات مستخرجة من الجداول.",
              color: "text-accent",
              bg: "bg-accent/10",
            },
          ],
        }
      : {
          badge: "AI-Powered Code Intelligence Platform",
          titlePrefix: "Detect code similarity",
          titleHighlight: "with precision",
          description:
            "Compare two code sources across token, AST, clone-type, metrics, and AI analysis dimensions, then move through a structured review workflow built for serious technical inspection.",
          primarySignedIn: "Start Analysis",
          primarySignedOut: "Sign In to Start",
          secondary: "View Latest Results",
          trustSignals: ["History-aware workflow", "AST graphs included", "Session-backed AI chat"],
          stats: {
            analysesRun: "Analyses Run",
            languagesSupported: "Languages Supported",
            currentUserAnalyses: "Current User Analyses",
            historyReady: "History Ready",
            yes: "Yes",
            awaiting: "Awaiting",
          },
          featuresTitle: "Everything you need for code analysis",
          featuresDescription: "A complete React-powered analytical workspace backed by the real comparison engine, not mock data.",
          ctaTitle: "Ready to analyze your code?",
          ctaDescription:
            "Paste two snippets or upload files, ZIP projects, and spreadsheet rows to launch a complete similarity review in seconds.",
          ctaSignedIn: "Run Your First Analysis",
          ctaSignedOut: "Open the Workspace",
          features: [
            {
              icon: GitCompare,
              title: "Multi-Dimensional Similarity",
              description: "Token, AST graph, text, and AI-driven comparison across all dimensions simultaneously.",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: BarChart3,
              title: "Rich Metrics Dashboard",
              description: "Lines of code, cyclomatic complexity, function count, and maintainability indicators.",
              color: "text-accent",
              bg: "bg-accent/10",
            },
            {
              icon: MessageSquare,
              title: "AI-Powered Insights",
              description: "Contextual reports and grounded follow-up chat built from the actual comparison output.",
              color: "text-success",
              bg: "bg-success/10",
            },
            {
              icon: Shield,
              title: "Clone-Type Detection",
              description: "Classify exact, renamed, near-miss, reordered, and semantic clone types with clear labeling.",
              color: "text-warning",
              bg: "bg-warning/10",
            },
            {
              icon: Zap,
              title: "Fast & Reliable",
              description: "Optimized pipeline with charting, graph generation, session history, and AI follow-up support.",
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              icon: Code2,
              title: "File + ZIP + Excel",
              description: "Analyze pasted snippets, uploaded source files, ZIP projects, or spreadsheet-derived code samples.",
              color: "text-accent",
              bg: "bg-accent/10",
            },
          ],
        };

  useEffect(() => {
    void apiFetch<HomeResponse>("/api/home")
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  const stats = [
    { label: copy.stats.analysesRun, value: home ? formatNumber(home.totalAnalyses) : "—", icon: BarChart3 },
    { label: copy.stats.languagesSupported, value: home ? formatNumber(home.languagesSupported) : "—", icon: Code2 },
    { label: copy.stats.currentUserAnalyses, value: home ? formatNumber(home.userAnalyses) : "—", icon: Clock },
    {
      label: copy.stats.historyReady,
      value: home?.latestAnalysisId ? copy.stats.yes : copy.stats.awaiting,
      icon: TrendingUp,
    },
  ];

  const primaryHref = isAuthenticated ? "/analysis" : "/login";
  const secondaryHref = home?.latestAnalysisId ? `/results?analysisId=${home.latestAnalysisId}` : primaryHref;

  return (
    <div className="space-y-16 animate-fade-in">
      <section className="relative pt-8 pb-4">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary)), transparent)" }}
        />

        <div className="relative mx-auto max-w-4xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-5 py-2 text-sm font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {copy.badge}
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.08]">
            {copy.titlePrefix} <span className="text-gradient-brand">{copy.titleHighlight}</span>
          </h1>

          <p className="mx-auto max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {copy.description}
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild size="lg" className="h-12 gap-2 px-7 text-base shadow-glow-sm">
              <Link to={primaryHref}>
                {isAuthenticated ? copy.primarySignedIn : copy.primarySignedOut}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 gap-2 border-border/60 px-7 text-base hover:border-primary/40">
              <Link to={secondaryHref}>{copy.secondary}</Link>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 pt-4 text-sm text-muted-foreground">
            {copy.trustSignals.map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card text-center">
              <Icon className="mx-auto mb-2 h-5 w-5 text-primary/60" />
              <div className="text-3xl font-bold tracking-tight text-foreground">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          );
        })}
      </section>

      <section className="space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.featuresTitle}</h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            {copy.featuresDescription}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="card-premium group p-5 hover:-translate-y-0.5">
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${feature.bg}`}>
                  <Icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold sm:text-3xl">{copy.ctaTitle}</h2>
        <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
          {copy.ctaDescription}
        </p>
        <Button asChild size="lg" className="h-12 gap-2 px-7 text-base shadow-glow-sm">
          <Link to={primaryHref}>
            {isAuthenticated ? copy.ctaSignedIn : copy.ctaSignedOut}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
};

export default Home;
