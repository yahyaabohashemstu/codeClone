import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Masthead, Panel } from "@/components/dossier/Dossier";
import { IconArrowRight } from "@/components/bench/icons";

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * The operator's manual: a contents rail, a service directory, a route list,
 * and a ruled Q/A reference — every section a labelled, hairline-ruled list.
 */
const Help = () => {
  const { t } = useTranslation("help");

  const faqItems = t("help.faq.items", { returnObjects: true }) as FaqItem[];

  const supportCards = [
    {
      titleKey: "help.support.docs.title",
      descKey: "help.support.docs.description",
      actionKey: "help.support.docs.action",
      href: "/help#faq",
    },
    {
      titleKey: "help.support.chat.title",
      descKey: "help.support.chat.description",
      actionKey: "help.support.chat.action",
      href: "/chat",
    },
    {
      titleKey: "help.support.email.title",
      descKey: "help.support.email.description",
      actionKey: "help.support.email.action",
      mailto: "mailto:hello@clonelens.com",
    },
  ];

  const quickLinks = [
    { labelKey: "help.quickLinks.runAnalysis", href: "/analysis" },
    { labelKey: "help.quickLinks.viewResults", href: "/results" },
    { labelKey: "help.quickLinks.securityFaq", href: "#faq" },
    { labelKey: "help.quickLinks.apiGuide", href: "#faq" },
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

  const ordinal = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <div className="pt-7">
      <Masthead
        kicker={t("nav.help", { ns: "common" })}
        title={t("help.title")}
        description={t("help.subtitle")}
        actions={
          <Button asChild>
            <Link to="/chat">
              {t("help.support.chat.action")}
              <IconArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        }
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,12rem)_1fr] lg:gap-14">
        {/* Contents rail */}
        <nav aria-label={t("help.title")} className="hidden lg:block">
          <div className="sticky top-20">
            <span className="label block border-b border-bench-strong pb-3 text-txt-muted">
              {t("help.contents", { defaultValue: "Contents" })}
            </span>
            <ol className="divide-y divide-bench-hair">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="group flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt-secondary transition-colors group-hover:text-txt-primary">
                      {section.label}
                    </span>
                    <span className="mono-ordinal text-txt-faint">{section.tally}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {/* Support channels — the service directory */}
          <section id="support" className="scroll-mt-20">
            <Panel
              label={sections[0].label}
              actions={<span className="mono-meta text-txt-muted">{sections[0].tally}</span>}
              bodyClassName="p-0"
            >
              <div className="divide-y divide-bench-hair">
                {supportCards.map((card, i) => {
                  const action = (
                    <>
                      {t(card.actionKey)}
                      <IconArrowRight size={14} className="rtl:-scale-x-100" />
                    </>
                  );
                  const linkClass = "link inline-flex shrink-0 items-center gap-1.5 text-[13px] sm:justify-self-end";
                  return (
                    <div key={card.titleKey} className="grid gap-x-6 gap-y-3 px-5 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
                      <span className="mono-ordinal hidden text-txt-muted sm:block">{ordinal(i)}</span>
                      <div className="min-w-0">
                        <h3 className="t-h5 text-txt-primary">{t(card.titleKey)}</h3>
                        <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-txt-secondary">{t(card.descKey)}</p>
                      </div>
                      {card.href ? (
                        <Link to={card.href} className={linkClass}>
                          {action}
                        </Link>
                      ) : (
                        <a href={card.mailto} className={linkClass}>
                          {action}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </section>

          {/* Quick links — the route list */}
          <section id="navigation" className="scroll-mt-20">
            <Panel
              label={sections[1].label}
              actions={<span className="mono-meta text-txt-muted">{sections[1].tally}</span>}
              bodyClassName="p-0"
            >
              <div className="divide-y divide-bench-hair">
                {quickLinks.map((link, i) => (
                  <Link key={link.labelKey} to={link.href} className="group flex h-12 items-center gap-4 px-5">
                    <span className="mono-ordinal w-10 shrink-0 text-txt-muted">{ordinal(i)}</span>
                    <span className="link min-w-0 flex-1 truncate text-[13px]">{t(link.labelKey)}</span>
                    <IconArrowRight size={14} className="shrink-0 text-txt-muted opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                  </Link>
                ))}
              </div>
            </Panel>
          </section>

          {/* FAQ — the ruled Q/A reference */}
          <section id="faq" className="scroll-mt-20">
            <Panel
              label={sections[2].label}
              actions={<span className="mono-meta text-txt-muted">{sections[2].tally}</span>}
              bodyClassName="p-0"
            >
              <dl className="divide-y divide-bench-hair">
                {faqItems.map((item, i) => (
                  <div key={i} className="px-5 py-6">
                    <dt className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                      <span aria-hidden className="label pt-0.5 text-txt-muted">
                        Q{ordinal(i)}
                      </span>
                      <span className="t-h5 text-txt-primary" style={{ textWrap: "balance" }}>
                        {item.question}
                      </span>
                    </dt>
                    <dd className="mt-3 grid grid-cols-[2.5rem_1fr] gap-x-3">
                      <span aria-hidden className="label pt-0.5 text-txt-faint">
                        A
                      </span>
                      <span className="body-lg max-w-[68ch] text-txt-secondary">{item.answer}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Help;
