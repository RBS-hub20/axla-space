import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HATE_OPTIONS = [
  "Ang haba ng pila",
  "Di ko alam ilalagay sa forms",
  "Nagbabayad ako ng CPA kahit maliit lang kita ko",
  "Natatakot ako sa penalties",
  "Ayoko lang talaga, period",
];

export async function POST(request: Request) {
  let body: { email?: unknown; hate?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const hate = typeof body.hate === "string" ? body.hate : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  if (!HATE_OPTIONS.includes(hate)) {
    return NextResponse.json({ error: "Please pick an answer." }, { status: 400 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Waitlist isn't configured yet. Please try again later." },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("waitlist").insert({ email, hate });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { message: "You're already on the list. Salamat!" },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ message: "You're on the waitlist!" }, { status: 201 });
}
