import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

const ResetPassword = () => {
  const { resetPassword } = useAuth();
  const { t } = useTranslation("auth");
  const { isRTL, localizeRuntimeMessage } = useLanguage();
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
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-10 text-center">
        <div className="mb-4 flex justify-center">
          <CheckCircle2 className="h-9 w-9 text-success" />
        </div>
        <h1 className="t-h3">{t("auth.resetDoneTitle")}</h1>
        <p className="mt-2 t-body">{t("auth.resetDoneDescription")}</p>
        <Button asChild className="mt-6 h-10 w-full">
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-10">
      <h1 className="t-h3 text-center">{t("auth.resetTitle")}</h1>
      <p className="mt-2 mb-6 text-center t-body">{t("auth.resetDescription")}</p>

      {error && (
        <div
          className="mb-4 rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {t("auth.newPassword")}
          </label>
          <div className="relative">
            <Lock className={cn("absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              className={cn("h-10", isRTL ? "pr-10 pl-10 text-right" : "pl-10 pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground", isRTL ? "left-3" : "right-3")}
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 h-11 w-full gap-2"
        >
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

      <div className="mt-5 text-center text-sm">
        <Link to="/login" className="text-foreground underline underline-offset-2 hover:opacity-70">{t("auth.backToLogin")}</Link>
      </div>
    </div>
  );
};

export default ResetPassword;
