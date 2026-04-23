
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation("common");
  const label =
    theme === "dark"
      ? t("theme.switchToLight")
      : t("theme.switchToDark");

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
