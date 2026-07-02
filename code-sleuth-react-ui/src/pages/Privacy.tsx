import { Link } from "react-router-dom";

// NOTE: Starting template — review with counsel, add your legal entity, data
// processor list, and jurisdiction specifics before publishing.
const Privacy = () => (
  <div className="mx-auto max-w-3xl space-y-5 py-4">
    <h1 className="t-h2">Privacy Policy</h1>
    <p className="t-sm">Last updated: (set on publish)</p>

    <section className="space-y-2">
      <h2 className="t-h4">1. Data we collect</h2>
      <p className="t-body">Account data (username, email), the code you submit for analysis, analysis results and history, subscription/usage records, and security events (with IP addresses stored only as one-way hashes).</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">2. How we use it</h2>
      <p className="t-body">To provide the Service (run analyses, keep your history), operate billing and quotas, secure your account, and communicate essential notices (verification, password reset).</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">3. Processors</h2>
      <p className="t-body">We use third-party processors for payments and email delivery (insert names, e.g. Stripe, your SMTP provider). They process data only to provide their service.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">4. Retention</h2>
      <p className="t-body">We keep your data while your account is active. Enterprise workspaces apply configurable retention. You can delete your account and data at any time from Settings.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">5. Your rights</h2>
      <p className="t-body">You can export a machine-readable copy of your data and permanently delete your account from the Settings page. For other requests (rectification, restriction), contact us.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">6. Cookies</h2>
      <p className="t-body">We use a strictly-necessary session cookie for authentication and store your theme/language preference locally. We do not use advertising cookies.</p>
    </section>
    <section className="space-y-2">
      <h2 className="t-h4">7. Contact</h2>
      <p className="t-body">Privacy questions or requests: (insert contact email). See also our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>.</p>
    </section>
    <p><Link to="/" className="text-primary hover:underline">← Home</Link></p>
  </div>
);

export default Privacy;
