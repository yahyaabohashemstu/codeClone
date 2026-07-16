import { Link } from "react-router-dom";
import { Masthead, SectionRule } from "@/components/dossier/Dossier";

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
    <Masthead
      kicker="Legal"
      title="Terms of Service"
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
        <SectionRule n="08">Contact</SectionRule>
        <p className="t-body">
          Questions about these Terms: (insert contact email). See also our{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
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

export default Terms;
