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
import { Masthead, FieldSheet, Field, SectionHead, Serial } from "@/components/dossier/Dossier";

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
      n: "01",
      label: t("help.support.title", { defaultValue: "Support channels" }),
      tally: `${String(supportCards.length).padStart(2, "0")} CHANNELS`,
    },
    {
      id: "navigation",
      n: "02",
      label: t("help.quickLinks.title"),
      tally: `${String(quickLinks.length).padStart(2, "0")} LINKS`,
    },
    {
      id: "faq",
      n: "03",
      label: t("help.faq.title"),
      tally: `${String(faqItems.length).padStart(2, "0")} ENTRIES`,
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <Masthead
        kicker={t("help.eyebrow", { defaultValue: "Support & docs" })}
        title={t("help.title")}
        description={t("help.subtitle")}
        meta={[
          { label: "SECTIONS", value: String(sections.length).padStart(2, "0") },
          { label: "ENTRIES", value: String(faqItems.length).padStart(2, "0") },
          { label: "CHANNELS", value: String(supportCards.length).padStart(2, "0") },
        ]}
        actions={
          <Button asChild size="sm" className="h-9 gap-1.5 text-sm">
            <Link to="/chat">
              {t("help.support.chat.action")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,11rem)_1fr] lg:gap-12">
        {/* Left mono index — editorial contents ledger */}
        <nav aria-label={t("help.title")} className="hidden lg:block">
          <div className="sticky top-6">
            <p className="t-label mb-2.5 border-b-2 border-foreground pb-2 text-foreground">
              {t("help.contents", { defaultValue: "Contents" })}
            </p>
            <ol className="divide-y divide-border">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="group flex flex-col gap-1 border-s-2 border-transparent -ms-0.5 py-2.5 ps-3 transition-colors hover:border-primary"
                  >
                    <span className="flex items-baseline gap-2 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                      <span className="tabular-nums">{section.n}</span>
                      <span className="truncate">{section.label}</span>
                    </span>
                    <span className="ps-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {section.tally}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* Right column — numbered reference sections */}
        <div className="min-w-0 space-y-10">
          {/* §01 — Support channels as a margin-label spec sheet (interactive → kept as a card) */}
          <section id="support" className="scroll-mt-6">
            <SectionHead
              marker="§01"
              title={t("help.support.title", { defaultValue: "Support channels" })}
              aside={sections[0].tally}
            />
            <FieldSheet>
              {supportCards.map((card, i) => {
                const Icon = card.icon;
                const action = (
                  <>
                    {t(card.actionKey)}
                    {card.mailto ? <ExternalLink className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                  </>
                );
                return (
                  <Field
                    key={card.titleKey}
                    label={
                      <span className="flex items-center gap-2">
                        <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                        <span className="min-w-0 truncate">{t(card.titleKey)}</span>
                      </span>
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="flex max-w-[52ch] items-start gap-2.5 t-sm leading-relaxed">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {t(card.descKey)}
                      </p>
                      {card.href ? (
                        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                          <Link to={card.href}>{action}</Link>
                        </Button>
                      ) : card.mailto ? (
                        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                          <a href={card.mailto}>{action}</a>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs">
                          {action}
                        </Button>
                      )}
                    </div>
                  </Field>
                );
              })}
            </FieldSheet>
          </section>

          {/* §02 — Quick links as a bare ruled ledger (heavy-rule head + hairline rows) */}
          <section id="navigation" className="scroll-mt-6">
            <SectionHead marker="§02" title={t("help.quickLinks.title")} aside={sections[1].tally} />
            <div className="divide-y divide-border border-b border-border">
              {quickLinks.map((link, i) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.labelKey}
                    to={link.href}
                    className="group -mx-2 flex items-center gap-3.5 rounded-sm px-2 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 truncate font-mono text-xs uppercase tracking-[0.08em]">
                      {t(link.labelKey)}
                    </span>
                    <ArrowRight className="ms-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* §03 — FAQ as a bare ruled definition list (dt/dd), numbered Q-exhibits */}
          <section id="faq" className="scroll-mt-6">
            <SectionHead marker="§03" title={t("help.faq.title")} aside={sections[2].tally} />
            <dl className="divide-y divide-border border-b border-border">
              {faqItems.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-x-5 gap-y-2 py-5 sm:grid-cols-[minmax(3rem,4rem)_1fr]"
                >
                  <div className="pt-0.5">
                    <Serial tone="primary">{`Q${String(i + 1).padStart(2, "0")}`}</Serial>
                  </div>
                  <div className="min-w-0">
                    <dt className="t-h5 text-foreground">{item.question}</dt>
                    <dd className="mt-2 t-sm leading-relaxed text-muted-foreground">{item.answer}</dd>
                  </div>
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
