import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateSpaDocument,
  generateSpaCoverLetter,
  generateSpaNotaryGuide,
  type SpaData,
} from "@/lib/pdf/generate-toolkit-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

interface SpaBody {
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

function parseSpaData(body: SpaBody): SpaData | null {
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

/** Business Toolkit — SPA Kit. Stateless: form in, ZIP out, nothing persisted. PRO/Business only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    return NextResponse.json({ error: "Business Toolkit is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: SpaBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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

    const zip = await bundleAsZip([
      { name: "spa-template.pdf", bytes: spa },
      { name: "rdo-cover-letter.pdf", bytes: cover },
      { name: "notary-guide.pdf", bytes: guide },
    ]);

    await saveBusinessRegistration(user.id, "SPA", { ...data });

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-spa-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/spa: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the SPA Kit. Please try again." }, { status: 500 });
  }
}
