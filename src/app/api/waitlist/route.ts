import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { logError } from "@/lib/log-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; bir_hate_level?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const birHateLevel =
    typeof body.bir_hate_level === "number" ? body.bir_hate_level : Number(body.bir_hate_level);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  if (!Number.isInteger(birHateLevel) || birHateLevel < 1 || birHateLevel > 10) {
    return NextResponse.json(
      { error: "Please pick a hassle level from 1 to 10." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Waitlist isn't configured yet. Please try again later." },
      { status: 503 },
    );
  }

  // Upsert on email: re-submitting (e.g. to change your hassle level) updates
  // the existing row instead of erroring on the unique constraint.
  const { error } = await supabase
    .from("waitlist")
    .upsert({ email, bir_hate_level: birHateLevel }, { onConflict: "email" });

  if (error) {
    logError(`waitlist: Supabase upsert failed (url=${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "unset"})`, error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ message: "You're on the waitlist!" }, { status: 201 });
}
