import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { logError } from "@/lib/log-error";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

function authHeader(): string {
  return `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

/**
 * Admin diagnostic: fetches a payment (id starting `pay_`) or a link (any
 * other id/reference) directly from PayMongo's API — ground truth for a
 * specific transaction when the webhook never arrived, and for confirming
 * the real payload shape PayMongo actually sends.
 */
export async function GET(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!PAYMONGO_SECRET_KEY) {
    return NextResponse.json({ error: "PayMongo isn't configured." }, { status: 503 });
  }

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Query param `id` is required (a pay_... id or a link id)." }, { status: 400 });
  }

  const endpoint = id.startsWith("pay_")
    ? `https://api.paymongo.com/v1/payments/${id}`
    : `https://api.paymongo.com/v1/links/${id}`;

  const res = await fetch(endpoint, { headers: { Authorization: authHeader() } });
  const json = await res.json();

  if (!res.ok) {
    logError("admin/paymongo-payment: lookup failed", new Error(JSON.stringify(json)));
    return NextResponse.json({ error: json?.errors?.[0]?.detail || "PayMongo request failed.", endpoint }, { status: 502 });
  }

  return NextResponse.json({ endpoint, resource: json.data });
}
