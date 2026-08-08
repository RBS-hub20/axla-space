import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { convertToPdfA } from "@/lib/pdf/toolkit-pdf-helpers";
import { logError } from "@/lib/log-error";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — generous for a scanned document, small enough to stay fast

/**
 * E-Notary tab — "upload to convert to PDF/A". Only adds PDF/A
 * identification metadata; never re-embeds fonts into someone else's PDF
 * (see convertToPdfA's doc comment). If the source file's fonts aren't
 * already fully embedded, this returns a 422 telling the user why rather
 * than silently handing back a file that isn't actually PDF/A.
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File must be under 15MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || detected.mime !== "application/pdf") {
    return NextResponse.json({ error: "File must be a real PDF." }, { status: 400 });
  }

  const title = (file.name || "Document").replace(/\.pdf$/i, "").slice(0, 200);

  try {
    const result = await convertToPdfA(bytes, title);

    if (!result.fontsAlreadyEmbedded) {
      return NextResponse.json(
        {
          error:
            "This PDF uses fonts that aren't embedded, so we can't safely mark it PDF/A — re-embedding fonts risks reflowing your layout. " +
            "Try \"Print to PDF\" / \"Save as PDF\" from the original document (most apps embed fonts by default), then upload again. " +
            "Axla's own generated documents (other tabs) are already PDF/A-ready.",
          code: "FONTS_NOT_EMBEDDED",
        },
        { status: 422 },
      );
    }

    const outName = `${title || "document"}-pdfa.pdf`;
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outName.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    logError("toolkit/e-notary/convert: failed", err);
    return NextResponse.json({ error: "Couldn't read that file — it may be corrupted, password-protected, or not a valid PDF." }, { status: 400 });
  }
}
