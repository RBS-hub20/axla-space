import { NextResponse } from "next/server";
import { generateEBIR2551QXML, generateEBIR2551QDAT, normalizeTin } from "@/lib/bir/ebirforms-2551q";

interface ExportBody {
  tin?: unknown;
  rdoCode?: unknown;
  name?: unknown;
  address?: unknown;
  gross?: unknown;
  quarter?: unknown;
  year?: unknown;
  atc?: unknown;
  format?: unknown;
}

export async function POST(req: Request) {
  let body: ExportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.tin !== "string" || !body.tin.trim()) {
    return NextResponse.json({ error: "TIN is required." }, { status: 400 });
  }
  const { digits: tin, isValid: tinValid } = normalizeTin(body.tin);
  if (!tinValid) {
    return NextResponse.json(
      { error: "TIN must be 9 digits (plus an optional 3-digit branch code) — 12 digits total." },
      { status: 400 },
    );
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Taxpayer name is required." }, { status: 400 });
  }

  const gross = Number(body.gross);
  if (!Number.isFinite(gross) || gross < 0) {
    return NextResponse.json({ error: "gross must be a non-negative number." }, { status: 400 });
  }

  const quarterNum = Number(body.quarter);
  const quarter = ([1, 2, 3, 4] as const).includes(quarterNum as 1 | 2 | 3 | 4)
    ? (quarterNum as 1 | 2 | 3 | 4)
    : ((Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();
  const taxDue = Math.round(gross * 0.03 * 100) / 100;

  const data = {
    tin,
    rdoCode: typeof body.rdoCode === "string" ? body.rdoCode : "",
    name: body.name,
    address: typeof body.address === "string" ? body.address : "",
    quarter,
    year,
    gross,
    taxDue,
    atc: typeof body.atc === "string" && body.atc.trim() ? body.atc : undefined,
  };

  const format = body.format === "xml" || body.format === "dat" ? body.format : "both";
  const fileName = `2551Q_Q${quarter}_${year}_${tin}`;

  const result: { fileName: string; xmlContent?: string; datContent?: string } = { fileName };
  if (format === "xml" || format === "both") result.xmlContent = generateEBIR2551QXML(data);
  if (format === "dat" || format === "both") result.datContent = generateEBIR2551QDAT(data);

  return NextResponse.json(result);
}
