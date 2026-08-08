import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/payroll/file-validation";
import { getPayrollCompany } from "@/lib/payroll/company";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-logos";
const SIGNED_URL_TTL_SECONDS = 3600;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Company Hero's logo upload — camera icon on the logo circle. Same magic-byte validation constants as the rest of payroll (selfies, receipts) — inlined rather than calling validateImageUpload() directly since that helper doesn't expose the detected type, and we need it here to pick the storage extension without reading the file twice. One file per owner (upsert overwrites the previous logo at the same path, no orphaned files). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditPayroll) {
    return NextResponse.json({ error: "You don't have permission to edit payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  // Uploading before company setup would orphan the file: nothing to attach
  // logo_url to, so the signed URL below would only work for this one
  // response and vanish on the next page load.
  const existingCompany = await getPayrollCompany(owner.ownerId);
  if (!existingCompany) {
    return NextResponse.json({ error: "Complete company setup first, then upload your logo." }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Logo must be under 5MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected.mime)) {
    return NextResponse.json({ error: "Logo must be a real JPEG, PNG, or WebP image." }, { status: 400 });
  }

  const ext = EXT_BY_MIME[detected.mime] ?? "jpg";
  const path = `${owner.ownerId}/logo.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: detected.mime,
    upsert: true,
  });
  if (uploadError) {
    logError("payroll/company/logo POST: upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload logo." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin.from("payroll_companies").update({ logo_url: path }).eq("owner_id", owner.ownerId);
  if (updateError) {
    logError("payroll/company/logo POST: company update failed", updateError);
    return NextResponse.json({ error: "Logo uploaded but couldn't save it to your company — try again." }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ logoPath: path, previewUrl: signed?.signedUrl ?? null });
}
