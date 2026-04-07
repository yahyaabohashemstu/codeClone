
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";

const NotFound = () => {
  const { language } = useLanguage();
  const copy =
    language === "ar"
      ? {
          title: "الصفحة غير موجودة",
          description: "الصفحة التي تبحث عنها غير موجودة أو تم نقلها.",
          home: "العودة إلى الرئيسية",
        }
      : {
          title: "Page Not Found",
          description: "The page you are looking for doesn't exist or has been moved.",
          home: "Return to Home",
        };

  return (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-7xl font-bold">404</h1>
      <h2 className="text-2xl font-semibold">{copy.title}</h2>
      <p className="max-w-md text-muted-foreground">
        {copy.description}
      </p>
      <Button asChild className="mt-4">
        <Link to="/">{copy.home}</Link>
      </Button>
    </div>
  );
};

export default NotFound;
