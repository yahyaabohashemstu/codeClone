import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  const label =
    language === "en"
      ? {
          aria: "Switch language to Arabic",
          short: "AR",
          title: "العربية",
        }
      : {
          aria: "بدّل اللغة إلى الإنجليزية",
          short: "EN",
          title: "English",
        };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="h-9 gap-2 rounded-full border border-border/50 bg-card/50 px-3 text-xs font-semibold shadow-sm backdrop-blur-sm hover:bg-card"
      aria-label={label.aria}
      title={label.aria}
    >
      <Languages className="h-4 w-4" />
      <span>{label.short}</span>
      <span className="hidden text-[11px] text-muted-foreground md:inline">{label.title}</span>
    </Button>
  );
}
