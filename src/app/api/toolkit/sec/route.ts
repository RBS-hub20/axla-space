import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import {
  generateSecArticlesTemplate,
  generateSecBylawsTemplate,
  generateSecCoverSheet,
  generateSecEsparcChecklist,
  type SecData,
  type Director,
} from "@/lib/pdf/generate-registration-pdf";
import { bundleAsZip } from "@/lib/pdf/zip-bundle";
import { saveBusinessRegistration } from "@/lib/dashboard/business-registrations";
import { logError } from "@/lib/log-error";

interface SecBody {
  companyNameOptions?: unknown;
  companyType?: unknown;
  numberOfDirectors?: unknown;
  authorizedCapital?: unknown;
  subscribedCapital?: unknown;
  paidUpCapital?: unknown;
  directors?: unknown;
}

function parseDirectors(value: unknown): Director[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      name: typeof d.name === "string" ? d.name.trim() : "",
      tin: typeof d.tin === "string" ? d.tin.trim() : "",
      address: typeof d.address === "string" ? d.address.trim() : "",
      shares: Number(d.shares) > 0 ? Number(d.shares) : 0,
    }))
    .filter((d) => d.name);
}

/** Business Toolkit — SEC Kit. BUSINESS plan only. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  if (plan !== "business") {
    return NextResponse.json({ error: "SEC Kit is a BUSINESS feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: SecBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawOptions = Array.isArray(body.companyNameOptions) ? body.companyNameOptions : [];
  const companyNameOptions: [string, string, string] = [
    typeof rawOptions[0] === "string" ? rawOptions[0].trim() : "",
    typeof rawOptions[1] === "string" ? rawOptions[1].trim() : "",
    typeof rawOptions[2] === "string" ? rawOptions[2].trim() : "",
  ];
  if (!companyNameOptions.some((n) => n)) {
    return NextResponse.json({ error: "At least one company name option is required." }, { status: 400 });
  }

  const directors = parseDirectors(body.directors);

  const data: SecData = {
    companyNameOptions,
    companyType: typeof body.companyType === "string" && body.companyType.trim() ? body.companyType.trim() : "Corporation",
    numberOfDirectors: Number(body.numberOfDirectors) > 0 ? Number(body.numberOfDirectors) : directors.length,
    authorizedCapital: Number(body.authorizedCapital) > 0 ? Number(body.authorizedCapital) : 0,
    subscribedCapital: Number(body.subscribedCapital) > 0 ? Number(body.subscribedCapital) : 0,
    paidUpCapital: Number(body.paidUpCapital) > 0 ? Number(body.paidUpCapital) : 0,
    directors,
  };

  try {
    const qrCode = `AXLA-SEC-${Date.now()}`;
    const [articles, bylaws, coverSheet, esparcChecklist] = await Promise.all([
      generateSecArticlesTemplate(data, qrCode),
      generateSecBylawsTemplate(data),
      generateSecCoverSheet(data),
      generateSecEsparcChecklist(),
    ]);

    const zip = await bundleAsZip([
      { name: "articles-of-incorporation-template.pdf", bytes: articles },
      { name: "by-laws-template.pdf", bytes: bylaws },
      { name: "cover-sheet-reference.pdf", bytes: coverSheet },
      { name: "esparc-checklist.pdf", bytes: esparcChecklist },
    ]);

    await saveBusinessRegistration(user.id, "SEC", { ...data, qrCode });

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="axla-sec-kit.zip"',
      },
    });
  } catch (err) {
    logError("toolkit/sec: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the SEC Kit. Please try again." }, { status: 500 });
  }
}
