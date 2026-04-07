
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { language } = useLanguage();
  const label =
    language === "ar"
      ? theme === "dark"
        ? "التبديل إلى الوضع الفاتح"
        : "التبديل إلى الوضع الداكن"
      : theme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full border border-border/50 bg-card/50 shadow-sm backdrop-blur-sm hover:bg-card"
      aria-label={label}
      title={label}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 transition-all text-foreground" />
      ) : (
        <Sun className="h-5 w-5 transition-all text-warning" />
      )}
    </Button>
  );
}
