import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const RECEIPTS_BUCKET = "receipts";

interface RouteParams {
  params: { id: string };
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data: receipt, error: fetchError } = await supabaseAdmin
    .from("receipts")
    .select("id, file_path")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    logError("dashboard/receipts/[id] DELETE: fetch failed", fetchError);
    return NextResponse.json({ error: "Failed to delete receipt." }, { status: 500 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { error: storageError } = await supabaseAdmin.storage.from(RECEIPTS_BUCKET).remove([receipt.file_path]);
  if (storageError) {
    logError("dashboard/receipts/[id] DELETE: storage remove failed", storageError);
  }

  const { error: deleteError } = await supabaseAdmin.from("receipts").delete().eq("id", params.id).eq("user_id", user.id);
  if (deleteError) {
    logError("dashboard/receipts/[id] DELETE: row delete failed", deleteError);
    return NextResponse.json({ error: "Failed to delete receipt." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
