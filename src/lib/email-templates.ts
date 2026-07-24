// Dark-mode email design tokens — matching the official Axla logo/site
// theme, not the site's own on-page Tailwind classes (email clients need
// plain inline hex, no CSS variables/Tailwind). ACCENT is the green
// literally sampled from the logo's arrow, used for every green element in
// these emails (buttons, highlight-box borders, OTP digits) so nothing
// drifts to a slightly-off shade.
const HEADER_BG = "#23292F";
const BODY_BG = "#2A3138";
const BODY_TEXT = "#E2E8F0";
const MUTED_TEXT = "#94A3B8";
const HIGHLIGHT_BG = "#333B44";
const ACCENT = "#00C853";
const BUTTON_TEXT = "#0F1417";
const LOGO_URL = "https://www.axla.space/axla-logo-dark.png"; // same file already live in the site's own dark Navbar/Footer — not a new asset

/** Shared HTML shell: dark header with the official Axla logo (no text, no white background), dark body card, mobile-responsive via a fluid max-width table layout. */
function emailShell(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Axla</title>
  </head>
  <body style="margin:0; padding:0; background-color:#181D21; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#181D21; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${BODY_BG}; border-radius:16px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.35);">
            <tr>
              <td style="background-color:${HEADER_BG}; padding:32px 24px; text-align:center;">
                <img src="${LOGO_URL}" width="140" alt="Axla" style="display:block; width:140px; max-width:140px; height:auto; margin:0 auto; border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px; color:${BODY_TEXT};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px; background-color:${HEADER_BG}; text-align:center;">
                <p style="margin:0; font-size:12px; color:${MUTED_TEXT};">
                  Axla · TaxLaya — the AI tax assistant for Filipino freelancers.
                </p>
                <p style="margin:6px 0 0; font-size:12px; color:${MUTED_TEXT};">
                  <a href="https://axla.space/privacy" style="color:${MUTED_TEXT}; text-decoration:underline;">Privacy</a>
                  &nbsp;·&nbsp;
                  <a href="https://axla.space/terms" style="color:${MUTED_TEXT}; text-decoration:underline;">Terms</a>
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
        `<td style="width:40px; height:48px; text-align:center; vertical-align:middle; background-color:${HIGHLIGHT_BG}; border-radius:8px; color:${ACCENT}; font-size:24px; font-weight:700; font-family:'Courier New',monospace;">${digit}</td>`,
    )
    .join(`<td style="width:8px;"></td>`);

  const body = `
    <p style="margin:0 0 4px; font-size:16px; color:#ffffff; font-weight:600;">${greeting}</p>
    <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      Here's your one-time code to sign in to Axla. Enter it within the next
      <strong>10 minutes</strong> to continue.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>${digits}</tr>
    </table>
    <p style="margin:0 0 8px; font-size:14px; line-height:1.6; color:${MUTED_TEXT}; text-align:center;">
      Didn't ask for this code? You can safely ignore this email.
    </p>
    <hr style="border:none; border-top:1px solid #3a4148; margin:24px 0;" />
    <p style="margin:0; font-size:12px; line-height:1.6; color:${MUTED_TEXT};">
      For your security, never share this code with anyone — not even someone claiming to be from Axla.
    </p>
  `;

  return emailShell(`Your Axla code is ${otp}`, body);
}

/**
 * Waitlist-approval email: sent once by the admin approve flow. Bigger OTP
 * digits than the regular sign-in email since this is the recipient's very
 * first code and needs to read as a "big moment," plus a login CTA and a
 * 3-step quick start.
 */
