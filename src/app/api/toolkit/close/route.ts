import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateClose1905Reference,
  generateCloseLetter,
  generateCloseChecklist,
  generateCloseGuide,
  generateAuthorizationLetter,
  type CloseKitData,
  type AuthorizedRepData,
} from "@/lib/pdf/generate-toolkit-pdf";
import { bundleAsZip, type ZipFile } from "@/lib/pdf/zip-bundle";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

interface CloseKitBody {
  fullName?: unknown;
  tin?: unknown;
  rdoCode?: unknown;
  businessName?: unknown;
  address?: unknown;
  businessType?: unknown;
  closureReason?: unknown;
  lastFilingDate?: unknown;
  authorizeRepresentative?: unknown;
  repFullName?: unknown;
  repRelationship?: unknown;
  repValidId?: unknown;
  repContactNo?: unknown;
}

/**
 * Business Toolkit — Close Kit. Stateless: form in, ZIP out, nothing
 * persisted. The "may open case ka pa" pre-check is done client-side via
 * the existing /api/bir-guard/cases (this route doesn't block generation
 * on it — it's a warning to act on, not a hard gate, since the user may
 * legitimately be closing regardless).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    return NextResponse.json({ error: "Business Toolkit is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: CloseKitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.fullName !== "string" || !body.fullName.trim()) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (typeof body.address !== "string" || !body.address.trim()) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  let authorizedRep: AuthorizedRepData | null = null;
  if (body.authorizeRepresentative === true) {
    if (typeof body.repFullName !== "string" || !body.repFullName.trim()) {
      return NextResponse.json({ error: "Authorized representative's full name is required." }, { status: 400 });
    }
    if (typeof body.repValidId !== "string" || !body.repValidId.trim()) {
      return NextResponse.json({ error: "Authorized representative's valid ID is required." }, { status: 400 });
    }
    authorizedRep = {
      fullName: body.repFullName.trim(),
      relationship: typeof body.repRelationship === "string" && body.repRelationship.trim() ? body.repRelationship.trim() : "Other",
      validId: body.repValidId.trim(),
      contactNo: typeof body.repContactNo === "string" ? body.repContactNo.trim() : "",
    };
  }

  const data: CloseKitData = {
    fullName: body.fullName.trim(),
    tin: typeof body.tin === "string" && body.tin.trim() ? body.tin.trim() : null,
    rdoCode: typeof body.rdoCode === "string" && body.rdoCode.trim() ? body.rdoCode.trim() : null,
    businessName: typeof body.businessName === "string" ? body.businessName.trim() : "",
    address: body.address.trim(),
    businessType: body.businessType === "sole-prop" ? "sole-prop" : "freelance",
    closureReason: typeof body.closureReason === "string" ? body.closureReason.trim() : "",
    lastFilingDate: typeof body.lastFilingDate === "string" && body.lastFilingDate ? body.lastFilingDate : null,
    authorizedRep,
  };

  try {
    const docPromises: Array<Promise<ZipFile>> = [
      generateClose1905Reference(data).then((bytes) => ({ name: "1905-closure-reference.pdf", bytes })),
      generateCloseLetter(data).then((bytes) => ({ name: "letter-of-intent-to-close.pdf", bytes })),
      generateCloseChecklist(data).then((bytes) => ({ name: "close-checklist.pdf", bytes })),
      generateCloseGuide(data).then((bytes) => ({ name: "rdo-guide.pdf", bytes })),
    ];
    if (data.authorizedRep) {
      docPromises.push(
        generateAuthorizationLetter(data).then((bytes) => ({ name: "authorization-letter-closure.pdf", bytes })),
      );
    }

    const zip = await bundleAsZip(await Promise.all(docPromises));

    await saveBusinessRegistration(user.id, "CLOSE", { ...data });

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-close-business-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/close: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the Close Kit. Please try again." }, { status: 500 });
  }
}
