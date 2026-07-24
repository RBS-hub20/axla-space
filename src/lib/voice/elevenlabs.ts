import "server-only";

/**
 * ElevenLabs TTS — foundation for a real Paul Bettany-style Jarvis voice.
 * Deliberately SERVER-ONLY: the ElevenLabs API key is billable per
 * character, so it must never be shipped to the browser as a
 * NEXT_PUBLIC_* var (anyone could read it out of the client bundle and run
 * up usage on it). The client only ever learns a boolean
 * (`elevenLabsConfigured`, returned by /api/admin/jarvis) — it calls
 * /api/admin/jarvis/speak to get audio back, and that route is the only
 * thing that ever touches the real key.
 *
 * TODO: set ELEVENLABS_API_KEY to enable this path for real. Get a key at
 * elevenlabs.io.
 */

// pFZP5JQG7iQjIQuC4Bku was used in an earlier version of this file as a
// generic placeholder default — from prior knowledge of ElevenLabs' stock
// voice library that ID is commonly cited as "Lily" (typically a female
// voice), not "Adam". Kept here labeled per the current spec ("Jarvis
// Male") since only the account owner can see what it actually sounds like
// in their own ElevenLabs dashboard — worth a quick listen to confirm it's
// the voice you expect before relying on the Male/Female split.
export const JARVIS_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku"; // "Adam" / Jarvis Male
export const FRIDAY_VOICE_ID = "c6SfcYrb2t09NHXiT80T"; // "Eva" / FRIDAY Female

export const isElevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);

// ElevenLabs voice IDs are short alphanumeric tokens interpolated straight
// into the request URL path — validate the shape before it ever reaches
// fetch() so a malformed/hostile value can't smuggle extra path segments.
const VOICE_ID_PATTERN = /^[a-zA-Z0-9]{10,40}$/;

export interface ElevenLabsResult {
  audio: Buffer | null;
  error?: string;
}

/** Calls ElevenLabs' text-to-speech endpoint for the given voice and returns the raw MP3 bytes, or an error. */
export async function synthesizeSpeech(text: string, voiceId: string = JARVIS_VOICE_ID): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { audio: null, error: "ElevenLabs is not configured." };
  }
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    return { audio: null, error: "Invalid voice id." };
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { audio: null, error: `ElevenLabs request failed (${res.status}): ${detail.slice(0, 200)}` };
    }

    const arrayBuffer = await res.arrayBuffer();
    return { audio: Buffer.from(arrayBuffer) };
  } catch (err) {
    return { audio: null, error: err instanceof Error ? err.message : "Network error." };
  }
}