export function approvalEmailTemplate(otp: string, name: string): string {
  const greeting = name ? `You're in, ${name}! 🎉` : "You're in! 🎉";
  const digits = otp
    .split("")
    .map(
      (digit) =>
        `<td style="width:44px; height:56px; text-align:center; vertical-align:middle; background-color:${HIGHLIGHT_BG}; border-radius:8px; color:${ACCENT}; font-size:28px; font-weight:700; font-family:'Courier New',monospace;">${digit}</td>`,
    )
    .join(`<td style="width:8px;"></td>`);

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      Your Axla account is ready. Use the code below to log in — and
      heads up, Q2 1701Q is due <strong>August 15</strong>, so let's get your
      numbers in early.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>${digits}</tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://www.axla.space/login" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            Login →
          </a>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:8px;">
      <tr>
        <td style="padding:16px 18px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#ffffff;">Quick start:</p>
          <ol style="margin:0; padding-left:18px; font-size:13px; line-height:1.8; color:${BODY_TEXT};">
            <li>Log in with the code above</li>
            <li>Add your TIN &amp; RDO code in Settings</li>
            <li>Run your Q2 1701Q calculation before Aug 15</li>
          </ol>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0; font-size:12px; line-height:1.6; color:${MUTED_TEXT};">
      This code expires in 10 minutes. Didn't request this? You can safely ignore this email.
    </p>
  `;

  return emailShell(`You're approved — your Axla code is ${otp}`, body);
}

/** Post-verification welcome email. `name` is the recipient's first name. */
export function welcomeEmailTemplate(name: string): string {
  const greeting = name ? `Welcome, ${name}! 👋` : "Welcome! 👋";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      You're verified and signed in to Axla — your AI kakampi for BIR forms, deadlines,
      and everything tax-related na nakakastress.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0; font-size:14px; line-height:1.6; color:${BODY_TEXT};">
            💬 Ask about 2551Q, 1701Q, 0619E deadlines and penalties, anytime — free, 24/7.
          </p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://axla.space" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            Open Axla →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell("You're verified — welcome to Axla", body);
}

/**
 * Sent immediately on joining the public waitlist (before approval) — a
 * genuinely new email, not a duplicate of approvalEmailTemplate below
 * (which fires later, once an admin approves and includes the actual
 * login OTP). No fabricated user-count claim here — deliberately, since
 * this app's real signup numbers don't support a "30K users" line and a
 * recipient could trivially tell it's made up.
 */
export function waitlistWelcomeEmailTemplate(name: string): string {
  const greeting = name ? `You're on the list, ${name}! 🎉` : "You're on the list! 🎉";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      Thanks for joining the Axla waitlist. We're onboarding freelancers and small business
      owners in batches — we'll email you the moment your account is approved, with your
      login code ready to go.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:8px;">
      <tr>
        <td style="padding:16px 18px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0; font-size:13px; line-height:1.6; color:${BODY_TEXT};">
            💡 In the meantime: TaxLaya, our free AI tax assistant, is live right now at
            <a href="https://axla.space" style="color:${ACCENT}; font-weight:600;">axla.space</a> —
            no approval needed to ask it a BIR question.
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailShell("You're on the Axla waitlist", body);
}

/** Sent when a subscription is newly activated (PayMongo webhook) — plan-aware (Pro vs Business get different unlocks listed). */
export function proUpgradeEmailTemplate(name: string, plan: "pro" | "business"): string {
  const greeting = name ? `You're PRO now, ${name}! 🚀` : "You're PRO now! 🚀";
  const planLabel = plan === "business" ? "Business" : "PRO";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      Your Axla ${planLabel} plan is active. Unlimited filings, unlimited GCash uploads,
      unlimited TaxLaya AI chat, and clean BIR-ready PDFs are unlocked.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:24px;">
      <tr>
        <td style="padding:16px 18px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:#ffffff;">Also unlocked: BIR Guard 🛡️ (Beta)</p>
          <p style="margin:0; font-size:13px; line-height:1.6; color:${BODY_TEXT};">
            Track open BIR cases and penalties in one place — head to your dashboard to set it up.
          </p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://www.axla.space/dashboard" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            Open Dashboard →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`Your Axla ${planLabel} plan is active`, body);
}

