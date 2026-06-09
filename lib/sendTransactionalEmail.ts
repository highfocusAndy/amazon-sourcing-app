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

export function trialExpiryReminderEmailContent(opts: {
  appLabel: string;
  upgradeUrl: string;
  daysLeft: number;
}): { subject: string; html: string; text: string } {
  const { appLabel, upgradeUrl, daysLeft } = opts;
  const subject = `Your ${appLabel} free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
  const text = [
    `Your ${appLabel} free trial expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
    ``,
    `You've had a chance to explore the tool — if it's been useful, upgrade to Starter to keep access:`,
    upgradeUrl,
    ``,
    `After your trial ends you'll need an active subscription to continue using ${appLabel}.`,
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");
  const html = `
  <p>Your <strong>${escapeHtml(appLabel)}</strong> free trial expires in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
  <p>If the tool has been useful, upgrade to Starter to keep full access:</p>
  <p><a href="${escapeAttr(upgradeUrl)}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 22px;border-radius:8px;font-weight:700;text-decoration:none;">Upgrade to Starter →</a></p>
  <p style="color:#64748b;font-size:13px">After your trial ends you'll need an active subscription to continue. Questions? Just reply to this email.</p>
  `.trim();
  return { subject, html, text };
}

export function welcomeEmailContent(opts: {
  appLabel: string;
  dashboardUrl: string;
  trialDays: number;
}): { subject: string; html: string; text: string } {
  const { appLabel, dashboardUrl, trialDays } = opts;
  const subject = `Welcome to ${appLabel} — your ${trialDays}-day trial starts now`;
  const text = [
    `Welcome to ${appLabel}!`,
    ``,
    `Your ${trialDays}-day free trial is active. You have 25 product analyses and 25 catalog searches to explore the tool.`,
    ``,
    `Get started here:`,
    dashboardUrl,
    ``,
    `First step: connect your Amazon seller account in Settings to unlock live SP-API data.`,
  ].join("\n");
  const html = `
  <p>Welcome to <strong>${escapeHtml(appLabel)}</strong>!</p>
  <p>Your <strong>${trialDays}-day free trial</strong> is active. You have 25 product analyses and 25 catalog searches to explore the tool.</p>
  <p><a href="${escapeAttr(dashboardUrl)}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 22px;border-radius:8px;font-weight:700;text-decoration:none;">Go to Dashboard →</a></p>
  <p style="color:#64748b;font-size:13px"><strong>First step:</strong> connect your Amazon seller account in Settings to unlock live SP-API data.</p>
  `.trim();
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
