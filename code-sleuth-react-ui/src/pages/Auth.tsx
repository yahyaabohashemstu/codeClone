import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { isRTL, localizeRuntimeMessage } = useLanguage();
  const { t } = useTranslation("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const rawFrom = (location.state as { from?: string })?.from;
  const redirectTarget = rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/analysis";

  const featureCards = t("auth.featureCards", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError(t("auth.requiredCredentials"));
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate(redirectTarget, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? localizeRuntimeMessage(submitError.message) : t("auth.errors.invalidCredentials"));
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
              <div className="text-sm text-white/80">{t("auth.platform")}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.15] sm:text-5xl">
              {t("auth.welcomeTitle")}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-white/80">
              {t("auth.welcomeSubtitle")}
            </p>
          </div>

          <div className="grid gap-4">
            {featureCards.map((item) => (
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
              {t("auth.secureAccess")}
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{t("auth.signIn")}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("auth.loginDescription")}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">{t("auth.username")}</label>
              <div className="relative">
                <UserRound className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                <Input
                  type="text"
                  placeholder={t("auth.usernamePlaceholder")}
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
              <label className="text-xs font-medium text-foreground/80">{t("auth.password")}</label>
              <div className="relative">
                <Lock className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
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
                  {t("auth.signingIn")}
                </span>
              ) : (
                <>
                  {t("auth.submitLogin")}
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
              <span className="bg-card px-3 text-xs text-muted-foreground">{t("auth.orExploreFirst")}</span>
            </div>
          </div>

          <Button asChild variant="outline" className="h-11 w-full border-border/60 text-sm hover:border-primary/40">
            <Link to="/">{t("auth.goHome")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Auth;
