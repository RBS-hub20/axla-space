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
 * elevenlabs.io. Default voice below (pFZP5JQG7iQjIQuC4Bku) is ElevenLabs'
 * own "Lily" voice as a placeholder — swap in a cloned/custom Jarvis voice
 * ID via ELEVENLABS_VOICE_ID once you have one.
 */

const DEFAULT_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";

export const isElevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);

export interface ElevenLabsResult {
  audio: Buffer | null;
  error?: string;
}

/** Calls ElevenLabs' text-to-speech endpoint and returns the raw MP3 bytes, or an error. */
export async function synthesizeSpeech(text: string): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { audio: null, error: "ElevenLabs is not configured." };
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

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
