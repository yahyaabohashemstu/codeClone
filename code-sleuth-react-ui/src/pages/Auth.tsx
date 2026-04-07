import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Code2, Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { language, isRTL, localizeRuntimeMessage } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const rawFrom = (location.state as { from?: string })?.from;
  const redirectTarget = rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/analysis";
  const copy =
    language === "ar"
      ? {
          platform: "منصة التحليل",
          heroTitle: "سجّل الدخول إلى مساحة تحليل شيفرة احترافية.",
          heroDescription:
            "ادخل إلى كشف النسخ، واستعراض AST، والقياسات، وتقارير الذكاء الاصطناعي، والدردشة المبنية على السياق، وسجل الجلسات المحفوظة من واجهة واحدة متقنة.",
          featureCards: [
            {
              title: "مقارنة عميقة للشيفرة",
              description: "قارن بين النصوص الملصقة أو الملفات البرمجية أو مشاريع ZIP أو العينات المستخرجة من Excel ضمن مسار واحد.",
            },
            {
              title: "سير عمل الرسوم والتقارير",
              description: "راجع بنية AST والقياسات وملاحظات الجودة والملخص الذكي داخل الجلسة نفسها.",
            },
            {
              title: "سجل مرتبط بالحساب",
              description: "احتفِظ بالتحاليل السابقة منظمة وقابلة للبحث وإعادة الفتح أو إعادة التشغيل أو التصدير.",
            },
          ],
          secureAccess: "وصول آمن",
          login: "تسجيل الدخول",
          loginDescription: "أدخل بيانات حسابك للمتابعة إلى مساحة المقارنة.",
          username: "اسم المستخدم",
          password: "كلمة المرور",
          usernamePlaceholder: "admin",
          passwordPlaceholder: "••••••••",
          requiredCredentials: "اسم المستخدم وكلمة المرور مطلوبان.",
          authFailed: "فشلت عملية تسجيل الدخول.",
          signingIn: "جارٍ تسجيل الدخول...",
          loginToWorkspace: "الدخول إلى مساحة العمل",
          orExploreFirst: "أو استكشف أولًا",
          goHome: "العودة إلى الرئيسية",
        }
      : {
          platform: "Analysis Platform",
          heroTitle: "Sign in to a world-class code analysis workspace.",
          heroDescription:
            "Access clone detection, AST visualization, metrics, AI reporting, grounded follow-up chat, and saved session history from one premium interface.",
          featureCards: [
            {
              title: "Deep code comparison",
              description: "Compare pasted snippets, uploaded source files, ZIP projects, or Excel-derived samples in one flow.",
            },
            {
              title: "Graph + report workflow",
              description: "Review AST structure, metrics, code quality notes, and a polished AI summary in the same session.",
            },
            {
              title: "Account-scoped history",
              description: "Keep previous analyses organized, searchable, and ready to reopen, rerun, or export.",
            },
          ],
          secureAccess: "Secure Access",
          login: "Login",
          loginDescription: "Enter your account credentials to continue to the comparison workspace.",
          username: "Username",
          password: "Password",
          usernamePlaceholder: "admin",
          passwordPlaceholder: "••••••••",
          requiredCredentials: "Username and password are required.",
          authFailed: "Authentication failed.",
          signingIn: "Signing in…",
          loginToWorkspace: "Login to Workspace",
          orExploreFirst: "or explore first",
          goHome: "Go to Home",
        };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError(copy.requiredCredentials);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(redirectTarget, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? localizeRuntimeMessage(submitError.message) : copy.authFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="card-premium relative overflow-hidden border-primary/20 bg-gradient-brand p-10 text-white shadow-glow-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
        <div className="relative space-y-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <Code2 className="h-7 w-7" />
            </div>
            <div>
              <div className="text-3xl font-bold tracking-tight">CodeSimilar</div>
              <div className="text-sm text-white/80">{copy.platform}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.15] sm:text-5xl">
              {copy.heroTitle}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-white/80">
              {copy.heroDescription}
            </p>
          </div>

          <div className="grid gap-4">
            {copy.featureCards.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/78">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card-premium p-8 sm:p-10">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              {copy.secureAccess}
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{copy.login}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {copy.loginDescription}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">{copy.username}</label>
              <div className="relative">
                <UserRound className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                <Input
                  type="text"
                  placeholder={copy.usernamePlaceholder}
                  value={username}
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  className={cn(
                    "h-11 border-border/60 bg-muted/30 text-sm focus:border-primary/60 focus:ring-primary/20",
                    isRTL ? "pr-9 text-right" : "pl-9",
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">{copy.password}</label>
              <div className="relative">
                <Lock className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={copy.passwordPlaceholder}
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  className={cn(
                    "h-11 border-border/60 bg-muted/30 text-sm focus:border-primary/60 focus:ring-primary/20",
                    isRTL ? "pr-9 pl-10 text-right" : "pl-9 pr-10",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", isRTL ? "left-3" : "right-3")}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-11 w-full gap-2 shadow-glow-sm font-medium" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  {copy.signingIn}
                </span>
              ) : (
                <>
                  {copy.loginToWorkspace}
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">{copy.orExploreFirst}</span>
            </div>
          </div>

          <Button asChild variant="outline" className="h-11 w-full border-border/60 text-sm hover:border-primary/40">
            <Link to="/">{copy.goHome}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Auth;
