import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconFilePlus } from "@/components/bench/icons";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** An empty ledger: the file mark, one sentence, a mono hint and one secondary action. */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 border-y border-bench-hair px-6 py-20 text-center">
      {Icon ? (
        <Icon className="h-7 w-7 text-txt-muted" strokeWidth={1.5} aria-hidden />
      ) : (
        <IconFilePlus className="text-txt-muted" />
      )}
      <p className="text-[15px] text-txt-primary">{title}</p>
      {description && <p className="max-w-[48ch] font-mono text-[11px] leading-relaxed text-txt-muted">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline" size="sm" className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
