import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateOpen1901Reference,
  generateOpen0605Reference,
  generateOpenChecklist,
  generateOpenScript,
  type OpenKitData,
} from "@/lib/pdf/generate-toolkit-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
import { logError } from "@/lib/log-error";

interface OpenKitBody {
  fullName?: unknown;
  tin?: unknown;
  rdoCode?: unknown;
  businessName?: unknown;
  address?: unknown;
  businessType?: unknown;
}

/** Business Toolkit — Open Kit. Stateless: form in, ZIP out, nothing persisted. PRO/Business only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    return NextResponse.json({ error: "Business Toolkit is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: OpenKitBody;
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

  const data: OpenKitData = {
    fullName: body.fullName.trim(),
    tin: typeof body.tin === "string" && body.tin.trim() ? body.tin.trim() : null,
    rdoCode: typeof body.rdoCode === "string" && body.rdoCode.trim() ? body.rdoCode.trim() : null,
    businessName: typeof body.businessName === "string" ? body.businessName.trim() : "",
    address: body.address.trim(),
    businessType: body.businessType === "sole-prop" ? "sole-prop" : "freelance",
  };

  try {
    const [f1901, f0605, checklist, script] = await Promise.all([
      generateOpen1901Reference(data),
      generateOpen0605Reference(data),
      generateOpenChecklist(data),
      generateOpenScript(data),
    ]);

    const zip = await bundleAsZip([
      { name: "1901-registration-reference.pdf", bytes: f1901 },
      { name: "0605-registration-fee-reference.pdf", bytes: f0605 },
      { name: "open-checklist.pdf", bytes: checklist },
      { name: "rdo-script.pdf", bytes: script },
    ]);

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-open-business-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/open: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the Open Kit. Please try again." }, { status: 500 });
  }
}
