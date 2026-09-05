import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell, PlateField, PlateNotice, PlateTitle } from "@/components/layout/AuthShell";
import { BenchButton } from "@/components/bench/Bench";
import { IconArrowRight } from "@/components/bench/icons";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

type Mode = "signin" | "signup" | "forgot" | "twofa";

/**
 * The access plate. One plate, four modes: sign in, sign up, reset request,
 * and the second-factor step that follows a sign-in when 2FA is enabled.
 */
const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, requestPasswordReset, complete2faLogin, resendVerification } = useAuth();
  const { localizeRuntimeMessage } = useLanguage();
  const { t } = useTranslation("auth");
  const uid = useId();
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

  const asMessage = (e: unknown) =>
    e instanceof Error ? localizeRuntimeMessage(e.message) : t("auth.errors.invalidCredentials");

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

  const title =
    mode === "signup" ? { word: t("auth.bench.titleSignUp"), qualifier: t("auth.bench.titleSignUpSub") }
    : mode === "forgot" ? { word: t("auth.bench.titleForgot"), qualifier: t("auth.bench.titleForgotSub") }
    : mode === "twofa" ? { word: t("auth.bench.titleTwofa"), qualifier: t("auth.bench.titleTwofaSub") }
    : { word: t("auth.bench.titleSignIn"), qualifier: t("auth.bench.titleSignInSub") };

  const submitLabel =
    mode === "signup" ? t("auth.submitRegister")
    : mode === "forgot" ? t("auth.sendResetLink")
    : mode === "twofa" ? t("auth.verify")
    : t("auth.bench.titleSignIn");
  const submittingLabel =
    mode === "signup" ? t("auth.creatingAccount")
    : mode === "forgot" ? t("auth.sending")
    : t("auth.signingIn");

  const ids = {
    identifier: `${uid}-identifier`,
    email: `${uid}-email`,
    password: `${uid}-password`,
    code: `${uid}-code`,
  };

  return (
    <AuthShell>
      <form className="flex flex-col gap-[22px]" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <PlateTitle word={title.word} qualifier={title.qualifier} />

        {error && <PlateNotice tone="error">{error}</PlateNotice>}
        {notice && (
          <PlateNotice tone="notice">
            {notice}
            {pendingVerifyEmail && mode === "signup" && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={isSubmitting}
                  className="underline underline-offset-2 text-plate-ink disabled:opacity-50"
                >
                  {isSubmitting ? t("auth.resending") : t("auth.resendVerification")}
                </button>
              </>
            )}
          </PlateNotice>
        )}

        {mode === "twofa" && (
          <PlateField label={t("auth.twofaCodeLabel")} htmlFor={ids.code}>
            <div className="plate-well">
              <input
                id={ids.code}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                value={twofaCode}
                dir="ltr"
                onChange={(e) => setTwofaCode(e.target.value)}
                className="font-mono tracking-[0.3em]"
              />
            </div>
            <p className="mt-2.5 text-[12.5px] text-plate-soft">{t("auth.twofaDescription")}</p>
          </PlateField>
        )}

        {(mode === "signin" || mode === "signup") && (
          <PlateField label={mode === "signin" ? t("auth.bench.identifierLabel") : t("auth.username")} htmlFor={ids.identifier}>
            <div className="plate-well">
              <input
                id={ids.identifier}
                type="text"
                placeholder={mode === "signin" ? "name@company.com" : t("auth.usernamePlaceholder")}
                value={username}
                autoComplete="username"
                autoFocus
                dir="ltr"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </PlateField>
        )}

        {(mode === "signup" || mode === "forgot") && (
          <PlateField label={t("auth.email")} htmlFor={ids.email}>
            <div className="plate-well">
              <input
                id={ids.email}
                type="email"
                placeholder="name@company.com"
                value={email}
                autoComplete="email"
                autoFocus={mode === "forgot"}
                dir="ltr"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </PlateField>
        )}

        {(mode === "signin" || mode === "signup") && (
          <PlateField
            label={t("auth.password")}
            htmlFor={ids.password}
            aside={
              mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-[12.5px] text-plate-ink underline underline-offset-2 hover:text-signal-plate"
                >
                  {t("auth.bench.forgot")}
                </button>
              ) : undefined
            }
          >
            <div className="plate-well">
              <input
                id={ids.password}
                type={showPassword ? "text" : "password"}
                placeholder="············"
                value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                dir="ltr"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="label-sm shrink-0 text-plate-soft hover:text-plate-ink"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-pressed={showPassword}
              >
                {showPassword ? t("auth.bench.hide") : t("auth.bench.show")}
              </button>
            </div>
          </PlateField>
        )}

        <div>
          <BenchButton
            type="submit"
            tone="primary"
            size="large"
            disabled={isSubmitting}
            trailing={<IconArrowRight className="rtl:-scale-x-100" />}
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </BenchButton>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-plate-hair pt-[18px] text-[12.5px] text-plate-soft">
          {mode === "signin" && (
            <>
              <span>
                {t("auth.bench.noAccount")}{" "}
                <button type="button" onClick={() => switchMode("signup")} className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
                  {t("auth.bench.createOne")}
                </button>
              </span>
              <span>{t("auth.bench.twofaFollows")}</span>
            </>
          )}
          {mode === "signup" && (
            <span>
              {t("auth.bench.haveAccount")}{" "}
              <button type="button" onClick={() => switchMode("signin")} className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
                {t("auth.bench.signInLink")}
              </button>
            </span>
          )}
          {mode === "forgot" && (
            <span>
              {t("auth.bench.rememberedIt")}{" "}
              <button type="button" onClick={() => switchMode("signin")} className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
                {t("auth.bench.signInLink")}
              </button>
            </span>
          )}
          {mode === "twofa" && (
            <button type="button" onClick={() => switchMode("signin")} className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
              {t("auth.backToLogin")}
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
};

export default Auth;
