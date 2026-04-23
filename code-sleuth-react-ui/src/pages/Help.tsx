import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  FileQuestion,
  HelpCircle,
  Mail,
  MessageSquare,
  BookOpen,
  ExternalLink,
  Code2,
  GitCompare,
  Shield,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface FaqItem {
  question: string;
  answer: string;
}

const Help = () => {
  const { t } = useTranslation("help");

  const faqItems = t("help.faq.items", { returnObjects: true }) as FaqItem[];

  const supportCards = [
    {
      icon: BookOpen,
      titleKey: "help.support.docs.title",
      descKey: "help.support.docs.description",
      actionKey: "help.support.docs.action",
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/help#faq",
    },
    {
      icon: MessageSquare,
      titleKey: "help.support.chat.title",
      descKey: "help.support.chat.description",
      actionKey: "help.support.chat.action",
      color: "text-success",
      bg: "bg-success/10",
      href: "/chat",
    },
    {
      icon: Mail,
      titleKey: "help.support.email.title",
      descKey: "help.support.email.description",
      actionKey: "help.support.email.action",
      color: "text-accent",
      bg: "bg-accent/10",
      mailto: "mailto:support@codesimilar.com",
    },
  ];

  const quickLinks = [
    { icon: Code2, labelKey: "help.quickLinks.runAnalysis", href: "/analysis" },
    { icon: GitCompare, labelKey: "help.quickLinks.viewResults", href: "/results" },
    { icon: Shield, labelKey: "help.quickLinks.securityFaq", href: "#faq" },
    { icon: Zap, labelKey: "help.quickLinks.apiGuide", href: "#faq" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          {t("help.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("help.subtitle")}
        </p>
      </div>

      {/* Support cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {supportCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.titleKey} className="card-premium p-5 space-y-3">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t(card.titleKey)}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t(card.descKey)}</p>
              </div>
              {card.href ? (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs border-border/60 gap-1.5">
                  <Link to={card.href}>
                    {t(card.actionKey)}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              ) : card.mailto ? (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs border-border/60 gap-1.5">
                  <a href={card.mailto}>
                    {t(card.actionKey)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs border-border/60 gap-1.5">
                  {t(card.actionKey)}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="card-premium p-5">
        <h2 className="text-sm font-semibold mb-4 text-foreground">{t("help.quickLinks.title")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.labelKey}
                to={link.href}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/10 px-4 py-3 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary group"
              >
                <Icon className="h-4 w-4 shrink-0 group-hover:text-primary transition-colors" />
                {t(link.labelKey)}
                <ExternalLink className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="card-premium overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("help.faq.title")}</h2>
        </div>
        <div className="p-5">
          <Accordion type="single" collapsible className="space-y-1" id="faq">
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border/40 rounded-lg px-4 overflow-hidden">
                <AccordionTrigger className="text-sm font-medium text-foreground hover:text-primary py-3 hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
};

export default Help;
