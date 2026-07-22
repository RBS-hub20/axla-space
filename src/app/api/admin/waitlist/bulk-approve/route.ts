import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { approveWaitlistEmail } from "@/lib/admin-waitlist";
import { logError } from "@/lib/log-error";

const MAX_BULK = 20;

interface BulkApproveBody {
  emails?: unknown;
}

export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: BulkApproveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.emails) || body.emails.some((e) => typeof e !== "string")) {
    return NextResponse.json({ error: "emails must be an array of strings." }, { status: 400 });
  }

  const emails = (body.emails as string[]).slice(0, MAX_BULK);
  if (emails.length === 0) {
    return NextResponse.json({ error: "No emails provided." }, { status: 400 });
  }

  const settled = await Promise.allSettled(emails.map((email) => approveWaitlistEmail(email)));

  const results = settled.map((r, i) => {
    if (r.status === "fulfilled") {
      return { email: emails[i], success: r.value.success, error: r.value.success ? undefined : r.value.error };
    }
    logError("admin/waitlist/bulk-approve: approve threw", r.reason);
    return { email: emails[i], success: false, error: "Unexpected error." };
  });

  return NextResponse.json({
    results,
    approved: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}
