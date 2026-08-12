import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-staff-docs";

export async function DELETE(_req: Request, { params }: { params: { id: string; docId: string } }) {
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

  const { data: doc } = await supabaseAdmin
    .from("payroll_staff_documents")
    .select("file_path")
    .eq("id", params.docId)
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { error: dbError } = await supabaseAdmin
    .from("payroll_staff_documents")
    .delete()
    .eq("id", params.docId)
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId);
  if (dbError) {
    logError("payroll/staff/[id]/documents/[docId] DELETE: db delete failed", dbError);
    return NextResponse.json({ error: "Failed to remove document." }, { status: 500 });
  }

  const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove([doc.file_path]);
  if (storageError) {
    // Row is already gone — log and move on rather than surfacing an error for an orphaned storage object the user can no longer see anyway.
    logError("payroll/staff/[id]/documents/[docId] DELETE: storage remove failed", storageError);
  }

  return NextResponse.json({ ok: true });
}
