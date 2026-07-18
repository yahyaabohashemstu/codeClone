import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Masthead,
  MetaStrip,
  FieldSheet,
  Field,
  Panel,
  Serial,
  Tag,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  DocFrame,
  RailNav,
  DocSection,
} from "@/components/dossier/Dossier";

interface FaqItem {
  question: string;
  answer: string;
}

const Help = () => {
  const { t } = useTranslation("help");

  const faqItems = t("help.faq.items", { returnObjects: true }) as FaqItem[];

  // Categorical channel classifications (mono code tags, not translated prose).
  const supportCards = [
    {
      type: "REFERENCE",
      endpoint: "/help#faq",
      response: "INSTANT",
      titleKey: "help.support.docs.title",
      descKey: "help.support.docs.description",
      actionKey: "help.support.docs.action",
      href: "/help#faq",
    },
    {
      type: "LIVE",
      endpoint: "/chat",
      response: "REAL-TIME",
      titleKey: "help.support.chat.title",
      descKey: "help.support.chat.description",
      actionKey: "help.support.chat.action",
      href: "/chat",
    },
    {
      type: "ASYNC",
      endpoint: "hello@clonelens.com",
      response: "24H",
      titleKey: "help.support.email.title",
      descKey: "help.support.email.description",
      actionKey: "help.support.email.action",
      mailto: "mailto:hello@clonelens.com",
    },
  ];

  // Index-aligned topic codes for the FAQ gutter (content-accurate, mono codes).
  const faqTopics = ["LANGUAGES", "DETECTION", "UPLOAD", "SCORING", "API", "SECURITY"];

  // Every FAQ row is stamped #faq-01…#faq-NN, so a quick link can land on its own
  // question instead of dumping the reader at the top of §03. Resolved by topic
  // code rather than a hard index, so reordering the FAQ cannot silently misaim a
  // link; an unknown code falls back to the section anchor.
  const faqAnchor = (topic: string) => {
    const i = faqTopics.indexOf(topic);
    return i >= 0 ? `#faq-${String(i + 1).padStart(2, "0")}` : "#faq";
  };

  const quickLinks = [
    { labelKey: "help.quickLinks.runAnalysis", href: "/analysis" },
    { labelKey: "help.quickLinks.viewResults", href: "/results" },
    { labelKey: "help.quickLinks.securityFaq", href: faqAnchor("SECURITY") },
    { labelKey: "help.quickLinks.apiGuide", href: faqAnchor("API") },
  ];

  const sections = [
    { id: "support", n: "01", label: t("help.support.title", { defaultValue: "Support channels" }), count: supportCards.length },
    { id: "navigation", n: "02", label: t("help.quickLinks.title"), count: quickLinks.length },
    { id: "faq", n: "03", label: t("help.faq.title"), count: faqItems.length },
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
          <Button asChild size="sm" className="h-9 text-sm">
            <Link to="/chat">{t("help.support.chat.action")}</Link>
          </Button>
        }
      />

      {/* Instrument-document body — a §-numbered contents rail with live tallies
          beside a wide main column of ruled §-sections. */}
      <DocFrame
        rail={
          <RailNav
            label={t("help.contents", { defaultValue: "Contents" })}
            ariaLabel={t("help.contents", { defaultValue: "Contents" })}
            items={sections.map((section) => ({
              n: section.n,
              label: section.label,
              count: String(section.count).padStart(2, "0"),
              href: `#${section.id}`,
            }))}
          />
        }
      >
        {/* §01 — Support channels as margin-label fields; each carries a channel
               class tag and a mono TYPE/ENDPOINT/RESPONSE header line. */}
        <DocSection
          n="01"
          id="support"
          title={t("help.support.title", { defaultValue: "Support channels" })}
          note={String(supportCards.length).padStart(2, "0")}
        >
          <FieldSheet>
            {supportCards.map((card, i) => (
              <Field
                key={card.titleKey}
                label={
                  <span className="flex items-center gap-2">
                    <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                    <span className="min-w-0 truncate">{t(card.titleKey)}</span>
                  </span>
                }
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <Tag tone="neutral">{card.type}</Tag>
                      <p className="max-w-[52ch] t-sm leading-relaxed">{t(card.descKey)}</p>
                    </div>
                    {card.href ? (
                      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                        <Link to={card.href}>{t(card.actionKey)}</Link>
                      </Button>
                    ) : card.mailto ? (
                      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                        <a href={card.mailto}>{t(card.actionKey)}</a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                        {t(card.actionKey)}
                      </Button>
                    )}
                  </div>
                  <MetaStrip
                    items={[
                      { label: "ENDPOINT", value: <span dir="ltr">{card.endpoint}</span> },
                      { label: "RESPONSE", value: card.response },
                    ]}
                  />
                </div>
              </Field>
            ))}
          </FieldSheet>
        </DocSection>

        {/* §02 — Quick links as a ruled register ledger: IDX · DESTINATION · TARGET */}
        <DocSection
          n="02"
          id="navigation"
          title={t("help.quickLinks.title")}
          note={String(quickLinks.length).padStart(2, "0")}
        >
          <Ledger columns="4rem minmax(0,1fr) auto">
            <LedgerHead cells={["IDX", "DESTINATION", "TARGET"]} aligns={["start", "start", "end"]} />
            {quickLinks.map((link, i) => (
              <LedgerRow key={link.labelKey} to={link.href}>
                <LedgerCell>
                  <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                </LedgerCell>
                <LedgerCell className="text-sm text-foreground">{t(link.labelKey)}</LedgerCell>
                <LedgerCell align="end" mono className="text-xs text-muted-foreground">
                  <span dir="ltr">{link.href}</span>
                </LedgerCell>
              </LedgerRow>
            ))}
          </Ledger>
        </DocSection>

        {/* §03 — FAQ as a ruled definition list, topic-stamped, prose kept (no accordion) */}
        <DocSection
          n="03"
          id="faq"
          title={t("help.faq.title")}
          note={String(faqItems.length).padStart(2, "0")}
        >
          <Panel bodyClassName="p-0">
            <dl className="divide-y divide-border">
              {faqItems.map((item, i) => (
                // Each row wrapper holds <dt> and <dd> directly, so the term/definition
                // pairing survives; the gutter (serial + topic) rides inside the <dt>
                // and borrows the wrapper's tracks via subgrid to keep the two-column
                // layout. scroll-mt-20 clears the sticky header on a #faq-NN jump.
                <div
                  key={`faq-${String(i + 1).padStart(2, "0")}`}
                  id={`faq-${String(i + 1).padStart(2, "0")}`}
                  className="grid scroll-mt-20 grid-cols-1 gap-x-5 gap-y-2 px-5 py-5 sm:grid-cols-[minmax(3rem,5rem)_1fr] sm:px-6"
                >
                  <dt className="grid grid-cols-1 items-start gap-x-5 gap-y-2 sm:col-span-2 sm:grid-cols-subgrid">
                    <span className="flex flex-row items-center gap-2 pt-0.5 sm:flex-col sm:items-start">
                      <Serial tone="muted">{`Q${String(i + 1).padStart(2, "0")}`}</Serial>
                      {faqTopics[i] && <Tag tone="neutral">{faqTopics[i]}</Tag>}
                    </span>
                    <span className="min-w-0 t-h5 text-foreground">{item.question}</span>
                  </dt>
                  <dd className="min-w-0 t-sm leading-relaxed text-muted-foreground sm:col-start-2">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </DocSection>
      </DocFrame>
    </div>
  );
};

export default Help;
