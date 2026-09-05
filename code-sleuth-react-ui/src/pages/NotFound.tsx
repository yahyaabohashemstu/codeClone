import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/** The misread: a route the instrument has no reading for. */
const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[72vh] flex-col items-center justify-center gap-6 pt-7 text-center">
      <h1 className="label text-txt-muted">{t("notFound.heading")}</h1>
      <span aria-hidden className="misreg t-display select-none text-[160px] text-txt-primary">
        404
      </span>
      <p className="body-lg max-w-[48ch] text-txt-secondary">{t("notFound.description")}</p>
      <Button asChild className="mt-1">
        <Link to="/">{t("notFound.backHome")}</Link>
      </Button>
    </div>
  );
};

export default NotFound;
