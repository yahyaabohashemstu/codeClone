import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface PageErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function PageError({ message, onRetry }: PageErrorProps) {
  const { t } = useTranslation("common");
  const displayMessage = message ?? t("errors.generic");

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8"
      role="alert"
    >
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center max-w-md">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-3" />
        <h2 className="t-h4 text-destructive mb-2">
          {t("status.error")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{displayMessage}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("buttons.retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
