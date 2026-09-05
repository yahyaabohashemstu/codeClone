import { useEffect, useId, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell, PlateField, PlateNotice, PlateTitle } from "@/components/layout/AuthShell";
import { BenchButton } from "@/components/bench/Bench";
import { IconArrowRight } from "@/components/bench/icons";
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
  const emailId = useId();

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

  const heading =
    status === "verifying" ? t("auth.verifyingTitle")
    : status === "ok" ? t("auth.verifiedTitle")
    : t("auth.verifyFailedTitle");
  const description =
    status === "ok" ? t("auth.verifiedDescription")
    : status === "error" ? t("auth.verifyFailedDescription")
    : "";

  return (
    <AuthShell serial="Plate 00 · Verify">
      <div className="flex flex-col gap-[22px]">
        <PlateTitle word={t("auth.bench.titleVerify")} qualifier={t("auth.bench.titleVerifySub")} />

        <div>
          <p className="text-[15px] font-semibold leading-[1.4] text-plate-ink" aria-live="polite">
            {heading}
          </p>
          {description && <p className="mt-1.5 text-[13px] leading-[1.5] text-plate-soft">{description}</p>}
        </div>

        {status === "error" &&
          (resendState === "sent" ? (
            <PlateNotice tone="notice">{t("auth.resendSent")}</PlateNotice>
          ) : (
            <>
              <PlateField label={t("auth.email")} htmlFor={emailId}>
                <div className="plate-well">
                  <input
                    id={emailId}
                    type="email"
                    dir="ltr"
                    placeholder="name@company.com"
                    value={resendEmail}
                    autoComplete="email"
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </div>
                <p className="mt-2.5 text-[12.5px] text-plate-soft">{t("auth.resendPrompt")}</p>
              </PlateField>
              <div>
                <BenchButton
                  type="button"
                  tone="primary"
                  size="large"
                  onClick={() => void handleResend()}
                  disabled={resendState === "sending" || !resendEmail.trim()}
                  trailing={<IconArrowRight className="rtl:-scale-x-100" />}
                >
                  {resendState === "sending" ? t("auth.resending") : t("auth.resendVerification")}
                </BenchButton>
              </div>
            </>
          ))}

        {status !== "verifying" && (
          <div className="mt-1.5 border-t border-plate-hair pt-[18px] text-[12.5px] text-plate-soft">
            <Link to="/login" className="text-plate-ink underline underline-offset-2 hover:text-signal-plate">
              {t("auth.backToLogin")}
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default VerifyEmail;
