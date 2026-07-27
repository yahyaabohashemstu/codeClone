import { useTranslation } from "react-i18next";
import { RegMark } from "@/components/dossier/Dossier";

interface PageLoaderProps {
  message?: string;
}

/** The press finding register — a slowly rotating registration crosshair. */
export function PageLoader({ message }: PageLoaderProps) {
  const { t } = useTranslation("common");
  const label = message ?? t("status.loading");

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <RegMark className="h-9 w-9 animate-spin text-primary [animation-duration:1.6s]" />
      <p className="press-slug">{label}</p>
    </div>
  );
}
