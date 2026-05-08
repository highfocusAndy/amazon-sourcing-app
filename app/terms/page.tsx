import type { Metadata } from "next";
import { LegalDocShell } from "@/app/legal/LegalDocShell";
import { legalOperatorName, legalPublicContactEmail } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: true, follow: true },
};

const UPDATED = "May 8, 2026";

export default function TermsPage() {
  const operator = legalOperatorName();
  const contact = legalPublicContactEmail();

  return (
    <LegalDocShell title="Terms of Service" updated={UPDATED}>
      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Template — not legal advice</p>
        <p className="mt-2">
          Replace this page with counsel-reviewed terms before relying on it in production. Set{" "}
          <code className="rounded bg-white/80 px-1 py-0.5 text-xs">NEXT_PUBLIC_LEGAL_ENTITY</code> and a public support
          email in your environment.
        </p>
      </section>

      <section className="space-y-3">
        <h2>1. Agreement</h2>
        <p>
          These Terms govern your use of the software and services operated by <strong>{operator}</strong> (the
          &quot;Service&quot;). By accessing or using the Service, you agree to these Terms. If you do not agree, do not use
          the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2>2. The Service</h2>
        <p>
          The Service provides tools for Amazon seller research and workflow support. Features may change. We do not
          guarantee uninterrupted availability, accuracy of third-party data, or any particular business outcome.
        </p>
      </section>

      <section className="space-y-3">
        <h2>3. Accounts &amp; Amazon</h2>
        <p>You are responsible for safeguarding your credentials. You must comply with Amazon&apos;s policies when using your seller account and connected integrations. We may suspend access for abuse, security risk, or legal obligations.</p>
      </section>

      <section className="space-y-3">
        <h2>4. Billing</h2>
        <p>
          Paid plans are processed by Stripe. Fees, renewals, trials, and cancellations follow the checkout flow and
          Stripe Customer Portal. Taxes may apply where required.
        </p>
      </section>

      <section className="space-y-3">
        <h2>5. Acceptable use</h2>
        <ul>
          <li>No unlawful, fraudulent, or infringing activity.</li>
          <li>No attempts to break security, overload systems, or scrape beyond normal product use.</li>
          <li>No use of the Service to violate Amazon&apos;s terms or intellectual property rights.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>6. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
          MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE, TO THE MAXIMUM EXTENT PERMITTED BY LAW.
        </p>
      </section>

      <section className="space-y-3">
        <h2>7. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF THESE TERMS OR THE
          SERVICE SHALL NOT EXCEED THE AMOUNTS YOU PAID TO US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM (OR ONE HUNDRED
          DOLLARS IF NONE).
        </p>
      </section>

      <section className="space-y-3">
        <h2>8. Changes</h2>
        <p>
          We may update these Terms by posting a revised version with a new &quot;Last updated&quot; date. Continued use after
          changes constitutes acceptance to the extent permitted by law.
        </p>
      </section>

      <section className="space-y-3">
        <h2>9. Contact</h2>
        <p>
          Questions about these Terms:{contact ? (
            <>
              {" "}
              <a href={`mailto:${contact}`} className="font-medium text-teal-700 hover:underline">
                {contact}
              </a>
              .
            </>
          ) : (
            " Add SUPPORT_EMAIL or NEXT_PUBLIC_SUPPORT_EMAIL."
          )}
        </p>
      </section>
    </LegalDocShell>
  );
}
