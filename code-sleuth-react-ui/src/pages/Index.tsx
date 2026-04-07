import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";

const Index = () => {
  const { language } = useLanguage();
  const copy =
    language === "ar"
      ? {
          title: "مرحبًا بك في CodeSimilar",
          description: "هذه صفحة احتياطية. يمكنك الانتقال مباشرة إلى الواجهة الأساسية للمنصة.",
          action: "الانتقال إلى الرئيسية",
        }
      : {
          title: "Welcome to CodeSimilar",
          description: "This is a fallback page. You can jump directly to the main product experience.",
          action: "Go to Home",
        };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="card-premium max-w-xl p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        <Button asChild className="mt-6">
          <Link to="/">{copy.action}</Link>
        </Button>
      </div>
    </div>
  );
};

export default Index;
