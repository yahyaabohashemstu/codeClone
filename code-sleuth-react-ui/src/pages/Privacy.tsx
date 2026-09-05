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
    body: "We use third-party processors for payments (Stripe) and transactional email delivery (our SMTP provider). They process data only to provide their service.",
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

/** Legal text set as ruled prose on the bench: an ordinal in the gutter, a label heading, body copy. */
const Privacy = () => (
  <div className="max-w-[72ch] pt-7">
    <header className="flex flex-col gap-2.5 pb-6">
      <span className="label text-txt-muted">Legal</span>
      <h1 className="t-page text-txt-primary">Privacy Policy</h1>
      <span className="mono-meta text-txt-muted">Last updated: 13 July 2026</span>
    </header>

    <dl className="divide-y divide-bench-hair border-y border-bench-hair">
      {sections.map((s) => (
        <div key={s.n} className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-6">
          <dt className="mono-ordinal pt-0.5 text-txt-muted">{s.n}</dt>
          <dd>
            <h2 className="label text-txt-primary">{s.title}</h2>
            <p className="body-lg mt-2.5 text-txt-secondary">{s.body}</p>
          </dd>
        </div>
      ))}
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-4 py-6">
        <dt className="mono-ordinal pt-0.5 text-txt-muted">07</dt>
        <dd>
          <h2 className="label text-txt-primary">Contact</h2>
          <p className="body-lg mt-2.5 text-txt-secondary">
            Privacy questions or requests: hello@clonelens.com. See also our{" "}
            <Link to="/terms" className="link">
              Terms of Service
            </Link>
            .
          </p>
        </dd>
      </div>
    </dl>

    <p className="mt-8">
      <Link to="/" className="link text-[13px]">
        Home
      </Link>
    </p>
  </div>
);

export default Privacy;
