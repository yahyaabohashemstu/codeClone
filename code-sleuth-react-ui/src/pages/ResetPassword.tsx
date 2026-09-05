import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell, PlateField, PlateNotice, PlateTitle } from "@/components/layout/AuthShell";
import { BenchButton } from "@/components/bench/Bench";
import { IconArrowRight } from "@/components/bench/icons";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const ResetPassword = () => {
  const { resetPassword } = useAuth();
  const { t } = useTranslation("auth");
  const { localizeRuntimeMessage } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const passwordId = useId();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError(t("auth.missingToken"));
      return;
    }
    if (!password) {
      setError(t("auth.requiredCredentials"));
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (e) {
      setError(e instanceof Error ? localizeRuntimeMessage(e.message) : t("auth.resetFailedDescription"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell serial="Plate 00 · Reset">
      <form className="flex flex-col gap-[22px]" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <PlateTitle word={t("auth.bench.titleNewPassword")} qualifier={t("auth.bench.titleNewPasswordSub")} />

        {done ? (
          <>
            <div>
              <p className="text-[15px] font-semibold leading-[1.4] text-plate-ink" role="status">
                {t("auth.resetDoneTitle")}
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.5] text-plate-soft">{t("auth.resetDoneDescription")}</p>
            </div>
            <div className="mt-1.5 border-t border-plate-hair pt-[18px] text-[12.5px] text-plate-soft">
              <Link to="/login" className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
                {t("auth.backToLogin")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-[1.5] text-plate-soft">{t("auth.resetDescription")}</p>
            {error && <PlateNotice tone="error">{error}</PlateNotice>}

            <PlateField label={t("auth.newPassword")} htmlFor={passwordId}>
              <div className="plate-well">
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete="new-password"
                  autoFocus
                  dir="ltr"
                  placeholder="············"
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

            <div>
              <BenchButton type="submit" tone="primary" size="large" disabled={isSubmitting} trailing={<IconArrowRight className="rtl:-scale-x-100" />}>
                {isSubmitting ? t("auth.updating") : t("auth.updatePassword")}
              </BenchButton>
            </div>

            <div className="mt-1.5 border-t border-plate-hair pt-[18px] text-[12.5px] text-plate-soft">
              <Link to="/login" className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
                {t("auth.backToLogin")}
              </Link>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
