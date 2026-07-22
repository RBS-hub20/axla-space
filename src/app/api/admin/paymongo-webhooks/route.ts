import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { logError } from "@/lib/log-error";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const WEBHOOK_URL = "https://www.axla.space/api/webhooks/paymongo";

function authHeader(): string {
  return `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

interface PayMongoWebhook {
  id: string;
  attributes?: { url?: string; status?: string; events?: string[] };
}

/** Lists webhooks currently registered on the PayMongo account (admin-only diagnostic). */
export async function GET() {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!PAYMONGO_SECRET_KEY) {
    return NextResponse.json({ error: "PayMongo isn't configured." }, { status: 503 });
  }

  const res = await fetch("https://api.paymongo.com/v1/webhooks", {
    headers: { Authorization: authHeader() },
  });
  const json = await res.json();

  if (!res.ok) {
    logError("admin/paymongo-webhooks: list failed", new Error(JSON.stringify(json)));
    return NextResponse.json({ error: json?.errors?.[0]?.detail || "PayMongo request failed." }, { status: 502 });
  }

  const webhooks = ((json.data ?? []) as PayMongoWebhook[]).map((w) => ({
    id: w.id,
    url: w.attributes?.url,
    status: w.attributes?.status,
    events: w.attributes?.events,
  }));

  return NextResponse.json({ webhooks, targetUrl: WEBHOOK_URL });
}

/**
 * Registers the production webhook URL with PayMongo if it isn't already
 * there — idempotent, checks the existing list first so re-running this
 * never creates a duplicate.
 */
export async function POST() {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!PAYMONGO_SECRET_KEY) {
    return NextResponse.json({ error: "PayMongo isn't configured." }, { status: 503 });
  }

  const listRes = await fetch("https://api.paymongo.com/v1/webhooks", {
    headers: { Authorization: authHeader() },
  });
  const listJson = await listRes.json();
  if (!listRes.ok) {
    logError("admin/paymongo-webhooks: pre-create list failed", new Error(JSON.stringify(listJson)));
    return NextResponse.json({ error: listJson?.errors?.[0]?.detail || "PayMongo request failed." }, { status: 502 });
  }

  const existing = ((listJson.data ?? []) as PayMongoWebhook[]).find((w) => w.attributes?.url === WEBHOOK_URL);
  if (existing) {
    return NextResponse.json({
      created: false,
      webhook: { id: existing.id, url: existing.attributes?.url, status: existing.attributes?.status },
    });
  }

  const createRes = await fetch("https://api.paymongo.com/v1/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      data: { attributes: { url: WEBHOOK_URL, events: ["link.payment.paid", "payment.paid", "payment.failed"] } },
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) {
    logError("admin/paymongo-webhooks: create failed", new Error(JSON.stringify(createJson)));
    return NextResponse.json({ error: createJson?.errors?.[0]?.detail || "Failed to create webhook." }, { status: 502 });
  }

  return NextResponse.json({
    created: true,
    webhook: {
      id: createJson.data.id,
      url: createJson.data.attributes.url,
      status: createJson.data.attributes.status,
    },
  });
}
