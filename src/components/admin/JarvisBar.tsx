"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Loader2, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Persona = "jarvis" | "friday";

// Same IDs as src/lib/voice/elevenlabs.ts — not secrets (an ElevenLabs
// voice ID is just a public catalog reference, unlike the API key itself,
// which never leaves the server). Kept in sync manually since this is a
// 2-voice feature, not worth a shared-constants module yet.
const JARVIS_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku"; // "Adam" / Jarvis Male
const FRIDAY_VOICE_ID = "c6SfcYrb2t09NHXiT80T"; // "Eva" / FRIDAY Female
const PERSONA_STORAGE_KEY = "axla-admin-jarvis-persona";

interface JarvisAnswer {
  query: string;
  answer: string;
  voiceAnswer: string;
  stats: Record<string, number>;
}

// Minimal shape for the handful of SpeechRecognition members this component
// touches — not in TS's default lib.dom, and only some browsers have it.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

const MALE_VOICE_NAME_PRIORITY = ["daniel", "google uk english male", "microsoft david", "guy", "alex", "fred"];
const FEMALE_VOICE_NAME_PRIORITY = ["samantha", "google uk english female", "microsoft zira", "zira", "victoria", "karen", "moira", "tessa"];

/** Ranks browser voices best-first for the given gender preference. Never mutates the input array. */
function rankVoicesByGender(voices: SpeechSynthesisVoice[], gender: "male" | "female"): SpeechSynthesisVoice[] {
  const priority = gender === "male" ? MALE_VOICE_NAME_PRIORITY : FEMALE_VOICE_NAME_PRIORITY;
  const avoidPattern = gender === "male" ? /female|woman|samantha|zira|susan|victoria|karen|moira|tessa/i : /\bmale\b|\bman\b|daniel|alex|fred|\bguy\b/i;

  function score(v: SpeechSynthesisVoice): number {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    const priorityIndex = priority.findIndex((keyword) => name.includes(keyword));
    if (priorityIndex !== -1) return 1000 - priorityIndex;
    if (avoidPattern.test(name)) return -100;
    const matchesGenderWord = new RegExp(gender, "i").test(name);
    if (matchesGenderWord && lang.startsWith("en-gb")) return 50;
    if (matchesGenderWord && lang.startsWith("en-us")) return 40;
    if (matchesGenderWord) return 30;
    if (lang.startsWith("en-gb")) return 10;
    if (lang.startsWith("en-us")) return 5;
    if (lang.startsWith("en")) return 1;
    return 0;
  }
  return [...voices].filter((v) => v.lang.toLowerCase().startsWith("en")).sort((a, b) => score(b) - score(a));
}

