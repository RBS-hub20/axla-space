import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { generateEBIR2551QXML, generateEBIR2551QDAT, normalizeTin } from "@/lib/bir/ebirforms-2551q";
import { buildRdoPacketZip, type RdoPacketFormFile, type RdoPacketReceiptFile } from "@/lib/rdo/packet";
import { logError } from "@/lib/log-error";

const QUARTER_MONTH_RANGE: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [0, 2],
  2: [3, 5],
  3: [6, 8],
  4: [9, 11],
};

function quarterDateRange(quarter: 1 | 2 | 3 | 4, year: number): { start: string; end: string } {
  const [startMonth, endMonth] = QUARTER_MONTH_RANGE[quarter];
  const start = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, endMonth + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * Bundles a BIR form preview PDF, 2551Q XML/DAT reference export, any
 * receipts on file for the quarter, and a transmittal cover letter into a
 * downloadable ZIP. GET with quarter/year query params, same auth as
 * every other /api/dashboard/* route.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canExport) {
    return NextResponse.json({ error: "You don't have permission to export data." }, { status: 403 });
  }

  const url = new URL(req.url);
  const quarterNum = Number(url.searchParams.get("quarter"));
  const quarter = ([1, 2, 3, 4] as const).includes(quarterNum as 1 | 2 | 3 | 4)
    ? (quarterNum as 1 | 2 | 3 | 4)
    : ((Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const year = Number.isFinite(Number(url.searchParams.get("year"))) ? Number(url.searchParams.get("year")) : new Date().getFullYear();

  const profile = await getOrCreateProfile(
    owner.ownerId,
    owner.ownerEmail,
    owner.isOwner ? user.name ?? owner.ownerEmail.split("@")[0] : owner.ownerEmail.split("@")[0],
  );
  if (!profile) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }

  const { data: txRows, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("amount, type")
    .eq("user_id", owner.ownerId)
    .eq("quarter", quarter)
    .eq("year", year);
  if (txError) {
    logError("dashboard/rdo-packet GET: transactions query failed", txError);
    return NextResponse.json({ error: "Failed to load transactions for this quarter." }, { status: 500 });
  }

  const gross = (txRows ?? []).filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
  const taxDue = Math.round(gross * 0.03 * 100) / 100;

  const { digits: tin, isValid: tinValid } = normalizeTin(profile.tin_number || "");
  const exportData = {
    tin: tinValid ? tin : "",
    rdoCode: profile.rdo_code || "",
    name: profile.full_name || "Not set",
    address: profile.address || "",
    quarter,
    year,
    gross,
    taxDue,
  };

  const forms: RdoPacketFormFile[] = [
    {
      fileName: `2551Q_Q${quarter}_${year}`,
      xmlContent: generateEBIR2551QXML(exportData),
      datContent: generateEBIR2551QDAT(exportData),
    },
  ];

  // Preview PDF — same generator the "Quick 2551Q Preview" card uses client-side; safe to reuse server-side since it's a pure jsPDF call with no DOM dependency.
  let previewPdf: Uint8Array | undefined;
  try {
    const { generate2551QPDF } = await import("@/lib/pdf/generate-2551q");
    const blob = generate2551QPDF({
      name: profile.full_name || "Not set",
      tin: profile.tin_number || "",
      quarter,
      gross,
      taxDue,
      date: new Date().toISOString(),
    });
    previewPdf = new Uint8Array(await blob.arrayBuffer());
  } catch (err) {
    logError("dashboard/rdo-packet GET: PDF generation failed (non-fatal, packet continues without it)", err);
  }

  const { start, end } = quarterDateRange(quarter, year);
  const { data: receiptRows, error: receiptsError } = await supabaseAdmin
    .from("receipts")
    .select("file_path, file_name, vendor, receipt_date")
    .eq("user_id", owner.ownerId)
    .gte("receipt_date", start)
    .lte("receipt_date", end);
  if (receiptsError) {
    logError("dashboard/rdo-packet GET: receipts query failed (non-fatal, packet continues without them)", receiptsError);
  }

  const receipts: RdoPacketReceiptFile[] = [];
  for (const r of receiptRows ?? []) {
    if (!r.file_path) continue;
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from("receipts").download(r.file_path);
    if (downloadError || !fileData) {
      logError("dashboard/rdo-packet GET: receipt download failed (skipping this file)", downloadError);
      continue;
    }
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const safeName = r.file_name || r.file_path.split("/").pop() || `receipt-${receipts.length + 1}.jpg`;
    receipts.push({ fileName: safeName, bytes });
  }

  const zipBytes = await buildRdoPacketZip({
    taxpayerName: profile.full_name || "Not set",
    tin: profile.tin_number || "",
    rdoCode: profile.rdo_code || "",
    quarter,
    year,
    gross,
    taxDue,
    forms,
    receipts,
    previewPdf,
  });

  return new NextResponse(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="axla-rdo-packet-Q${quarter}-${year}.zip"`,
    },
  });
}
