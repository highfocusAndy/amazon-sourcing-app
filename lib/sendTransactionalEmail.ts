export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one transactional email. Production: set RESEND_API_KEY and EMAIL_FROM (verified domain or Resend test).
 * Development without Resend: logs the text body to the server console (link still works if copied).
 */
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!key) {
    if (process.env.NODE_ENV === "development") {
      console.info("\n--- Password reset email (dev, no RESEND_API_KEY) ---");
      console.info(`To: ${opts.to}`);
      console.info(`Subject: ${opts.subject}`);
      console.info(opts.text);
      console.info("--- end ---\n");
      return { ok: true };
    }
    return { ok: false, error: "Email is not configured (set RESEND_API_KEY and EMAIL_FROM)." };
  }

  if (!from) {
    return { ok: false, error: "EMAIL_FROM is required when using RESEND_API_KEY." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
    if (!res.ok) {
      const msg =
        data.message ??
        data.error?.message ??
        (typeof data === "object" ? JSON.stringify(data) : `HTTP ${res.status}`);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }
}

export function passwordResetEmailContent(opts: { resetUrl: string; appLabel: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { resetUrl, appLabel } = opts;
  const subject = `Reset your ${appLabel} password`;
  const text = [
    `We received a request to reset the password for your ${appLabel} account.`,
    ``,
    `Open this link to choose a new password (it expires in about one hour):`,
    resetUrl,
    ``,
    `If you did not ask for this, you can ignore this email.`,
  ].join("\n");
  const html = `
  <p>We received a request to reset the password for your <strong>${escapeHtml(appLabel)}</strong> account.</p>
  <p><a href="${escapeAttr(resetUrl)}">Choose a new password</a></p>
  <p style="color:#64748b;font-size:14px">This link expires in about one hour. If you did not ask for this, you can ignore this email.</p>
  `.trim();
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
