import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardAccess } from "@/lib/dashboard/bir-guard-access";
import { logError } from "@/lib/log-error";

const BUCKET = "bir-guard-screenshots";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — re-signed on each page load, see cases GET

/**
 * Uploads the USER's OWN screenshot of their mytax.bir.gov.ph account (e.g.
 * a photo of their Open Cases screen) — never bot-captured. This is
 * evidence the user chooses to attach, not something scraped on their
 * behalf.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  if (!(await hasBirGuardAccess(user.email))) {
    return NextResponse.json({ error: "BIR Guard is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("bir_open_cases")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WEBP images are supported." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
  }

  const extension = file.name.split(".").pop() || "png";
  const filePath = `${user.id}/${params.id}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, await file.arrayBuffer(), { contentType: file.type });

  if (uploadError) {
    logError("bir-guard/screenshot POST: storage upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload screenshot." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("bir_open_cases")
    .update({ screenshot_url: filePath })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (updateError) {
    logError("bir-guard/screenshot POST: case update failed", updateError);
    return NextResponse.json({ error: "Uploaded, but failed to attach to the case." }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ signedUrl: signed?.signedUrl ?? null });
}
