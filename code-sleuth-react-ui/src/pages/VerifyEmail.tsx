import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

type Status = "verifying" | "ok" | "error";
type ResendState = "idle" | "sending" | "sent";

const VerifyEmail = () => {
  const { verifyEmail, resendVerification } = useAuth();
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<Status>("verifying");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<ResendState>("idle");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke guard
    ran.current = true;
    if (!token) {
      setStatus("error");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, [token, verifyEmail]);

  const handleResend = async () => {
    if (!resendEmail.trim()) return;
    setResendState("sending");
    try {
      await resendVerification(resendEmail.trim());
    } finally {
      // The endpoint is deliberately uniform (never reveals whether the address
      // exists), so we always land on the same confirmation.
      setResendState("sent");
    }
  };

  const title =
    status === "verifying" ? t("auth.verifyingTitle")
    : status === "ok" ? t("auth.verifiedTitle")
    : t("auth.verifyFailedTitle");
  const description =
    status === "ok" ? t("auth.verifiedDescription")
    : status === "error" ? t("auth.verifyFailedDescription")
    : "";

  return (
    <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-10 text-center">
      <div className="mb-4 flex justify-center">
        {status === "verifying" && <Loader2 className="h-9 w-9 animate-spin text-primary" />}
        {status === "ok" && <CheckCircle2 className="h-9 w-9 text-success" />}
        {status === "error" && <XCircle className="h-9 w-9 text-destructive" />}
      </div>
      <h1 className="t-h3">{title}</h1>
      {description && <p className="mt-2 t-body">{description}</p>}

      {status === "error" && (
        <div className="mt-6 text-start">
          {resendState === "sent" ? (
            <div
              className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("auth.resendSent")}</span>
            </div>
          ) : (
            <>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t("auth.resendPrompt")}
              </label>
              <Input
                type="email"
                dir="ltr"
                placeholder={t("auth.emailPlaceholder")}
                value={resendEmail}
                autoComplete="email"
                onChange={(e) => setResendEmail(e.target.value)}
                className="h-10"
              />
              <Button
                type="button"
                onClick={() => void handleResend()}
                disabled={resendState === "sending" || !resendEmail.trim()}
                variant="outline"
                className="mt-3 h-10 w-full"
              >
                {resendState === "sending" ? t("auth.resending") : t("auth.resendVerification")}
              </Button>
            </>
          )}
        </div>
      )}

      {status !== "verifying" && (
        <Button asChild className="mt-6 h-10 w-full gap-2">
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </Button>
      )}
    </div>
  );
};

export default VerifyEmail;
