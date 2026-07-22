"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Infinity as InfinityIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradeWallModal, type UpgradeWallType } from "@/components/dashboard/UpgradeWallModal";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

interface UsageBucket {
  used: number;
  limit: number | null;
  remaining: number | null;
}

const QUICK_PROMPTS = ["Compute my 2551Q from GCash", "8% vs 3% for me?"];

/** Dark circle + glowing green robot icon — deliberately techy/non-human, distinct from the public widget's girl avatar. */
function BrainAvatar({ size = "h-9 w-9", iconSize = "h-4 w-4" }: { size?: string; iconSize?: string }) {
  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-[#00FF85]/30 bg-[#080F14]`}
      style={{ boxShadow: "0 0 14px 1px rgba(0,255,136,0.45)" }}
    >
      <Bot className={`${iconSize} text-[#00FF85]`} style={{ filter: "drop-shadow(0 0 4px rgba(0,255,136,0.8))" }} />
    </div>
  );
}

export default function BrainAiPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [aiChats, setAiChats] = useState<UsageBucket | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeWall, setUpgradeWall] = useState<{ type: UpgradeWallType; message: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/dashboard/brain", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
        if (data.aiChats) setAiChats(data.aiChats);
        setIsUnlimited(Boolean(data.isUnlimited));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text || isSending) return;

    setError(null);
    setInput("");
    const optimisticUser: ChatMessage = { id: `local-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, optimisticUser]);
    setIsSending(true);

    try {
      const res = await fetch("/api/dashboard/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
          setUpgradeWall({ type: data.type, message: data.message });
          return;
        }
        setError(data.error || "Something went wrong.");
        return;
      }

      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, role: "assistant", content: data.reply }]);
      setIsUnlimited(Boolean(data.isUnlimited));
      if (!data.isUnlimited) {
        setAiChats({ used: 0, limit: data.limit, remaining: data.remaining });
      }
    } catch {
      setError("Network error.");
    } finally {
      setIsSending(false);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input.trim());
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrainAvatar size="h-11 w-11" iconSize="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-bold text-white">Axla Brain AI 🤖</h1>
            <p className="text-sm text-slate-400">Your private BIR intelligence</p>
            <p className="text-xs text-slate-500">Knows your GCash, filings, and computations</p>
          </div>
        </div>
        {isUnlimited ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#00FF85]/10 px-3 py-1.5 text-xs font-semibold text-[#00FF85]">
            <InfinityIcon className="h-3.5 w-3.5" />
            Unlimited
          </span>
        ) : (
          aiChats && (
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300">
              {aiChats.remaining}/{aiChats.limit} left today —{" "}
              <a href="/dashboard/settings" className="text-[#00FF85] hover:underline">
                Upgrade to PRO
              </a>
            </span>
          )
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <BrainAvatar size="h-14 w-14" iconSize="h-6 w-6" />
              <p className="text-sm text-slate-400">
                Boss ano ilalagay sa Line 12? Tanong mo lang — sagutin kita.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#00FF85]/40 hover:text-[#00FF85]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <BrainAvatar />}
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[75%] rounded-2xl rounded-tr-sm bg-[#00FF85]/15 px-4 py-2.5 text-sm text-white"
                      : "max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white/5 px-4 py-2.5 text-sm text-slate-200"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {isSending && (
            <div className="flex items-end justify-start gap-2">
              <BrainAvatar />
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white/5 px-4 py-2.5 text-sm text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Brain AI is thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>

        {error && <div className="mx-4 mb-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

        {messages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 pt-3">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                disabled={isSending}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400 transition hover:border-[#00FF85]/40 hover:text-[#00FF85] disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2 p-4 pt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Brain AI about my taxes..."
            disabled={isSending}
            className="h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-slate-500 focus:border-[#00FF85] focus:outline-none focus:ring-2 focus:ring-[#00FF85]/30"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#00FF85] text-[#001A29] transition hover:bg-[#00e078] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </Card>

      <UpgradeWallModal
        open={Boolean(upgradeWall)}
        onClose={() => setUpgradeWall(null)}
        type={upgradeWall?.type ?? null}
        message={upgradeWall?.message ?? null}
      />
    </div>
  );
}
