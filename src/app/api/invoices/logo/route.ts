import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateInvoiceSettings } from "@/lib/dashboard/invoice-settings";
import { logError } from "@/lib/log-error";

const BUCKET = "invoice-logos";
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const SIGNED_URL_TTL_SECONDS = 3600;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Logo must be PNG, JPEG, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Logo must be under 2MB." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/logo.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) {
    logError("invoices/logo POST: upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload logo." }, { status: 500 });
  }

  await getOrCreateInvoiceSettings(user.id);
  const { error: updateError } = await supabaseAdmin.from("invoice_settings").update({ logo_url: path }).eq("user_id", user.id);
  if (updateError) logError("invoices/logo POST: settings update failed (non-fatal)", updateError);

  const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ logoPath: path, previewUrl: signed?.signedUrl ?? null });
}
