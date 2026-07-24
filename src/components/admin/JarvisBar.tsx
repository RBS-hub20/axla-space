"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Loader2, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

/** Prefers an en-PH voice, then any English female-sounding voice, then whatever's default. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const enPh = voices.find((v) => v.lang.toLowerCase() === "en-ph");
  if (enPh) return enPh;
  const usFemale = voices.find((v) => v.lang.toLowerCase().startsWith("en-us") && /female|samantha|zira|susan/i.test(v.name));
  if (usFemale) return usFemale;
  const anyUs = voices.find((v) => v.lang.toLowerCase().startsWith("en-us"));
  if (anyUs) return anyUs;
  const anyEnglish = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return anyEnglish ?? voices[0];
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
  const [unsupportedHint, setUnsupportedHint] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setVoiceInSupported(Boolean(getSpeechRecognition()));
    const synth = getSpeechSynthesis();
    setVoiceOutSupported(Boolean(synth));
    if (!synth) return;

    function loadVoices() {
      voicesRef.current = synth!.getVoices();
    }
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synth = getSpeechSynthesis();
      if (!synth || !voiceOn) return;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(voicesRef.current.length ? voicesRef.current : synth.getVoices());
      if (voice) utterance.voice = voice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [voiceOn],
  );

  const ask = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/jarvis?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          const answer = data.error || "Jarvis couldn't answer that.";
          setHistory((h) => [{ query: q, answer, voiceAnswer: answer, stats: {} }, ...h].slice(0, 3));
          return;
        }
        setHistory((h) => [{ query: q, answer: data.answer, voiceAnswer: data.voiceAnswer, stats: data.stats }, ...h].slice(0, 3));
        speak(data.voiceAnswer);
      } catch {
        const answer = "Network error — try again.";
        setHistory((h) => [{ query: q, answer, voiceAnswer: answer, stats: {} }, ...h].slice(0, 3));
      } finally {
        setLoading(false);
      }
    },
    [speak],
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
      if (on) getSpeechSynthesis()?.cancel();
      return !on;
    });
  }

  return (
    <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(query);
          }}
          className="flex items-center gap-2"
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
            className={`border-gray-700 bg-gray-900 text-white transition ${listening ? "animate-pulse border-[#00FF88] ring-2 ring-[#00FF88]/40" : ""}`}
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

        <p className="text-xs text-gray-600">Tip: Click the mic and say &ldquo;Jarvis report today&rdquo; or &ldquo;How many DTI?&rdquo;</p>

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
