import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { approveWaitlistEmail } from "@/lib/admin-waitlist";
import { logError } from "@/lib/log-error";

interface ApproveBody {
  email?: unknown;
  customBusinessName?: unknown;
}

export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: ApproveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const customBusinessName = typeof body.customBusinessName === "string" ? body.customBusinessName : undefined;

  try {
    const result = await approveWaitlistEmail(body.email, customBusinessName);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to approve." }, { status: 400 });
    }
    return NextResponse.json({ success: true, businessCreated: Boolean(result.businessCreated) });
  } catch (err) {
    logError("admin/waitlist/approve: unexpected error", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
