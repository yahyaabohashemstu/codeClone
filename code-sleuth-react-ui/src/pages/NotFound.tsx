import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-7xl font-bold">{t("notFound.title")}</h1>
      <h2 className="text-2xl font-semibold">{t("notFound.heading")}</h2>
      <p className="max-w-md text-muted-foreground">
        {t("notFound.description")}
      </p>
      <Button asChild className="mt-4">
        <Link to="/">{t("notFound.backHome")}</Link>
      </Button>
    </div>
  );
};

export default NotFound;
