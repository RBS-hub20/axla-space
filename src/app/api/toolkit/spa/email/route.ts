import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { spaDocumentEmailTemplate } from "@/lib/email-templates";
import {
  generateSpaDocument,
  generateSpaCoverLetter,
  generateSpaNotaryGuide,
  type SpaData,
} from "@/lib/pdf/generate-toolkit-pdf";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

interface SpaEmailBody {
  representativeEmail?: unknown;
  principalName?: unknown;
  principalTin?: unknown;
  principalAddress?: unknown;
  representativeName?: unknown;
  representativeAddress?: unknown;
  relationship?: unknown;
  rdoCode?: unknown;
  scope?: {
    closeBusiness?: unknown;
    surrenderBooks?: unknown;
    getCor?: unknown;
    fileReturns?: unknown;
  };
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSpaData(body: SpaEmailBody): SpaData | null {
  if (typeof body.principalName !== "string" || !body.principalName.trim()) return null;
  if (typeof body.principalAddress !== "string" || !body.principalAddress.trim()) return null;
  if (typeof body.representativeName !== "string" || !body.representativeName.trim()) return null;
  if (typeof body.representativeAddress !== "string" || !body.representativeAddress.trim()) return null;

  return {
    principalName: body.principalName.trim(),
    principalTin: typeof body.principalTin === "string" && body.principalTin.trim() ? body.principalTin.trim() : null,
    principalAddress: body.principalAddress.trim(),
    representativeName: body.representativeName.trim(),
    representativeAddress: body.representativeAddress.trim(),
    relationship: typeof body.relationship === "string" ? body.relationship.trim() : "Representative",
    rdoCode: typeof body.rdoCode === "string" && body.rdoCode.trim() ? body.rdoCode.trim() : null,
    scope: {
      closeBusiness: Boolean(body.scope?.closeBusiness),
      surrenderBooks: Boolean(body.scope?.surrenderBooks),
      getCor: Boolean(body.scope?.getCor),
      fileReturns: Boolean(body.scope?.fileReturns),
    },
  };
}

/** Emails the SPA kit (SPA + cover letter + notary guide) to the representative's own inbox — user-triggered, not automated/bulk. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    return NextResponse.json({ error: "Business Toolkit is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  if (!isResendConfigured) {
    return NextResponse.json({ error: "Email isn't set up yet." }, { status: 503 });
  }

  let body: SpaEmailBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidEmail(body.representativeEmail)) {
    return NextResponse.json({ error: "A valid representative email is required." }, { status: 400 });
  }

  const data = parseSpaData(body);
  if (!data) {
    return NextResponse.json({ error: "Principal and representative name/address are required." }, { status: 400 });
  }

  try {
    const [spa, cover, guide] = await Promise.all([
      generateSpaDocument(data),
      generateSpaCoverLetter(data),
      generateSpaNotaryGuide(),
    ]);

    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: body.representativeEmail,
      subject: `SPA from ${data.principalName} — attached`,
      html: spaDocumentEmailTemplate(data.principalName, data.representativeName),
      attachments: [
        { filename: "spa-template.pdf", content: Buffer.from(spa).toString("base64") },
        { filename: "rdo-cover-letter.pdf", content: Buffer.from(cover).toString("base64") },
        { filename: "notary-guide.pdf", content: Buffer.from(guide).toString("base64") },
      ],
    });

    if (error) {
      logError("toolkit/spa/email: send failed", error);
      return NextResponse.json({ error: error.message || "Couldn't send the email." }, { status: 502 });
    }

    await saveBusinessRegistration(user.id, "SPA", { ...data, emailedTo: body.representativeEmail });

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("toolkit/spa/email: threw", err);
    return NextResponse.json({ error: "Couldn't send the email. Please try again." }, { status: 500 });
  }
}
