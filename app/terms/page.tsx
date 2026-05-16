import type { Metadata } from "next";
import { LegalDocShell } from "@/app/legal/LegalDocShell";
import { legalOperatorName, legalPublicContactEmail } from "@/lib/legalEntity";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: true, follow: true },
};

const UPDATED = "May 13, 2026";

export default async function TermsPage() {
  const operator = legalOperatorName();
  const contact = legalPublicContactEmail();
  const dbContent = await prisma.legalContent.findUnique({ where: { slug: "tos" } }).catch(() => null);

  if (dbContent) {
    return (
      <LegalDocShell
        title={dbContent.title}
        updated={new Date(dbContent.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        dangerousHtml={dbContent.contentHtml}
      />
    );
  }

  return (
    <LegalDocShell title="Terms of Service" updated={UPDATED}>
      <section className="space-y-3">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using the software, website, and services operated by <strong>{operator}</strong>{" "}
          (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;).
          If you do not agree, you must not access or use the Service. These Terms form a legally binding agreement
          between you and <strong>{operator}</strong>.
        </p>
        <p>
          If you use the Service on behalf of an organization, you represent that you have authority to bind that
          organization to these Terms, and references to &quot;you&quot; include that organization.
        </p>
      </section>

      <section className="space-y-3">
        <h2>2. Description of the Service</h2>
        <p>
          The Service is a software platform designed to assist Amazon sellers in researching wholesale product
          sourcing opportunities. Features include product profitability analysis, sales rank estimation,
          competitive offer review, listing restriction checking, catalog search, and related sourcing intelligence
          tools.
        </p>
        <p>
          <strong>{operator}</strong> is an independent software provider and is not affiliated with, endorsed by,
          or sponsored by Amazon.com, Inc. or its subsidiaries. &quot;Amazon,&quot; &quot;FBA,&quot;
          &quot;Seller Central,&quot; and related marks are trademarks of Amazon.com, Inc.
        </p>
        <p>
          Features, pricing, and availability may change at any time. We do not guarantee uninterrupted
          availability, specific uptime, or any particular business outcome from use of the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2>3. Amazon API Data and Accuracy</h2>
        <p>
          The Service retrieves product, pricing, fee, and restriction data through the Amazon Selling Partner
          API (&quot;SP-API&quot;) and, optionally, the Amazon Product Advertising API (&quot;PA-API&quot;).
          By connecting your Amazon seller account, you authorize the Service to access your account data through
          these APIs solely to provide the features you request.
        </p>
        <ul>
          <li>
            <strong>Data accuracy:</strong> All product prices, sales ranks, fees, and restriction statuses are
            retrieved in real time from Amazon&apos;s APIs but may be delayed, incomplete, or subject to change
            without notice. The Service makes no warranty as to the accuracy, completeness, or timeliness of
            any data displayed.
          </li>
          <li>
            <strong>Not financial or investment advice:</strong> Profit estimates, ROI projections, and sourcing
            recommendations provided by the Service are illustrative tools only. They do not constitute
            financial, investment, legal, or business advice. You are solely responsible for your purchasing
            decisions and for conducting your own due diligence before purchasing inventory.
          </li>
          <li>
            <strong>Amazon policy compliance:</strong> You must independently ensure that your use of any
            connected Amazon seller account, and all sourcing and listing activities, complies with Amazon&apos;s
            then-current policies, terms of service, and seller agreements. The Service does not manage or
            guarantee your compliance with Amazon policies.
          </li>
          <li>
            <strong>Token security:</strong> When you connect an Amazon account via OAuth, the Service stores
            your SP-API authorization token in encrypted form. You may disconnect your Amazon account at any
            time from Settings.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>4. User Accounts</h2>
        <ul>
          <li>
            You must provide accurate and complete information when creating an account. You are responsible for
            maintaining the confidentiality of your credentials.
          </li>
          <li>
            You are responsible for all activity that occurs under your account. Notify us immediately if you
            suspect unauthorized access.
          </li>
          <li>
            Accounts are for individual use only. You may not share, sublicense, or resell access to the
            Service unless separately authorized in writing.
          </li>
          <li>
            You must be at least 18 years of age (or the age of majority in your jurisdiction) to create an
            account.
          </li>
          <li>
            We may suspend or terminate your account if we have reason to believe you have violated these Terms,
            pose a security risk, or where required by law.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>5. Subscriptions and Billing</h2>
        <p>
          Access to the Service may require a paid subscription. All billing is processed through Stripe, Inc.
          By subscribing, you also agree to Stripe&apos;s terms and privacy policy.
        </p>
        <ul>
          <li>
            <strong>Free trial:</strong> If a free trial is offered, access during the trial is subject to these
            Terms. We reserve the right to modify or discontinue trials at any time.
          </li>
          <li>
            <strong>Auto-renewal:</strong> Paid subscriptions renew automatically at the end of each billing
            period (monthly or as specified at checkout) until cancelled. You authorize us to charge your payment
            method on file for each renewal.
          </li>
          <li>
            <strong>Cancellation:</strong> You may cancel your subscription at any time through the Stripe
            Customer Portal (accessible from &quot;Plan &amp; billing&quot; in the app). Cancellation takes
            effect at the end of the current billing period; you retain access until that date.
          </li>
          <li>
            <strong>Refunds:</strong> Subscription fees are generally non-refundable except where required by
            applicable law. If you believe a charge was made in error, contact us promptly.
          </li>
          <li>
            <strong>Price changes:</strong> We may change subscription pricing upon reasonable notice. Continued
            use after the effective date of a price change constitutes acceptance of the new price.
          </li>
          <li>
            <strong>Taxes:</strong> Prices are exclusive of applicable taxes. You are responsible for any sales
            tax, VAT, or similar obligations applicable to your purchase.
          </li>
          <li>
            <strong>Usage limits:</strong> Each plan includes monthly usage quotas for certain features. Limits
            reset at the start of each billing period. Unused quota does not roll over.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>6. Acceptable Use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any applicable law or regulation, or the rights of any third party.</li>
          <li>
            Circumvent, disable, or interfere with security features, rate limits, or access controls of the
            Service or any connected API (including Amazon&apos;s SP-API).
          </li>
          <li>
            Automate requests in excess of the Service&apos;s intended usage, or use the Service to build a
            competing product or API aggregation service.
          </li>
          <li>
            Transmit malware, spam, or any content that is harmful, deceptive, defamatory, or infringing upon
            third-party intellectual property rights.
          </li>
          <li>Attempt to gain unauthorized access to other users&apos; accounts or data.</li>
          <li>
            Misrepresent your identity or affiliation, or use the Service to facilitate fraudulent activity.
          </li>
          <li>
            Violate Amazon&apos;s selling policies, intellectual property rights, or terms of service through
            actions facilitated by the Service.
          </li>
        </ul>
        <p>
          We reserve the right to investigate suspected violations and to suspend or terminate access without
          prior notice where we determine a violation has occurred or is likely occurring.
        </p>
      </section>

      <section className="space-y-3">
        <h2>7. Intellectual Property</h2>
        <p>
          The Service, including its software, design, text, graphics, and underlying code, is owned by{" "}
          <strong>{operator}</strong> or its licensors and is protected by applicable intellectual property laws.
          These Terms do not grant you any ownership rights in the Service.
        </p>
        <p>
          You retain ownership of any data you upload or submit to the Service (such as product lists or
          wholesale prices). By submitting such data, you grant us a limited license to process it solely for
          the purpose of providing the Service to you.
        </p>
      </section>

      <section className="space-y-3">
        <h2>8. Third-Party Services</h2>
        <p>
          The Service integrates with or links to third-party services including Amazon (SP-API and PA-API),
          Stripe (payments), Resend (transactional email), Upstash (rate limiting), OpenAI (optional AI
          features), and Railway (hosting infrastructure). Your use of those services is governed by their
          respective terms and privacy policies. We are not responsible for the practices or content of
          third-party services.
        </p>
      </section>

      <section className="space-y-3">
        <h2>9. Termination</h2>
        <p>
          Either party may terminate the agreement formed by these Terms at any time. You may do so by
          cancelling your subscription and ceasing use of the Service. We may terminate or suspend your access
          immediately, with or without notice, for breach of these Terms, non-payment, or as required by law.
        </p>
        <p>
          Upon termination, your right to use the Service ceases. Sections that by their nature should survive
          termination (including Disclaimers, Limitation of Liability, and Governing Law) will remain in effect.
        </p>
      </section>

      <section className="space-y-3">
        <h2>10. Disclaimer of Warranties</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND
          &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, OR UNINTERRUPTED OR
          ERROR-FREE OPERATION. WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR THAT DATA
          OBTAINED THROUGH THE SERVICE WILL BE ACCURATE OR RELIABLE.
        </p>
      </section>

      <section className="space-y-3">
        <h2>11. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL <strong>{operator}</strong>, ITS
          OFFICERS, DIRECTORS, EMPLOYEES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, GOODWILL,
          OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR RELATED TO THESE TERMS OR YOUR USE OF THE SERVICE, EVEN
          IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p>
          OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING UNDER THESE TERMS OR RELATED TO THE
          SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNTS YOU PAID TO US IN THE TWELVE (12)
          MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS (USD $100).
        </p>
        <p>
          SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN SUCH
          JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </p>
      </section>

      <section className="space-y-3">
        <h2>12. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless <strong>{operator}</strong> and its officers,
          directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and
          expenses (including reasonable legal fees) arising out of or related to: (a) your use of the Service;
          (b) your violation of these Terms; (c) your violation of any third-party rights, including Amazon
          policies; or (d) any data or content you submit through the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2>13. Governing Law</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the jurisdiction in which{" "}
          <strong>{operator}</strong> is established, without regard to conflict-of-law principles. You agree to
          submit to the exclusive jurisdiction of the courts in that jurisdiction for any disputes arising from
          these Terms or the Service.
        </p>
        <p>
          Notwithstanding the foregoing, we reserve the right to seek injunctive or other equitable relief in
          any jurisdiction to protect our intellectual property or confidential information.
        </p>
      </section>

      <section className="space-y-3">
        <h2>14. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. When we make material changes, we will post the revised
          Terms with a new &quot;Last updated&quot; date. Where required by law, we will provide additional notice
          (such as an in-app notification or email). Your continued use of the Service after the effective date
          of any update constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2>15. Contact</h2>
        <p>
          If you have questions about these Terms, please contact us
          {contact ? (
            <>
              {" "}at{" "}
              <a href={`mailto:${contact}`} className="font-medium text-teal-700 hover:underline">
                {contact}
              </a>
              .
            </>
          ) : (
            ". (Set SUPPORT_EMAIL or NEXT_PUBLIC_SUPPORT_EMAIL to display a contact address here.)"
          )}
        </p>
      </section>
    </LegalDocShell>
  );
}
