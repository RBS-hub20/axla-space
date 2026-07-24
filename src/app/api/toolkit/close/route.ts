import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateClose1905Reference,
  generateCloseLetter,
  generateCloseChecklist,
  generateCloseGuide,
  type CloseKitData,
} from "@/lib/pdf/generate-toolkit-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
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

  const data: CloseKitData = {
    fullName: body.fullName.trim(),
    tin: typeof body.tin === "string" && body.tin.trim() ? body.tin.trim() : null,
    rdoCode: typeof body.rdoCode === "string" && body.rdoCode.trim() ? body.rdoCode.trim() : null,
    businessName: typeof body.businessName === "string" ? body.businessName.trim() : "",
    address: body.address.trim(),
    businessType: body.businessType === "sole-prop" ? "sole-prop" : "freelance",
    closureReason: typeof body.closureReason === "string" ? body.closureReason.trim() : "",
    lastFilingDate: typeof body.lastFilingDate === "string" && body.lastFilingDate ? body.lastFilingDate : null,
  };

  try {
    const [f1905, letter, checklist, guide] = await Promise.all([
      generateClose1905Reference(data),
      generateCloseLetter(data),
      generateCloseChecklist(data),
      generateCloseGuide(data),
    ]);

    const zip = await bundleAsZip([
      { name: "1905-closure-reference.pdf", bytes: f1905 },
      { name: "letter-of-intent-to-close.pdf", bytes: letter },
      { name: "close-checklist.pdf", bytes: checklist },
      { name: "rdo-guide.pdf", bytes: guide },
    ]);

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
