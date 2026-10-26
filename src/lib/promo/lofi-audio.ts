// Synthesized placeholder audio for the showreel's background bed and cut
// SFX — built entirely from oscillators/noise via Web Audio, not sampled
// from (or claiming to be) a licensed "Pinoy lo-fi" track or a real foley
// library. Swap buildLofiLoopBuffer's render for a real licensed track
// later; nothing here depends on it being any particular recording.

const LOOP_SECONDS = 4;
const BEAT_SECONDS = 1; // ~60 BPM half-time feel, two "boom" hits per loop

/** A warm, detuned 3-oscillator pad voicing one chord, with its own ADSR. */
function scheduleChord(ctx: BaseAudioContext, dest: AudioNode, freqs: number[], start: number, length: number, peakGain: number) {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakGain, start + 0.4);
    gain.gain.linearRampToValueAtTime(peakGain * 0.6, start + length * 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

/** Soft sine "boom" kick — pitch drops fast, short amp envelope. */
function scheduleKick(ctx: BaseAudioContext, dest: AudioNode, start: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, start);
  osc.frequency.exponentialRampToValueAtTime(48, start + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + 0.25);
}

/** Filtered noise burst for a soft hi-hat tick. */
function scheduleHat(ctx: BaseAudioContext, dest: AudioNode, start: number, gainPeak = 0.08) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.045);
  noise.connect(filter).connect(gain).connect(dest);
  noise.start(start);
}

/** Renders one seamless LOOP_SECONDS lo-fi-ish bed into an AudioBuffer via OfflineAudioContext, to be looped live by an AudioBufferSourceNode. */
export async function buildLofiLoopBuffer(referenceCtx: BaseAudioContext): Promise<AudioBuffer> {
  const sampleRate = referenceCtx.sampleRate;
  const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * LOOP_SECONDS), sampleRate);
  const bus = offline.createGain();
  bus.gain.value = 1;
  bus.connect(offline.destination);

  // Dm9-ish pad, two hits per 4s loop.
  scheduleChord(offline, bus, [146.83, 220.0, 261.63, 329.63], 0, 2, 0.11); // D3 A3 C4 E4
  scheduleChord(offline, bus, [130.81, 196.0, 246.94, 311.13], 2, 2, 0.1); // C3 G3 B3 Eb4

  scheduleKick(offline, bus, 0);
  scheduleKick(offline, bus, BEAT_SECONDS * 2);
  for (const t of [0.5, 1.5, 2.5, 3.5]) scheduleHat(offline, bus, t);

  return offline.startRendering();
}

/** Short synthesized "pop" transition sting at a scene cut — a descending blip, not a sampled SFX. */
export function schedulePop(ctx: BaseAudioContext, dest: AudioNode, start: number) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820, start);
  osc.frequency.exponentialRampToValueAtTime(180, start + 0.09);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.35, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + 0.12);
}
