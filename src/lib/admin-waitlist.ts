import "server-only";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBusinesses, createBusiness } from "@/lib/dashboard/businesses";
import { generateOtp, storeOtp } from "@/lib/otp-store";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { approvalEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  status: string | null;
}

export interface ApproveResult {
  success: boolean;
  businessCreated?: boolean;
  error?: string;
}

/**
 * Approves one waitlist email end to end: finds/creates the Prisma user,
 * upserts their profile, auto-creates a first business if they have none,
 * mints a login OTP, emails it, and flips the waitlist row to 'approved'.
 * Shared by the single-approve and bulk-approve routes so both stay in sync.
 */
export async function approveWaitlistEmail(rawEmail: string, customBusinessName?: string): Promise<ApproveResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { success: false, error: "Email is required." };

  const { data: waitlistRow, error: waitlistError } = await supabaseAdmin
    .from("waitlist")
    .select("id, email, name, business_name, status")
    .eq("email", email)
    .maybeSingle<WaitlistRow>();

  if (waitlistError) {
    logError("approveWaitlistEmail: waitlist lookup failed", waitlistError);
    return { success: false, error: "Failed to load waitlist entry." };
  }
  if (!waitlistRow) {
    return { success: false, error: "No waitlist entry for this email." };
  }

  const displayName = waitlistRow.name?.trim() || email.split("@")[0];

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    try {
      user = await prisma.user.create({ data: { email, name: displayName } });
    } catch (err) {
      logError("approveWaitlistEmail: prisma user create failed", err);
      return { success: false, error: "Failed to create user." };
    }
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: user.id,
      email,
      full_name: displayName,
      business_name: waitlistRow.business_name || displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    logError("approveWaitlistEmail: profile upsert failed", profileError);
    return { success: false, error: "Failed to create profile." };
  }

  const existingBusinesses = await getBusinesses(user.id);
  let businessCreated = false;
  if (existingBusinesses.length === 0) {
    const businessName =
      customBusinessName?.trim() || waitlistRow.business_name?.trim() || displayName || "My Business";
    const { error: businessError } = await createBusiness(user.id, {
      name: businessName,
      branch_code: "000",
    });
    if (businessError) {
      logError("approveWaitlistEmail: business creation failed", businessError);
    } else {
      businessCreated = true;
    }
  }

  const code = generateOtp();
  try {
    await storeOtp(email, code);
  } catch (err) {
    logError("approveWaitlistEmail: storeOtp failed", err);
    return { success: false, error: "Failed to generate a login code." };
  }

  if (isResendConfigured) {
    try {
      const { error: sendError } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: "You're in! \u{1F389} Your Axla TaxLaya is ready + Q2 1701Q Aug 15",
        html: approvalEmailTemplate(code, displayName),
      });
      if (sendError) logError("approveWaitlistEmail: resend send failed", sendError);
    } catch (err) {
      logError("approveWaitlistEmail: resend send threw", err);
    }
  } else {
    console.error("approveWaitlistEmail: RESEND_API_KEY missing, code was stored but no email was sent");
  }

  const { error: statusError } = await supabaseAdmin.from("waitlist").update({ status: "approved" }).eq("email", email);
  if (statusError) {
    logError("approveWaitlistEmail: status update failed", statusError);
  }

  return { success: true, businessCreated };
}

export async function rejectWaitlistEmail(rawEmail: string): Promise<{ success: boolean; error?: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { success: false, error: "Email is required." };

  const { error } = await supabaseAdmin.from("waitlist").update({ status: "rejected" }).eq("email", email);
  if (error) {
    logError("rejectWaitlistEmail: update failed", error);
    return { success: false, error: "Failed to reject." };
  }
  return { success: true };
}
