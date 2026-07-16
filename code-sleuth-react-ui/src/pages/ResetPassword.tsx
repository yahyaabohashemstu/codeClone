import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, Panel } from "@/components/dossier/Dossier";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const ResetPassword = () => {
  const { resetPassword } = useAuth();
  const { t } = useTranslation("auth");
  const { localizeRuntimeMessage } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

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

  if (done) {
    return (
      <div className="mx-auto max-w-md py-4">
        <Panel bodyClassName="p-6 sm:p-8">
          <h1 className="t-h3">{t("auth.resetDoneTitle")}</h1>
          <Notice tone="success" className="mt-4">
            {t("auth.resetDoneDescription")}
          </Notice>
          <Button asChild className="mt-6 h-11 w-full">
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-4">
      <Panel bodyClassName="p-6 sm:p-8">
        <h1 className="t-h3">{t("auth.resetTitle")}</h1>
        <p className="mt-1.5 t-body">{t("auth.resetDescription")}</p>

        {error && (
          <div role="alert" className="mt-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {t("auth.newPassword")}
            </label>
            <div className="relative">
              <Lock className="absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
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
          </div>

          <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 w-full gap-2">
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t("auth.updating")}
              </span>
            ) : (
              t("auth.updatePassword")
            )}
          </Button>
        </form>

        <div className="mt-5 text-sm">
          <Link to="/login" className="text-primary hover:underline">{t("auth.backToLogin")}</Link>
        </div>
      </Panel>
    </div>
  );
};

export default ResetPassword;
