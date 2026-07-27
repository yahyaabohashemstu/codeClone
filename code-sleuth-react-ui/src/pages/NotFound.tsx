import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Stamp } from "@/components/dossier/Dossier";

/** The misprint: this sheet came off the press with its plates apart. */
const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[72vh] items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <Stamp band="neutral">{t("notFound.offRegister", { defaultValue: "Off register" })}</Stamp>

        {/* The error code printed with its plates split apart */}
        <span
          aria-hidden
          className="misreg select-none font-display font-extrabold leading-none text-foreground"
          style={{ fontSize: "clamp(6rem, 18vw, 11rem)", fontStretch: "122%" }}
        >
          404
        </span>

        <h1 className="t-h2">{t("notFound.heading")}</h1>
        <p className="t-body max-w-md">{t("notFound.description")}</p>

        <Button asChild size="lg" className="mt-1">
          <Link to="/">{t("notFound.backHome")}</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
