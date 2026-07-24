import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { generateDtiReference, generateDtiChecklist, generateDtiPaymentGuide, type DtiData } from "@/lib/pdf/generate-registration-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

interface DtiBody {
  fullName?: unknown;
  tin?: unknown;
  address?: unknown;
  businessNameOptions?: unknown;
  businessScope?: unknown;
  capital?: unknown;
}

/** Business Toolkit — DTI Kit. PRO/Business gated, same tier as Open Business. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    return NextResponse.json({ error: "DTI Kit is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: DtiBody;
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

  const rawOptions = Array.isArray(body.businessNameOptions) ? body.businessNameOptions : [];
  const businessNameOptions: [string, string, string] = [
    typeof rawOptions[0] === "string" ? rawOptions[0].trim() : "",
    typeof rawOptions[1] === "string" ? rawOptions[1].trim() : "",
    typeof rawOptions[2] === "string" ? rawOptions[2].trim() : "",
  ];
  if (!businessNameOptions.some((n) => n)) {
    return NextResponse.json({ error: "At least one business name option is required." }, { status: 400 });
  }

  const data: DtiData = {
    fullName: body.fullName.trim(),
    tin: typeof body.tin === "string" && body.tin.trim() ? body.tin.trim() : null,
    address: body.address.trim(),
    businessNameOptions,
    businessScope: typeof body.businessScope === "string" && body.businessScope.trim() ? body.businessScope.trim() : "Other",
    capital: Number(body.capital) > 0 ? Number(body.capital) : 0,
  };

  try {
    const qrCode = `AXLA-DTI-${Date.now()}`;
    const [reference, checklist, paymentGuide] = await Promise.all([
      generateDtiReference(data, qrCode),
      generateDtiChecklist(data),
      generateDtiPaymentGuide(data),
    ]);

    const zip = await bundleAsZip([
      { name: "dti-bnrs-reference.pdf", bytes: reference },
      { name: "dti-checklist.pdf", bytes: checklist },
      { name: "dti-payment-guide.pdf", bytes: paymentGuide },
    ]);

    // Awaited (not fire-and-forget) — a serverless function can be frozen
    // right after the response is sent, so an un-awaited insert here isn't
    // guaranteed to actually run. It's one small insert, not worth the risk.
    await saveBusinessRegistration(user.id, "DTI", { ...data, qrCode });

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-dti-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/dti: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the DTI Kit. Please try again." }, { status: 500 });
  }
}
