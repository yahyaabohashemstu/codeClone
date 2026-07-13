import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "codesimilar.cookieConsent";

/**
 * Minimal cookie-consent notice. We only use a strictly-necessary session
 * cookie plus local preferences, so this is an acknowledgement banner (no
 * tracking to gate). Dismissal is remembered in localStorage.
 */
export function CookieConsent() {
  const { t } = useTranslation("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(false);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3"
      role="dialog"
      aria-label="Cookie notice"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="t-sm">
          {t("cookies.text", { defaultValue: "We use a strictly-necessary session cookie for sign-in and store your preferences locally." })}{" "}
          <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2 hover:opacity-70">
            {t("cookies.learn", { defaultValue: "Privacy Policy" })}
          </Link>
        </p>
        <Button size="sm" onClick={dismiss} className="shrink-0">
          {t("cookies.accept", { defaultValue: "Got it" })}
        </Button>
      </div>
    </div>
  );
}
