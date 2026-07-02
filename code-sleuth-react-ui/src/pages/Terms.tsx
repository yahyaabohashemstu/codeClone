import { Link } from "react-router-dom";

// NOTE: This is a starting template — review and adapt with legal counsel and
// insert your company/jurisdiction details before going live.
const Terms = () => (
  <div className="mx-auto max-w-3xl space-y-5 py-4">
    <h1 className="t-h2">Terms of Service</h1>
    <p className="t-sm">Last updated: (set on publish)</p>

    <section className="space-y-2">
      <h2 className="t-h4">1. Agreement</h2>
      <p className="t-body">By creating an account or using CodeSimilar (the "Service") you agree to these Terms. If you do not agree, do not use the Service.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">2. Accounts</h2>
      <p className="t-body">You are responsible for safeguarding your credentials and for all activity under your account. Notify us of any unauthorized use. We may enable two-factor authentication to protect your account.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">3. Acceptable use</h2>
      <p className="t-body">You may submit code you have the right to analyze. You may not use the Service to violate the law, infringe others' rights, or attempt to disrupt or reverse-engineer the platform.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">4. Plans, billing & quotas</h2>
      <p className="t-body">Paid plans are billed via our payment processor. Usage quotas apply per plan and reset monthly. You may cancel at any time; access continues until the end of the paid period.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">5. Detection results</h2>
      <p className="t-body">Similarity and clone-detection results are provided as decision support, not as definitive proof of copying or plagiarism. You are responsible for how you interpret and act on them.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">6. Termination</h2>
      <p className="t-body">You may delete your account at any time. We may suspend or terminate accounts that violate these Terms.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">7. Disclaimer & liability</h2>
      <p className="t-body">The Service is provided "as is" without warranties. To the maximum extent permitted by law, our liability is limited as described here (insert your limitation).</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">8. Contact</h2>
      <p className="t-body">Questions about these Terms: (insert contact email). See also our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.</p>
    </section>
    <p><Link to="/" className="text-primary hover:underline">← Home</Link></p>
  </div>
);

export default Terms;
