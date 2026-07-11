import { Link } from "react-router-dom";

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
    <div className="t-label flex items-center gap-2.5">
      <span className="h-px w-6 bg-primary" />
      Legal
    </div>
    <h1 className="t-h2 mt-3">Privacy Policy</h1>
    <p className="t-sm mt-1 font-mono text-muted-foreground">Last updated: (set on publish)</p>

    <dl className="mt-8 divide-y divide-border border-y border-border">
      {sections.map((s) => (
        <div key={s.n} className="grid grid-cols-[auto_1fr] gap-x-4 py-5 sm:gap-x-6">
          <dt className="t-label pt-0.5 text-muted-foreground">{s.n}</dt>
          <dd>
            <h2 className="t-h4">{s.title}</h2>
            <p className="t-body mt-2">{s.body}</p>
          </dd>
        </div>
      ))}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 py-5 sm:gap-x-6">
        <dt className="t-label pt-0.5 text-muted-foreground">07</dt>
        <dd>
          <h2 className="t-h4">Contact</h2>
          <p className="t-body mt-2">
            Privacy questions or requests: (insert contact email). See also our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </dd>
      </div>
    </dl>

    <p className="mt-8">
      <Link to="/" className="text-primary hover:underline">
        ← Home
      </Link>
    </p>
  </div>
);

export default Privacy;
