import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AtSign, Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/dossier/Dossier";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

type Mode = "signin" | "signup" | "forgot" | "twofa";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, requestPasswordReset, complete2faLogin, resendVerification } = useAuth();
  const { localizeRuntimeMessage } = useLanguage();
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
      className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-card md:grid-cols-2"
      style={{ minHeight: "640px" }}
    >
      {/* ── Brand side — the ink-&-ember cover, matching the Home hero ── */}
      <section className="ink-panel relative flex flex-col justify-between overflow-hidden p-10">
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-6 select-none font-mono text-[8rem] font-bold leading-none tracking-tighter text-foreground/[0.04] end-4"
        >
          CL
        </span>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-primary">
              <img src="/brand/logo.png" alt="Clone Lens" className="h-10 w-10 object-contain" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">Clone Lens</span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {["AST", "Fingerprint", "Neural"].map((s) => (
              <span key={s} className="stamp">
                {s}
              </span>
            ))}
          </div>

          <h2 className="mt-6 t-h1 text-foreground [overflow-wrap:anywhere]">{t("auth.welcomeTitle")}</h2>
          <p className="mt-4 max-w-[42ch] leading-relaxed text-muted-foreground">{t("auth.welcomeSubtitle")}</p>
        </div>

        {/* chain-of-custody note — an accent-edge card, not a filled box */}
        <div className="relative mt-10 flex overflow-hidden rounded-lg border border-border bg-card">
          <span className="w-0.5 shrink-0 bg-primary" aria-hidden="true" />
          <div className="px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            {t("auth.quote")}
            <div className="mt-2 t-label text-foreground/80">{t("auth.quoteCite")}</div>
          </div>
        </div>
      </section>

      {/* ── Form side ── */}
      <section className="flex flex-col justify-center p-10">
        <div className="mb-6 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {t("auth.secureAccess")}
        </div>

        <h3 className="t-h3">
          {headingTitle}
        </h3>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{headingDescription}</p>

        {error && (
          <div role="alert" className="mb-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-4">
            <Notice tone="success">{notice}</Notice>
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
                <UserRound className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={mode === "signin" ? t("auth.identifierPlaceholder") : t("auth.usernamePlaceholder")}
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-10 ps-10 text-start"
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
                <AtSign className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  autoComplete="email"
                  dir="ltr"
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 ps-10 text-start"
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
                <Lock className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 ps-10 pe-10 text-start"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 end-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="mt-2 float-end text-xs text-primary hover:underline"
                >
                  {t("auth.forgotPassword")}
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-11 w-full gap-2"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current" />
                {submittingLabel}
              </span>
            ) : (
              submitLabel
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
          className="my-5 flex items-center gap-3 t-label"
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