/** Sent when a newly-logged BIR Guard case has a penalty or is otherwise flagged — the user added this themselves (manual entry), this just confirms/reminds. */
export function birGuardAlertEmailTemplate(name: string, openCaseCount: number, totalPenalty: number): string {
  const greeting = name ? `Heads up, ${name}` : "Heads up";
  const penaltyLine =
    totalPenalty > 0
      ? `with a combined penalty of <strong>₱${totalPenalty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> logged so far`
      : "logged";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting} — action required ⚠️</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      BIR Guard shows <strong>${openCaseCount} open case${openCaseCount === 1 ? "" : "s"}</strong> on your account, ${penaltyLine}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:24px;">
      <tr>
        <td style="padding:16px 18px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid #ef4444;">
          <p style="margin:0; font-size:13px; line-height:1.6; color:${BODY_TEXT};">
            This was logged from what you recorded after checking mytax.bir.gov.ph yourself — Axla
            doesn't monitor your BIR account automatically. Review it in your dashboard, and
            consider drafting a response letter if a penalty needs addressing.
          </p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://www.axla.space/dashboard/bir-guard" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            Open BIR Guard →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`${openCaseCount} open BIR case${openCaseCount === 1 ? "" : "s"} — action required`, body);
}

/** Sent when a user's BIR Guard cases go to zero open — a good-news counterpart to the alert email. Not auto-triggered yet (see route comment), but ready to call. */
export function noCasesEmailTemplate(name: string): string {
  const greeting = name ? `You're clear, ${name}! ✅` : "You're clear! ✅";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting}</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      BIR Guard shows no open cases or penalties on your account right now. Walang bitin — keep it that way.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://www.axla.space/dashboard/bir-guard" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            View BIR Guard →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell("You're clear — no open BIR cases", body);
}

/** Sent as a manual/promotional touchpoint for the LAUNCH50 promo — not auto-scheduled (see route comment: no cron/audience-list system exists to page through all free users daily), but ready to call for a one-off send. */
export function promoCountdownEmailTemplate(name: string, daysLeft: number): string {
  const greeting = name ? `${name}, don't miss this` : "Don't miss this";

  const body = `
    <p style="margin:0 0 4px; font-size:20px; color:#ffffff; font-weight:700;">${greeting} 🔥</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      Our launch promo ends in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> — PRO is
      50% off at <strong>₱249/mo</strong> (regularly ₱499/mo) while it lasts.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:9999px; background-color:${ACCENT};">
          <a href="https://www.axla.space/pricing" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:700; color:${BUTTON_TEXT}; text-decoration:none;">
            Claim 50% OFF →
          </a>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`${daysLeft} day${daysLeft === 1 ? "" : "s"} left — PRO 50% off`, body);
}

/** Business-plan team invite notification. Purely informational — accepting doesn't grant login access yet (no multi-user access model exists), so it says so plainly rather than implying a working invite flow. */
export function teamInviteEmailTemplate(ownerName: string, role: string): string {
  const body = `
    <p style="margin:0 0 4px; font-size:18px; color:#ffffff; font-weight:700;">You've been invited to Axla</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      ${ownerName} added you as a <strong>${role}</strong> on their Axla account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0; font-size:13px; line-height:1.6; color:${BODY_TEXT};">
            This is a heads-up, not an account yet — shared team access isn't live yet, so there's
            nothing to log into just yet. ${ownerName} will follow up once it is.
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`${ownerName} invited you to Axla`, body);
}

export function spaDocumentEmailTemplate(principalName: string, representativeName: string): string {
  const body = `
    <p style="margin:0 0 4px; font-size:18px; color:#ffffff; font-weight:700;">A Special Power of Attorney was sent to you</p>
    <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:${BODY_TEXT};">
      ${principalName} named you (${representativeName}) as their representative for BIR transactions and attached
      the SPA template, an RDO cover letter, and a notary guide.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px; background-color:${HIGHLIGHT_BG}; border-radius:12px; border-left:3px solid ${ACCENT};">
          <p style="margin:0; font-size:13px; line-height:1.6; color:${BODY_TEXT};">
            <strong>Template only</strong> — it needs to be signed and notarized before it's valid. See the
            attached notary guide for where to get that done.
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailShell(`SPA from ${principalName} — attached`, body);
}
