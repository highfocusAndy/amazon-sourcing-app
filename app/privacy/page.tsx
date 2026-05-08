import type { Metadata } from "next";
import { LegalDocShell } from "@/app/legal/LegalDocShell";
import { legalOperatorName, legalPublicContactEmail } from "@/lib/legalEntity";
import { publicSiteOrigin } from "@/lib/publicSiteUrl";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: true, follow: true },
};

const UPDATED = "May 8, 2026";

export default function PrivacyPage() {
  const operator = legalOperatorName();
  const contact = legalPublicContactEmail();
  let host = "your production domain";
  try {
    host = publicSiteOrigin().host;
  } catch {
    /* build without metadataBase */
  }

  return (
    <LegalDocShell title="Privacy Policy" updated={UPDATED}>
      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Template — not legal advice</p>
        <p className="mt-2">
          Customize this policy for your jurisdictions (GDPR, CPRA, etc.) with qualified counsel. Describes typical
          SaaS + Stripe + Amazon integration data practices at a high level.
        </p>
      </section>

      <section className="space-y-3">
        <h2>1. Who we are</h2>
        <p>
          This Policy describes how <strong>{operator}</strong> (&quot;we&quot;, &quot;us&quot;) handles information when you use our
          websites and applications (the &quot;Service&quot;), typically served from <strong>{host}</strong>.
        </p>
      </section>

      <section className="space-y-3">
        <h2>2. What we collect</h2>
        <ul>
          <li>
            <strong>Account data:</strong> email, name (if provided), authentication data, and billing identifiers
            supplied by you or Stripe.
          </li>
          <li>
            <strong>Usage &amp; product data:</strong> in-app actions, logs, and quotas needed to run the Service and
            prevent abuse.
          </li>
          <li>
            <strong>Amazon-related data:</strong> data made available through seller authorizations you initiate, used
            only to provide requested features.
          </li>
          <li>
            <strong>Support &amp; communications:</strong> messages you send us.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>3. How we use data</h2>
        <ul>
          <li>Provide, secure, and improve the Service.</li>
          <li>Process payments and subscriptions (via Stripe).</li>
          <li>Communicate about your account, outages, and legal notices.</li>
          <li>Comply with law and enforce our Terms.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>4. Sharing</h2>
        <p>
          We use infrastructure and payment processors as needed to operate the Service (for example hosting such as
          Railway, email providers if configured, Stripe for payments, Amazon APIs when you connect a seller account). We
          do not sell personal information. We may disclose data if required by law or to protect rights and safety.
        </p>
      </section>

      <section className="space-y-3">
        <h2>5. Retention</h2>
        <p>
          We retain data as long as your account is active and as needed for legal, tax, and dispute resolution
          obligations. You may request deletion where applicable; some records may be retained as the law requires.
        </p>
      </section>

      <section className="space-y-3">
        <h2>6. Security</h2>
        <p>
          We use industry-standard measures appropriate to our size and risk. No method of transmission or storage is
          perfectly secure.
        </p>
      </section>

      <section className="space-y-3">
        <h2>7. Your choices</h2>
        <p>
          You may access or update certain profile data in the app; you may contact us to exercise privacy rights
          available in your region, subject to verification and legal exceptions.
        </p>
      </section>

      <section className="space-y-3">
        <h2>8. International transfers</h2>
        <p>
          If you access the Service from outside the country where we operate infrastructure, your data may be
          processed across borders. Adjust this section with your actual locations and mechanisms (e.g., SCCs).
        </p>
      </section>

      <section className="space-y-3">
        <h2>9. Children</h2>
        <p>The Service is not directed to children under the age where parental consent is required in your region.</p>
      </section>

      <section className="space-y-3">
        <h2>10. Contact</h2>
        <p>
          Privacy inquiries:{contact ? (
            <>
              {" "}
              <a href={`mailto:${contact}`} className="font-medium text-teal-700 hover:underline">
                {contact}
              </a>
              .
            </>
          ) : (
            " Set SUPPORT_EMAIL or NEXT_PUBLIC_SUPPORT_EMAIL."
          )}
        </p>
      </section>
    </LegalDocShell>
  );
}
