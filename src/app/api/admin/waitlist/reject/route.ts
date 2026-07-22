import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { rejectWaitlistEmail } from "@/lib/admin-waitlist";
import { logError } from "@/lib/log-error";

interface RejectBody {
  email?: unknown;
}

export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: RejectBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const result = await rejectWaitlistEmail(body.email);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to reject." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logError("admin/waitlist/reject: unexpected error", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
