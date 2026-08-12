import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/payroll/file-validation";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-staff-avatars";
const SIGNED_URL_TTL_SECONDS = 3600;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Staff avatar upload — same magic-byte-validated, one-file-per-row pattern as /api/payroll/company/logo. Path is keyed by staff id (scoped under owner id) so two staff can never collide. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  const { data: staffRow } = await supabaseAdmin.from("payroll_staff").select("id").eq("id", params.id).eq("owner_id", owner.ownerId).maybeSingle();
  if (!staffRow) {
    return NextResponse.json({ error: "Staff not found." }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Photo must be under 5MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected.mime)) {
    return NextResponse.json({ error: "Photo must be a real JPEG, PNG, or WebP image." }, { status: 400 });
  }

  const ext = EXT_BY_MIME[detected.mime] ?? "jpg";
  const path = `${owner.ownerId}/${params.id}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: detected.mime,
    upsert: true,
  });
  if (uploadError) {
    logError("payroll/staff/[id]/avatar POST: upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload photo." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin.from("payroll_staff").update({ avatar_url: path }).eq("id", params.id).eq("owner_id", owner.ownerId);
  if (updateError) {
    logError("payroll/staff/[id]/avatar POST: staff update failed", updateError);
    return NextResponse.json({ error: "Photo uploaded but couldn't save it — try again." }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ avatarPath: path, previewUrl: signed?.signedUrl ?? null });
}
