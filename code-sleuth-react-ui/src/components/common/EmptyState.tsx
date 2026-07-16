import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 p-8 text-center">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
      )}
      <h3 className="t-h4 text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline" size="sm" className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
