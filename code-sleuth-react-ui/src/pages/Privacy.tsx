import { Link } from "react-router-dom";
import { Masthead, SectionRule } from "@/components/dossier/Dossier";

// NOTE: Starting template — review with counsel, add your legal entity, data
// processor list, and jurisdiction specifics before publishing.
const sections = [
  {
    n: "01",
    title: "Data we collect",
    body: "Account data (username, email), the code you submit for analysis, analysis results and history, subscription/usage records, and security events (with IP addresses stored only as one-way hashes).",
  },
  {
    n: "02",
    title: "How we use it",
    body: "To provide the Service (run analyses, keep your history), operate billing and quotas, secure your account, and communicate essential notices (verification, password reset).",
  },
  {
    n: "03",
    title: "Processors",
    body: "We use third-party processors for payments and email delivery (insert names, e.g. Stripe, your SMTP provider). They process data only to provide their service.",
  },
  {
    n: "04",
    title: "Retention",
    body: "We keep your data while your account is active. Enterprise workspaces apply configurable retention. You can delete your account and data at any time from Settings.",
  },
  {
    n: "05",
    title: "Your rights",
    body: "You can export a machine-readable copy of your data and permanently delete your account from the Settings page. For other requests (rectification, restriction), contact us.",
  },
  {
    n: "06",
    title: "Cookies",
    body: "We use a strictly-necessary session cookie for authentication and store your theme/language preference locally. We do not use advertising cookies.",
  },
] as const;

const Privacy = () => (
  <div className="mx-auto max-w-3xl py-4">
    <Masthead
      kicker="Legal"
      title="Privacy Policy"
      meta={[{ label: "Updated", value: "(set on publish)" }]}
    />

    <div className="mt-8 max-w-[72ch] space-y-8">
      {sections.map((s) => (
        <section key={s.n}>
          <SectionRule n={s.n}>{s.title}</SectionRule>
          <p className="t-body">{s.body}</p>
        </section>
      ))}

      <section>
        <SectionRule n="07">Contact</SectionRule>
        <p className="t-body">
          Privacy questions or requests: (insert contact email). See also our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </section>
    </div>

    <div className="mt-10 border-t border-border pt-6">
      <Link
        to="/"
        className="font-mono text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
      >
        Home
      </Link>
    </div>
  </div>
);

export default Privacy;
