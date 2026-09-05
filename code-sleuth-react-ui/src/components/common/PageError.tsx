import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { IconRerun } from "@/components/bench/icons";

interface PageErrorProps {
  message?: string;
  onRetry?: () => void;
}

/** A fault on the bench: a hairline panel with the signal lamp lit and a secondary retry. */
export function PageError({ message, onRetry }: PageErrorProps) {
  const { t } = useTranslation("common");
  const displayMessage = message ?? t("errors.generic");

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6" role="alert">
      <div className="w-full max-w-md border border-bench-hair bg-bench-raised">
        <div className="flex items-center gap-2.5 border-b border-bench-hair px-5 py-3">
          <span aria-hidden className="lamp is-on" />
          <span className="label text-txt-primary">{t("status.error")}</span>
        </div>
        <div className="px-5 py-4">
          <p className="body-lg text-txt-secondary">{displayMessage}</p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
              <IconRerun />
              {t("buttons.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
