import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { synthesizeSpeech, isElevenLabsConfigured, JARVIS_VOICE_ID, JARVIS_VOICE_ID_LEGACY, FRIDAY_VOICE_ID } from "@/lib/voice/elevenlabs";
import { logError } from "@/lib/log-error";

interface SpeakBody {
  text?: unknown;
  voiceId?: unknown;
}

/** Proxies ElevenLabs TTS — the browser never sees ELEVENLABS_API_KEY, only this route does. */
export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isElevenLabsConfigured) {
    return NextResponse.json({ error: "ElevenLabs is not configured." }, { status: 503 });
  }

  let body: SpeakBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  // Only known-good IDs are accepted here, never an arbitrary
  // client-supplied string passed straight to ElevenLabs — synthesizeSpeech
  // validates shape too, but pinning to an allowlist here is simpler to
  // reason about. The legacy Adam ID is still accepted (kept as a fallback,
  // per the request) even though the client no longer defaults to sending it.
  const ALLOWED_VOICE_IDS = new Set([JARVIS_VOICE_ID, JARVIS_VOICE_ID_LEGACY, FRIDAY_VOICE_ID]);
  const voiceId = typeof body.voiceId === "string" && ALLOWED_VOICE_IDS.has(body.voiceId) ? body.voiceId : JARVIS_VOICE_ID;

  const result = await synthesizeSpeech(body.text.slice(0, 2000), voiceId);
  if (!result.audio) {
    logError("admin/jarvis/speak POST: synthesis failed", new Error(result.error ?? "unknown"));
    return NextResponse.json({ error: result.error ?? "Speech synthesis failed." }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(result.audio), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