export function JarvisBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [history, setHistory] = useState<JarvisAnswer[]>([]);
  const [voiceInSupported, setVoiceInSupported] = useState(false);
  const [voiceOutSupported, setVoiceOutSupported] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [persona, setPersona] = useState<Persona>("jarvis");
  const [unsupportedHint, setUnsupportedHint] = useState<string | null>(null);
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (stored === "friday" || stored === "jarvis") setPersona(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, persona);
  }, [persona]);

  useEffect(() => {
    setVoiceInSupported(Boolean(getSpeechRecognition()));
    const synth = getSpeechSynthesis();
    setVoiceOutSupported(Boolean(synth));
    if (!synth) return;

    function loadVoices() {
      setAllVoices(synth!.getVoices());
    }
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const rankedVoices = rankVoicesByGender(allVoices, persona === "friday" ? "female" : "male");

  useEffect(() => {
    // Re-pick the top-ranked voice for the current persona whenever persona
    // or the available voice list changes, unless the admin already chose
    // one from the dropdown for this exact list.
    setSelectedVoiceURI((current) => (rankedVoices.some((v) => v.voiceURI === current) ? current : rankedVoices[0]?.voiceURI ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, allVoices.length]);

  const speakBrowser = useCallback(
    (text: string) => {
      const synth = getSpeechSynthesis();
      if (!synth) return;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = rankedVoices.find((v) => v.voiceURI === selectedVoiceURI) ?? rankedVoices[0] ?? null;
      if (voice) utterance.voice = voice;
      // Male Jarvis: slower and deeper, butler cadence. Female FRIDAY:
      // closer to natural pace, slightly higher — confident, not cartoonish.
      utterance.rate = persona === "friday" ? 1.0 : 0.95;
      utterance.pitch = persona === "friday" ? 1.1 : 0.85;
      utterance.volume = 1.0;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [rankedVoices, selectedVoiceURI, persona],
  );

  const speak = useCallback(
    async (text: string) => {
      if (!voiceOn) return;

      if (elevenLabsConfigured) {
        try {
          audioRef.current?.pause();
          setSpeaking(true);
          const voiceId = persona === "friday" ? FRIDAY_VOICE_ID : JARVIS_VOICE_ID;
          const res = await fetch("/api/admin/jarvis/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voiceId }),
          });
          if (!res.ok) throw new Error("ElevenLabs request failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => setSpeaking(false);
          audio.onerror = () => setSpeaking(false);
          await audio.play();
          return;
        } catch {
          // Falls through to browser TTS below — never leave the admin with total silence just because ElevenLabs hiccuped.
          setSpeaking(false);
        }
      }

      speakBrowser(text);
    },
    [voiceOn, elevenLabsConfigured, persona, speakBrowser],
  );

  const ask = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/jarvis?q=${encodeURIComponent(q)}&persona=${persona}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          const answer = data.error || "Jarvis couldn't answer that.";
          setHistory((h) => [{ query: q, answer, voiceAnswer: answer, stats: {} }, ...h].slice(0, 3));
          return;
        }
        setElevenLabsConfigured(Boolean(data.elevenLabsConfigured));
        setHistory((h) => [{ query: q, answer: data.answer, voiceAnswer: data.voiceAnswer, stats: data.stats }, ...h].slice(0, 3));
        speak(data.voiceAnswer);
      } catch {
        const answer = "Network error — try again.";
        setHistory((h) => [{ query: q, answer, voiceAnswer: answer, stats: {} }, ...h].slice(0, 3));
      } finally {
        setLoading(false);
      }
    },
    [persona, speak],
  );

  function handleMicClick() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setUnsupportedHint("Voice not supported in this browser, use Chrome.");
      setTimeout(() => setUnsupportedHint(null), 3000);
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        setQuery(transcript);
        ask(transcript);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function toggleVoiceOn() {
    setVoiceOn((on) => {
      if (on) {
        getSpeechSynthesis()?.cancel();
        audioRef.current?.pause();
        setSpeaking(false);
      }
      return !on;
    });
  }

  return (
    <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-900 p-1">
            <button
              type="button"
              onClick={() => setPersona("jarvis")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                persona === "jarvis" ? "bg-[#00FF88] text-gray-950" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              🤵‍♂️ Jarvis Male
            </button>
            <button
              type="button"
              onClick={() => setPersona("friday")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                persona === "friday" ? "bg-[#00FF88] text-gray-950" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              👩‍💻 FRIDAY Female
            </button>
          </div>
          {!elevenLabsConfigured && rankedVoices.length > 0 && (
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              title="Browser voice"
              className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200"
            >
              {rankedVoices.slice(0, 5).map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(query);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative">
            <Button
              type="button"
              onClick={handleMicClick}
              title={voiceInSupported ? "Ask by voice" : "Voice not supported in this browser, use Chrome"}
              variant="outline"
              className={`shrink-0 gap-1.5 border-gray-700 px-3 ${listening ? "animate-pulse bg-red-500/20 text-red-300" : "text-gray-200"}`}
            >
              {listening ? "🔴" : <Mic className="h-4 w-4" />}
            </Button>
            {unsupportedHint && (
              <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 shadow-lg">
                {unsupportedHint}
              </div>
            )}
          </div>

          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={listening ? "Listening..." : `Ask Jarvis: "Report today" or "Invoice report" or "How many DTI?"`}
            className={`min-w-[180px] flex-1 border-gray-700 bg-gray-900 text-white transition ${listening ? "animate-pulse border-[#00FF88] ring-2 ring-[#00FF88]/40" : ""}`}
          />

          {voiceOutSupported && (
            <Button
              type="button"
              onClick={toggleVoiceOn}
              title={voiceOn ? "Voice replies on" : "Voice replies off"}
              variant="outline"
              className={`shrink-0 gap-1.5 border-gray-700 ${voiceOn ? "text-[#00FF88]" : "text-gray-500"}`}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {voiceOn ? "On" : "Off"}
            </Button>
          )}

          <Button type="submit" disabled={loading} className="shrink-0 gap-1.5 bg-[#00FF88] text-gray-950 hover:bg-[#00e07a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask
          </Button>
        </form>

        <p className="text-xs text-gray-600">
          Tip: Click the mic and say &ldquo;Jarvis, report today, Boss&rdquo; — wait, he&apos;ll call YOU Boss!
          {elevenLabsConfigured ? " ElevenLabs voice active." : ""}
        </p>

        {history.length > 0 && (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={`${h.query}-${i}`}
                className={`rounded-lg border px-4 py-3 text-sm transition ${
                  i === 0 && speaking
                    ? "animate-pulse border-[#00FF88] bg-[#00FF88]/10"
                    : "border-[#00FF88]/20 bg-[#00FF88]/5"
                } ${i === 0 ? "animate-in fade-in" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">&ldquo;{h.query}&rdquo;</p>
                  <div className="flex items-center gap-2">
                    {i === 0 && speaking && <span className="text-xs font-medium text-[#00FF88]">🔊 Speaking...</span>}
                    {voiceOutSupported && (
                      <button
                        type="button"
                        onClick={() => speak(h.voiceAnswer)}
                        title="Replay voice"
                        className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-[#00FF88]"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-gray-100">{h.answer}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
