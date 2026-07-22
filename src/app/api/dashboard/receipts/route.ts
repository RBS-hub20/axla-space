import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { extractReceiptData } from "@/lib/dashboard/receipt-ocr";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";
import { checkAndIncrementUsage, LIMIT_MESSAGES } from "@/lib/usage";

const RECEIPTS_BUCKET = "receipts";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const SIGNED_URL_TTL_SECONDS = 120;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("receipts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logError("dashboard/receipts GET: query failed", error);
    return NextResponse.json({ error: "Failed to load receipts." }, { status: 500 });
  }

  // Attach a short-lived signed URL per receipt so the grid can render previews
  // without the storage bucket ever being public.
  const withUrls = await Promise.all(
    (data ?? []).map(async (receipt) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(receipt.file_path, SIGNED_URL_TTL_SECONDS);
      return { ...receipt, signed_url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ receipts: withUrls });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
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
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or HEIC images are supported." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
  }

  const usage = await checkAndIncrementUsage(user.id, user.email, "scan");
  if (!usage.allowed) {
    return NextResponse.json(
      { code: "LIMIT_REACHED", type: "scan", message: LIMIT_MESSAGES.scan, upgrade_url: "/dashboard/settings" },
      { status: 403 },
    );
  }

  const extension = file.name.split(".").pop() || "jpg";
  const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .upload(filePath, await file.arrayBuffer(), { contentType: file.type });

  if (uploadError) {
    logError("dashboard/receipts POST: storage upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  const ocr = signed?.signedUrl
    ? await extractReceiptData(signed.signedUrl)
    : { vendor: null, amount: null, date: null, category: "uncategorized" as const };

  const { data, error } = await supabaseAdmin
    .from("receipts")
    .insert({
      user_id: user.id,
      file_path: filePath,
      amount: ocr.amount,
      vendor: ocr.vendor,
      category: ocr.category,
      receipt_date: ocr.date,
      ocr_data: ocr,
    })
    .select("*")
    .single();

  if (error) {
    logError("dashboard/receipts POST: insert failed", error);
    return NextResponse.json({ error: "Failed to save receipt." }, { status: 500 });
  }

  await logActivity(
    user.id,
    "receipt_uploaded",
    ocr.vendor ? `Uploaded receipt from ${ocr.vendor}` : "Uploaded a receipt",
  );

  return NextResponse.json({ receipt: { ...data, signed_url: signed?.signedUrl ?? null } });
}
