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

export const JARVIS_VOICE_ID = "IRHApOXLvnW57QJPQH2P"; // "Adam - Deep Jarvis" / default male voice
// Previous default, from an earlier version of this file — kept as an
// accepted fallback ID (see VOICE_SETTINGS_BY_ID below and the speak
// route's allowlist), not selected by default anymore. Originally used
// from prior knowledge of ElevenLabs' stock library where this ID is
// commonly cited as "Lily" (typically a female voice), not "Adam" — worth
// confirming in your own ElevenLabs dashboard what it actually sounds like
// before relying on it.
export const JARVIS_VOICE_ID_LEGACY = "pFZP5JQG7iQjIQuC4Bku";
export const FRIDAY_VOICE_ID = "c6SfcYrb2t09NHXiT80T"; // "Eva" / FRIDAY Female

export const isElevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);

// ElevenLabs voice IDs are short alphanumeric tokens interpolated straight
// into the request URL path — validate the shape before it ever reaches
// fetch() so a malformed/hostile value can't smuggle extra path segments.
const VOICE_ID_PATTERN = /^[a-zA-Z0-9]{10,40}$/;

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  speed?: number;
}

// Per-voice tuning — the new default Adam voice gets the deeper/British
// "Jarvis" feel requested; other voices keep the previous general-purpose
// settings. `speed` is included per the request's spec, but it's a newer
// ElevenLabs voice_settings field I can't verify against a live account
// from here (no key configured locally) — ElevenLabs' API has historically
// ignored unrecognized keys rather than erroring, so this should be
// harmless even if the field name/range has since changed; worth
// confirming once a real key is set.
const VOICE_SETTINGS_BY_ID: Record<string, VoiceSettings> = {
  [JARVIS_VOICE_ID]: { stability: 0.7, similarity_boost: 0.8, style: 0.3, speed: 0.95 },
};
const DEFAULT_VOICE_SETTINGS: VoiceSettings = { stability: 0.5, similarity_boost: 0.75 };

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
        voice_settings: VOICE_SETTINGS_BY_ID[voiceId] ?? DEFAULT_VOICE_SETTINGS,
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
