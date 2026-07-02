import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

type Status = "verifying" | "ok" | "error";

const VerifyEmail = () => {
  const { verifyEmail } = useAuth();
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<Status>("verifying");
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

  const title =
    status === "verifying" ? t("auth.verifyingTitle")
    : status === "ok" ? t("auth.verifiedTitle")
    : t("auth.verifyFailedTitle");
  const description =
    status === "ok" ? t("auth.verifiedDescription")
    : status === "error" ? t("auth.verifyFailedDescription")
    : "";

  return (
    <div
      className="mx-auto max-w-md rounded-2xl border border-border bg-card p-10 text-center"
      style={{ boxShadow: "var(--card-shadow-rest)" }}
    >
      <div className="mb-4 flex justify-center">
        {status === "verifying" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
        {status === "ok" && <CheckCircle2 className="h-10 w-10 text-success" />}
        {status === "error" && <XCircle className="h-10 w-10 text-destructive" />}
      </div>
      <h1 className="t-h3">{title}</h1>
      {description && <p className="mt-2 t-body">{description}</p>}
      {status !== "verifying" && (
        <Button
          asChild
          className="mt-6 h-10 w-full gap-2 text-white"
          style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
        >
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </Button>
      )}
    </div>
  );
};

export default VerifyEmail;
