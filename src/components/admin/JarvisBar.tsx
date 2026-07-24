"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface JarvisAnswer {
  query: string;
  answer: string;
  stats: Record<string, number>;
}

// Minimal shape for the handful of SpeechRecognition members this component
// touches — not in TS's default lib.dom, and only some browsers have it.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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

export function JarvisBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [history, setHistory] = useState<JarvisAnswer[]>([]);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognition()));
  }, []);

  const ask = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jarvis?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setHistory((h) => [{ query: q, answer: data.error || "Jarvis couldn't answer that.", stats: {} }, ...h].slice(0, 3));
        return;
      }
      setHistory((h) => [{ query: q, answer: data.answer, stats: data.stats }, ...h].slice(0, 3));
    } catch {
      setHistory((h) => [{ query: q, answer: "Network error — try again.", stats: {} }, ...h].slice(0, 3));
    } finally {
      setLoading(false);
    }
  }, []);

  function handleMicClick() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
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

  return (
    <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-3 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(query);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Ask Jarvis: "Report today" or "Invoice report" or "How many DTI?"`}
            className="border-gray-700 bg-gray-900 text-white"
          />
          <Button type="submit" disabled={loading} className="shrink-0 gap-1.5 bg-[#00FF88] text-gray-950 hover:bg-[#00e07a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask
          </Button>
          {voiceSupported && (
            <Button
              type="button"
              onClick={handleMicClick}
              variant="outline"
              className={`shrink-0 gap-1.5 border-gray-700 ${listening ? "animate-pulse bg-red-500/20 text-red-300" : "text-gray-200"}`}
            >
              <Mic className="h-4 w-4" />
              {listening ? "Listening..." : "Voice"}
            </Button>
          )}
        </form>

        {history.length > 0 && (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={`${h.query}-${i}`}
                className={`rounded-lg border border-[#00FF88]/20 bg-[#00FF88]/5 px-4 py-3 text-sm transition ${i === 0 ? "animate-in fade-in" : "opacity-60"}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">&ldquo;{h.query}&rdquo;</p>
                <p className="mt-1 text-gray-100">{h.answer}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
