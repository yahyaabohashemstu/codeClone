import { Button } from "@/components/ui/button";
import {
  Mail,
  MessageSquare,
  BookOpen,
  ExternalLink,
  ArrowRight,
  Code2,
  GitCompare,
  Lock,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Masthead, RegMark, SectionHead } from "@/components/dossier/Dossier";

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * The operator's manual: a contents rail, a service directory, a route list,
 * and a printed Q./A. reference — sections named, never numbered.
 */
const Help = () => {
  const { t } = useTranslation("help");

  const faqItems = t("help.faq.items", { returnObjects: true }) as FaqItem[];

  const supportCards = [
    {
      icon: BookOpen,
      titleKey: "help.support.docs.title",
      descKey: "help.support.docs.description",
      actionKey: "help.support.docs.action",
      href: "/help#faq",
    },
    {
      icon: MessageSquare,
      titleKey: "help.support.chat.title",
      descKey: "help.support.chat.description",
      actionKey: "help.support.chat.action",
      href: "/chat",
    },
    {
      icon: Mail,
      titleKey: "help.support.email.title",
      descKey: "help.support.email.description",
      actionKey: "help.support.email.action",
      mailto: "mailto:hello@clonelens.com",
    },
  ];

  const quickLinks = [
    { icon: Code2, labelKey: "help.quickLinks.runAnalysis", href: "/analysis" },
    { icon: GitCompare, labelKey: "help.quickLinks.viewResults", href: "/results" },
    { icon: Lock, labelKey: "help.quickLinks.securityFaq", href: "#faq" },
    { icon: Terminal, labelKey: "help.quickLinks.apiGuide", href: "#faq" },
  ];

  const sections = [
    {
      id: "support",
      label: t("help.support.title", { defaultValue: "Support channels" }),
      tally: String(supportCards.length).padStart(2, "0"),
    },
    {
      id: "navigation",
      label: t("help.quickLinks.title"),
      tally: String(quickLinks.length).padStart(2, "0"),
    },
    {
      id: "faq",
      label: t("help.faq.title"),
      tally: String(faqItems.length).padStart(2, "0"),
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <Masthead
        kicker={t("help.eyebrow", { defaultValue: "Support & docs" })}
        title={t("help.title")}
        description={t("help.subtitle")}
        actions={
          <Button asChild size="sm" className="h-9 gap-1.5 text-sm">
            <Link to="/chat">
              {t("help.support.chat.action")}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,12rem)_1fr] lg:gap-12">
        {/* The manual's contents rail */}
        <nav aria-label={t("help.title")} className="hidden lg:block">
          <div className="sticky top-20">
            <p className="t-label mb-1 border-b-2 border-foreground pb-2 text-foreground">
              {t("help.contents", { defaultValue: "Contents" })}
            </p>
            <ol className="divide-y divide-border">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="group flex items-baseline gap-2.5 py-3 transition-colors hover:bg-muted/60"
                  >
                    <RegMark className="h-2.5 w-2.5 shrink-0 translate-y-px text-muted-foreground transition-colors group-hover:text-primary" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {section.label}
                    </span>
                    <span className="press-slug text-[9px]">{section.tally}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-12">
          {/* Support channels — the service directory */}
          <section id="support" className="scroll-mt-20">
            <SectionHead
              title={t("help.support.title", { defaultValue: "Support channels" })}
              aside={sections[0].tally}
            />
            <div className="divide-y divide-border border border-border bg-card">
              {supportCards.map((card) => {
                const Icon = card.icon;
                const action = (
                  <>
                    {t(card.actionKey)}
                    {card.mailto ? <ExternalLink className="h-3 w-3" /> : <ArrowRight className="h-3 w-3 rtl:rotate-180" />}
                  </>
                );
                return (
                  <div key={card.titleKey} className="grid gap-x-6 gap-y-2 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <h3 className="t-h5 flex items-center gap-2.5 text-foreground">
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        {t(card.titleKey)}
                      </h3>
                      <p className="t-sm mt-1.5 max-w-[56ch] leading-relaxed">{t(card.descKey)}</p>
                    </div>
                    {card.href ? (
                      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 justify-self-start text-xs sm:justify-self-end">
                        <Link to={card.href}>{action}</Link>
                      </Button>
                    ) : card.mailto ? (
                      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 justify-self-start text-xs sm:justify-self-end">
                        <a href={card.mailto}>{action}</a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 justify-self-start text-xs sm:justify-self-end">
                        {action}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Quick links — the route list */}
          <section id="navigation" className="scroll-mt-20">
            <SectionHead title={t("help.quickLinks.title")} aside={sections[1].tally} />
            <div className="divide-y divide-border border-b border-border">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.labelKey}
                    to={link.href}
                    className="group flex items-center gap-3.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="press-slug min-w-0 truncate text-foreground">{t(link.labelKey)}</span>
                    <ArrowRight className="ms-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* FAQ — printed Q./A. reference */}
          <section id="faq" className="scroll-mt-20">
            <SectionHead title={t("help.faq.title")} aside={sections[2].tally} />
            <dl className="divide-y divide-border border-b border-border">
              {faqItems.map((item, i) => (
                <div key={i} className="py-6">
                  <dt className="grid grid-cols-[2.25rem_1fr] gap-x-3">
                    <span
                      aria-hidden
                      className="select-none font-display text-xl font-extrabold leading-tight text-plate-a-deep"
                      style={{ fontStretch: "122%" }}
                    >
                      Q
                    </span>
                    <span className="t-h5 text-foreground" style={{ textWrap: "balance" }}>{item.question}</span>
                  </dt>
                  <dd className="mt-2.5 grid grid-cols-[2.25rem_1fr] gap-x-3">
                    <span
                      aria-hidden
                      className="select-none font-display text-xl font-extrabold leading-tight text-plate-b-deep"
                      style={{ fontStretch: "122%" }}
                    >
                      A
                    </span>
                    <span className="t-sm max-w-[68ch] leading-relaxed">{item.answer}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Help;
