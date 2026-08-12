import { NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-staff-docs";
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10MB — contracts/IDs scan larger than a selfie
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_staff_documents")
    .select("*")
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    logError("payroll/staff/[id]/documents GET: query failed", error);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }

  const docs = data ?? [];
  const paths = docs.map((d) => d.file_path as string);
  let signedByPath = new Map<string, string | null>();
  if (paths.length > 0) {
    const { data: signedList } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    signedByPath = new Map((signedList ?? []).map((s) => [s.path ?? "", s.signedUrl]));
  }

  return NextResponse.json({ documents: docs.map((d) => ({ ...d, signed_url: signedByPath.get(d.file_path) ?? null })) });
}

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
  const file = formData.get("file");
  const name = formData.get("name");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json({ error: "File must be under 10MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !ALLOWED_DOC_TYPES.includes(detected.mime)) {
    return NextResponse.json({ error: "File must be a real PDF, JPEG, PNG, or WebP." }, { status: 400 });
  }

  const docId = crypto.randomUUID();
  const path = `${owner.ownerId}/${params.id}/${docId}.${detected.ext}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: detected.mime,
  });
  if (uploadError) {
    logError("payroll/staff/[id]/documents POST: upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload document." }, { status: 500 });
  }

  const docName = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : file.name.slice(0, 120);

  const { data, error } = await supabaseAdmin
    .from("payroll_staff_documents")
    .insert({ id: docId, staff_id: params.id, owner_id: owner.ownerId, name: docName, file_path: path, file_type: detected.mime })
    .select()
    .single();

  if (error || !data) {
    logError("payroll/staff/[id]/documents POST: insert failed", error);
    return NextResponse.json({ error: "Uploaded but couldn't save the record — try again." }, { status: 500 });
  }

  const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ document: { ...data, signed_url: signed?.signedUrl ?? null } });
}
