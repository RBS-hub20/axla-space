import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateMayorsReference,
  generateBarangayLetter,
  generateMayorsChecklist,
  type MayorsData,
  type City,
} from "@/lib/pdf/generate-registration-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

const VALID_CITIES: City[] = ["QC", "Manila", "Makati", "Cebu", "Davao", "Other"];

interface MayorsBody {
  city?: unknown;
  businessName?: unknown;
  address?: unknown;
  natureOfBusiness?: unknown;
}

/** Business Toolkit — Mayor's Permit Kit. BUSINESS plan only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan !== "business") {
    return NextResponse.json({ error: "Mayor's Kit is a BUSINESS feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: MayorsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.businessName !== "string" || !body.businessName.trim()) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }
  if (typeof body.address !== "string" || !body.address.trim()) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  const data: MayorsData = {
    city: typeof body.city === "string" && VALID_CITIES.includes(body.city as City) ? (body.city as City) : "Other",
    businessName: body.businessName.trim(),
    address: body.address.trim(),
    natureOfBusiness: typeof body.natureOfBusiness === "string" ? body.natureOfBusiness.trim() : "",
  };

  try {
    const [reference, letter, checklist] = await Promise.all([
      generateMayorsReference(data),
      generateBarangayLetter(data),
      generateMayorsChecklist(data),
    ]);

    const zip = await bundleAsZip([
      { name: "mayors-permit-reference.pdf", bytes: reference },
      { name: "barangay-clearance-request-letter.pdf", bytes: letter },
      { name: "mayors-checklist.pdf", bytes: checklist },
    ]);

    await saveBusinessRegistration(user.id, "MAYORS", { ...data });

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-mayors-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/mayors: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the Mayor's Kit. Please try again." }, { status: 500 });
  }
}
