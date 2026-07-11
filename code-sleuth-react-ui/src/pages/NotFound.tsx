import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[72vh] items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-10 text-center">
        <div className="flex flex-col items-center gap-5">
          <div className="t-label flex items-center gap-2.5">
            <span className="h-px w-6 bg-primary" />
            <span>{t("notFound.title")}</span>
          </div>

          <Compass className="h-8 w-8 text-primary" />

          <h1 className="t-h2">{t("notFound.heading")}</h1>
          <p className="max-w-md t-body">{t("notFound.description")}</p>

          <Button asChild size="lg" className="mt-2 gap-2">
            <Link to="/">
              {t("notFound.backHome")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
