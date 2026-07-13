import { Link } from "react-router-dom";

// NOTE: This is a starting template — review and adapt with legal counsel and
// insert your company/jurisdiction details before going live.
const sections = [
  {
    n: "01",
    title: "Agreement",
    body: 'By creating an account or using Clone Lens (the "Service") you agree to these Terms. If you do not agree, do not use the Service.',
  },
  {
    n: "02",
    title: "Accounts",
    body: "You are responsible for safeguarding your credentials and for all activity under your account. Notify us of any unauthorized use. We may enable two-factor authentication to protect your account.",
  },
  {
    n: "03",
    title: "Acceptable use",
    body: "You may submit code you have the right to analyze. You may not use the Service to violate the law, infringe others' rights, or attempt to disrupt or reverse-engineer the platform.",
  },
  {
    n: "04",
    title: "Plans, billing & quotas",
    body: "Paid plans are billed via our payment processor. Usage quotas apply per plan and reset monthly. You may cancel at any time; access continues until the end of the paid period.",
  },
  {
    n: "05",
    title: "Detection results",
    body: "Similarity and clone-detection results are provided as decision support, not as definitive proof of copying or plagiarism. You are responsible for how you interpret and act on them.",
  },
  {
    n: "06",
    title: "Termination",
    body: "You may delete your account at any time. We may suspend or terminate accounts that violate these Terms.",
  },
  {
    n: "07",
    title: "Disclaimer & liability",
    body: 'The Service is provided "as is" without warranties. To the maximum extent permitted by law, our liability is limited as described here (insert your limitation).',
  },
] as const;

const Terms = () => (
  <div className="mx-auto max-w-3xl py-4">
    <div className="t-label flex items-center gap-2.5">
      <span className="h-px w-6 bg-primary" />
      Legal
    </div>
    <h1 className="t-h2 mt-3">Terms of Service</h1>
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
        <dt className="t-label pt-0.5 text-muted-foreground">08</dt>
        <dd>
          <h2 className="t-h4">Contact</h2>
          <p className="t-body mt-2">
            Questions about these Terms: (insert contact email). See also our{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-2 hover:opacity-70">
              Privacy Policy
            </Link>
            .
          </p>
        </dd>
      </div>
    </dl>

    <p className="mt-8">
      <Link to="/" className="text-foreground underline underline-offset-2 hover:opacity-70">
        ← Home
      </Link>
    </p>
  </div>
);

export default Terms;
