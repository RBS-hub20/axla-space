import { createClient } from "@supabase/supabase-js";

// .trim() guards against a stray trailing newline/space in .env(.local) —
// a key that *looks* identical to the real one but has extra whitespace
// fails Supabase auth with "Invalid API key" and nothing else to go on.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Catches the specific placeholder values that ship in .env.example, and a
// few other common local-setup mistakes, so misconfiguration is obvious in
// the terminal the moment the dev server starts — instead of surfacing 30
// minutes later as an opaque "Something went wrong" on the waitlist form.
if (process.env.NODE_ENV !== "production") {
  if (!supabaseUrl || supabaseUrl.includes("xxxxxxxxxxxx")) {
    console.error(
      "[supabase/client] NEXT_PUBLIC_SUPABASE_URL is missing or still the placeholder value from .env.example. " +
        "Set it to your real project URL (Supabase dashboard -> Project Settings -> API) in .env.local, then restart `npm run dev`.",
    );
  } else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) {
    console.error(
      `[supabase/client] NEXT_PUBLIC_SUPABASE_URL ("${supabaseUrl}") doesn't look like a Supabase project URL ` +
        "(expected https://<project-ref>.supabase.co). Double-check you copied the right value.",
    );
  }

  if (!supabaseAnonKey || supabaseAnonKey === "your-anon-public-key") {
    console.error(
      "[supabase/client] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or still the placeholder value from .env.example. " +
        "Set it to your real anon/public key in .env.local, then restart `npm run dev`.",
    );
  } else {
    console.log(`[supabase/client] url=${supabaseUrl} anonKeyLength=${supabaseAnonKey.length}`);
  }
}

// Falls back to placeholder values so the client can be constructed even
// when Supabase hasn't been configured yet — callers check
// `isSupabaseConfigured` before using it.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
