const NAVY = "#001A29";
const GREEN = "#00FF85";

/** Shared HTML shell: dark header band, white body card, mobile-responsive via a fluid max-width table layout. */
function emailShell(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TaxLaya</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 16px rgba(0,26,41,0.08);">
            <tr>
              <td style="background-color:${NAVY}; padding:28px 24px; text-align:center;">
                <span style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:-0.02em;">
                  Tax<span style="color:${GREEN};">Laya</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px; background-color:#f8fafc; text-align:center;">
                <p style="margin:0; font-size:12px; color:#64748b;">
                  Axla · TaxLaya — the AI tax assistant for Filipino freelancers.
                </p>
                <p style="margin:6px 0 0; font-size:12px; color:#94a3b8;">
                  <a href="https://axla.space/privacy" style="color:#94a3b8; text-decoration:underline;">Privacy</a>
                  &nbsp;·&nbsp;
                  <a href="https://axla.space/terms" style="color:#94a3b8; text-decoration:underline;">Terms</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** OTP verification email. `otp` should be a 6-digit string; `name` is the recipient's first name. */
export function otpEmailTemplate(otp: string, name: string): string {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const digits = otp
    .split("")
    .map(
      (digit) =>
        `<td style="width:40px; height:48px; text-align:center; vertical-align:middle; background-color:${NAVY}; border-radius:8px; color:#ffffff; font-size:24px; font-weight:700; font-family:'Courier New',monospace;">${digit}</td>`,
    )
    .join(`<td style="width:8px;"></td>`);

  const body = `
    <p style="margin:0 0 4px; font-size:16px; color:#001A29; font-weight:600;">${greeting}</p>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#334155;">
      Here's your one-time code to sign in to TaxLaya. Enter it within the next
      <strong>10 minutes</strong> to continue.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>${digits}</tr>
    </table>
    <p style="margin:0 0 8px; font-size:14px; line-height:1.6; color:#64748b; text-align:center;">
      Didn't ask for this code? You can safely ignore this email.
    </p>
    <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;" />
    <p style="margin:0; font-size:12px; line-height:1.6; color:#94a3b8;">
      For your security, never share this code with anyone — not even someone claiming to be from Axla.
    </p>
  `;

  return emailShell(`Your TaxLaya code is ${otp}`, body);
}

/**
 * Waitlist-approval email: sent once by the admin approve flow. Bigger OTP
 * digits than the regular sign-in email (28px on a dark navy tile) since
 * this is the recipient's very first code and needs to read as a "big
 * moment," plus a login CTA and a 3-step quick start.
 */
export function approvalEmailTemplate(otp: string, name: string): string {
  const greeting = name ? `You're in, ${name}! 🎉` : "You're in! 🎉";
  const digits = otp
    .split("")
    .map(
      (digit) =>
        `<td style="width:44px; height:56px; text-align:center; vertical-align:middle; background-color:#0f1a2a; border-radius:8px; color:#00ff88; font-size:28px; font-weight:700; font-family:'Courier New',monospace;">${digit}</td>`,
    )
    .join(`<td style="width:8px;"></td>`);

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#001A29; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#334155;">
      Your Axla TaxLaya account is ready. Use the code below to log in — and
      heads up, Q2 1701Q is due <strong>August 15</strong>, so let's get your
      numbers in early.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>${digits}</tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td style="border-radius:9999px; background-color:#00ff88;">
          <a href="https://www.axla.space/login" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:#001A29; text-decoration:none;">
            Login →
          </a>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:8px;">
      <tr>
        <td style="padding:16px 18px; background-color:#f8fafc; border-radius:12px; border-left:3px solid ${GREEN};">
          <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#001A29;">Quick start:</p>
          <ol style="margin:0; padding-left:18px; font-size:13px; line-height:1.8; color:#334155;">
            <li>Log in with the code above</li>
            <li>Add your TIN &amp; RDO code in Settings</li>
            <li>Run your Q2 1701Q calculation before Aug 15</li>
          </ol>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0; font-size:12px; line-height:1.6; color:#94a3b8;">
      This code expires in 10 minutes. Didn't request this? You can safely ignore this email.
    </p>
  `;

  return emailShell(`You're approved — your Axla TaxLaya code is ${otp}`, body);
}

/** Post-verification welcome email. `name` is the recipient's first name. */
export function welcomeEmailTemplate(name: string): string {
  const greeting = name ? `Welcome, ${name}! 👋` : "Welcome! 👋";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#001A29; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#334155;">
      You're verified and signed in to TaxLaya — your AI kakampi for BIR forms, deadlines,
      and everything tax-related na nakakastress.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px; background-color:#f8fafc; border-radius:12px; border-left:3px solid ${GREEN};">
          <p style="margin:0; font-size:14px; line-height:1.6; color:#001A29;">
            💬 Ask about 2551Q, 1701Q, 0619E deadlines and penalties, anytime — free, 24/7.
          </p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${GREEN};">
          <a href="https://axla.space" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${NAVY}; text-decoration:none;">
            Open TaxLaya →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell("You're verified — welcome to TaxLaya", body);
}

/** Business-plan team invite notification. Purely informational — accepting doesn't grant login access yet (no multi-user access model exists), so it says so plainly rather than implying a working invite flow. */
export function teamInviteEmailTemplate(ownerName: string, role: string): string {
  const body = `
    <p style="margin:0 0 4px; font-size:18px; color:#001A29; font-weight:700;">You've been invited to Axla TaxLaya</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#334155;">
      ${ownerName} added you as a <strong>${role}</strong> on their Axla TaxLaya account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px; background-color:#f8fafc; border-radius:12px; border-left:3px solid ${GREEN};">
          <p style="margin:0; font-size:13px; line-height:1.6; color:#001A29;">
            This is a heads-up, not an account yet — shared team access isn't live yet, so there's
            nothing to log into just yet. ${ownerName} will follow up once it is.
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`${ownerName} invited you to Axla TaxLaya`, body);
}
