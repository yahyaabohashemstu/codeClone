import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, AtSign, CheckCircle2, Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot" | "twofa";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, requestPasswordReset, complete2faLogin, resendVerification } = useAuth();
  const { isRTL, localizeRuntimeMessage } = useLanguage();
  const { t } = useTranslation("auth");
  const [mode, setMode] = useState<Mode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twofaCode, setTwofaCode] = useState("");
  const [twofaToken, setTwofaToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // After a signup that requires verification, remember the address so the user
  // can trigger a resend if the first email never arrives.
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");

  const rawFrom = (location.state as { from?: string })?.from;
  const redirectTarget =
    rawFrom && rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/analysis";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPendingVerifyEmail("");
  };

  const handleResendVerification = async () => {
    if (!pendingVerifyEmail) return;
    setError("");
    setIsSubmitting(true);
    try {
      await resendVerification(pendingVerifyEmail);
      setNotice(t("auth.resendSent"));
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const asMessage = (e: unknown) =>
    e instanceof Error ? localizeRuntimeMessage(e.message) : t("auth.errors.invalidCredentials");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "forgot") {
      if (!email.trim()) {
        setError(t("auth.requiredCredentials"));
        return;
      }
      setIsSubmitting(true);
      try {
        await requestPasswordReset(email.trim());
        setNotice(t("auth.resetSentDescription"));
      } catch (e) {
        setError(asMessage(e));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "signup") {
      if (!username.trim() || !email.trim() || !password) {
        setError(t("auth.requiredCredentials"));
        return;
      }
      setIsSubmitting(true);
      try {
        const { verificationRequired } = await signup(username.trim(), email.trim(), password);
        if (verificationRequired) {
          setNotice(t("auth.verifyNoticeDescription"));
          setPendingVerifyEmail(email.trim());
        } else {
          navigate(redirectTarget, { replace: true });
        }
      } catch (e) {
        setError(asMessage(e));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "twofa") {
      if (!twofaCode.trim()) {
        setError(t("auth.requiredCredentials"));
        return;
      }
      setIsSubmitting(true);
      try {
        await complete2faLogin(twofaToken, twofaCode.trim());
        navigate(redirectTarget, { replace: true });
      } catch (e) {
        setError(asMessage(e));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // signin
    if (!username.trim() || !password.trim()) {
      setError(t("auth.requiredCredentials"));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      if (result.twofaRequired) {
        setTwofaToken(result.twofaToken || "");
        setTwofaCode("");
        switchMode("twofa");
      } else {
        navigate(redirectTarget, { replace: true });
      }
    } catch (e) {
      setError(asMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const headingTitle =
    mode === "signup" ? t("auth.createAccountTitle")
    : mode === "forgot" ? t("auth.forgotTitle")
    : mode === "twofa" ? t("auth.twofaTitle")
    : t("auth.signIn");
  const headingDescription =
    mode === "signup" ? t("auth.createAccountDescription")
    : mode === "forgot" ? t("auth.forgotDescription")
    : mode === "twofa" ? t("auth.twofaDescription")
    : t("auth.loginDescription");
  const submitLabel =
    mode === "signup" ? t("auth.submitRegister")
    : mode === "forgot" ? t("auth.sendResetLink")
    : mode === "twofa" ? t("auth.verify")
    : t("auth.submitLogin");
  const submittingLabel =
    mode === "signup" ? t("auth.creatingAccount")
    : mode === "forgot" ? t("auth.sending")
    : t("auth.signingIn");

  return (
    <div
      className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-2"
      style={{ minHeight: "640px", boxShadow: "var(--card-shadow-rest)" }}
    >
      {/* ── Brand side (dark panel) ── */}
      <section
        className="relative flex flex-col justify-between overflow-hidden p-10 text-white"
        style={{ background: "hsl(222 28% 7%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-32 h-[500px] w-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.4), transparent 70%)" }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[10px] overflow-hidden"
              style={{ background: "var(--gradient-brand)" }}
            >
              <img src="/brand/logo.png" alt="Clone Lens" className="h-10 w-10 object-contain" />
            </div>
            <span className="text-[18px] font-extrabold tracking-tight">Clone Lens</span>
          </div>

          <h2
            className="mt-10 text-4xl font-extrabold leading-[1.1]"
            style={{ letterSpacing: "-0.025em" }}
          >
            {t("auth.welcomeTitle")}
          </h2>
          <p className="mt-4 max-w-[40ch] text-sm leading-[1.6] text-white/70">
            {t("auth.welcomeSubtitle")}
          </p>
        </div>

        <div
          className="relative mt-10 rounded-lg border-l-[3px] border-primary p-5 text-sm leading-[1.6]"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          {t("auth.quote")}
          <div className="mt-2 text-xs not-italic text-white/60">— {t("auth.quoteCite")}</div>
        </div>
      </section>

      {/* ── Form side ── */}
      <section className="flex flex-col justify-center p-10">
        <div className="mb-6 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          {t("auth.secureAccess")}
        </div>

        <h3 className="text-2xl font-bold tracking-tight" style={{ letterSpacing: "-0.015em" }}>
          {headingTitle}
        </h3>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{headingDescription}</p>

        {error && (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: "hsl(var(--destructive) / 0.25)",
              background: "hsl(var(--destructive) / 0.06)",
              color: "hsl(var(--destructive))",
            }}
            role="alert"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            className="mb-4 flex items-start gap-2 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: "hsl(var(--success) / 0.3)",
              background: "hsl(var(--success) / 0.08)",
              color: "hsl(var(--success))",
            }}
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {pendingVerifyEmail && mode === "signup" && (
          <button
            type="button"
            onClick={() => void handleResendVerification()}
            disabled={isSubmitting}
            className="mb-4 text-sm text-primary hover:underline disabled:opacity-50"
          >
            {isSubmitting ? t("auth.resending") : t("auth.resendVerification")}
          </button>
        )}

        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          {mode === "twofa" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t("auth.twofaCodeLabel")}
              </label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                value={twofaCode}
                dir="ltr"
                onChange={(e) => setTwofaCode(e.target.value)}
                className="h-10 text-center tracking-[0.3em]"
              />
            </div>
          )}
          {(mode === "signin" || mode === "signup") && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {mode === "signin" ? t("auth.identifier") : t("auth.username")}
              </label>
              <div className="relative">
                <UserRound
                  className={cn(
                    "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                    isRTL ? "right-3" : "left-3",
                  )}
                />
                <Input
                  type="text"
                  placeholder={mode === "signin" ? t("auth.identifierPlaceholder") : t("auth.usernamePlaceholder")}
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                  className={cn("h-10", isRTL ? "pr-10 text-right" : "pl-10")}
                />
              </div>
            </div>
          )}

          {(mode === "signup" || mode === "forgot") && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t("auth.email")}
              </label>
              <div className="relative">
                <AtSign
                  className={cn(
                    "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                    isRTL ? "right-3" : "left-3",
                  )}
                />
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  autoComplete="email"
                  dir="ltr"
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn("h-10", isRTL ? "pr-10 text-right" : "pl-10")}
                />
              </div>
            </div>
          )}

          {(mode === "signin" || mode === "signup") && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Lock
                  className={cn(
                    "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
                    isRTL ? "right-3" : "left-3",
                  )}
                />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn("h-10", isRTL ? "pr-10 pl-10 text-right" : "pl-10 pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
                    isRTL ? "left-3" : "right-3",
                  )}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className={cn("mt-2 text-xs text-primary hover:underline", isRTL ? "float-left" : "float-right")}
                >
                  {t("auth.forgotPassword")}
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 w-full gap-2 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {submittingLabel}
              </span>
            ) : (
              <>
                {submitLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" && (
            <button type="button" onClick={() => switchMode("signup")} className="text-primary hover:underline">
              {t("auth.signupCta")}
            </button>
          )}
          {mode === "signup" && (
            <button type="button" onClick={() => switchMode("signin")} className="text-primary hover:underline">
              {t("auth.loginCta")}
            </button>
          )}
          {(mode === "forgot" || mode === "twofa") && (
            <button type="button" onClick={() => switchMode("signin")} className="text-primary hover:underline">
              {t("auth.backToLogin")}
            </button>
          )}
        </div>

        <div
          className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          aria-hidden
        >
          <span className="h-px flex-1 bg-border" />
          {t("auth.or")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button asChild variant="outline" className="h-10 w-full text-sm">
          <Link to="/">{t("auth.goHome")}</Link>
        </Button>
      </section>
    </div>
  );
};

export default Auth;
