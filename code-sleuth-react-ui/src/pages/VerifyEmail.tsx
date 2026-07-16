import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice, Panel } from "@/components/dossier/Dossier";
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
    <div className="mx-auto max-w-md py-4">
      <Panel bodyClassName="p-6 sm:p-8">
        <h1 className="t-h3">{title}</h1>

        {status === "verifying" && (
          <div className="mt-4 flex items-center gap-2.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t("auth.verifyingTitle")}
          </div>
        )}

        {status === "ok" && (
          <Notice tone="success" className="mt-4">
            {description}
          </Notice>
        )}

        {status === "error" && (
          <>
            <Notice tone="danger" className="mt-4">
              {description}
            </Notice>

            <div className="mt-6">
              {resendState === "sent" ? (
                <div role="status">
                  <Notice tone="success">{t("auth.resendSent")}</Notice>
                </div>
              ) : (
                <>
                  <label htmlFor="resend-email" className="mb-1.5 block text-sm font-medium text-foreground">
                    {t("auth.resendPrompt")}
                  </label>
                  <Input
                    id="resend-email"
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
          </>
        )}

        {status !== "verifying" && (
          <Button asChild className="mt-6 h-10 w-full">
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </Button>
        )}
      </Panel>
    </div>
  );
};

export default VerifyEmail;
