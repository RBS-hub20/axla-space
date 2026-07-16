let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

/**
 * Plays a short two-note chime for the "TaxLaya replied" notification.
 * Synthesized with the Web Audio API so the widget doesn't need to ship
 * or fetch an audio file.
 */
export function playNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  function playTone(frequency: number, start: number, duration: number) {
    const oscillator = ctx!.createOscillator();
    const gain = ctx!.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.15, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(gain);
    gain.connect(ctx!.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration + 0.05);
  }

  playTone(880, 0, 0.12);
  playTone(1174.66, 0.1, 0.18);
}
