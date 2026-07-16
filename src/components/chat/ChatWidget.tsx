"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatInput } from "@/components/chat/ChatInput";

const SUGGESTED_PROMPTS = [
  "Paano mag-file ng 2551Q?",
  "Kailan deadline ng 1701Q?",
  "Nalate ako sa 0619E, magkano penalty?",
];

export function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({ transport });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isOpen]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage({ text });
  }

  function handleSuggestedPrompt(prompt: string) {
    sendMessage({ text: prompt });
  }

  function clearChat() {
    setMessages([]);
    clearError();
  }

  // Internal admin dashboard isn't a public support surface — skip the widget there.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div
          className="mb-3 flex h-[min(600px,calc(100vh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl shadow-black/50"
          role="dialog"
          aria-label="TaxLaya chat"
        >
          <ChatHeader onClear={clearChat} onClose={() => setIsOpen(false)} />

          <ScrollArea className="flex-1 p-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Image
                  src="/taxlaya-avatar.png"
                  alt="TaxLaya"
                  width={64}
                  height={64}
                  className="mb-3 h-16 w-16 rounded-full border-4 border-taxlaya-green/20 object-cover shadow-[0_0_24px_rgba(0,255,136,0.25)]"
                  priority
                />
                <h2 className="mb-1 text-lg font-bold text-gray-100">Hi, TaxLaya here 👋</h2>
                <p className="mb-4 px-2 text-sm text-gray-400">
                  Palayain kita sa BIR hassle. Ano problema natin today?
                </p>
                <div className="flex flex-col gap-2 px-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      onClick={() => handleSuggestedPrompt(prompt)}
                      className="border-gray-700 bg-gray-800 text-xs text-gray-200 hover:bg-gray-700"
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 px-1 text-gray-400">
                    <Image
                      src="/taxlaya-avatar.png"
                      alt="TaxLaya"
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full object-cover"
                    />
                    <div className="flex gap-1 text-sm">
                      <span className="animate-bounce">TaxLaya is typing</span>
                      <span className="animate-bounce [animation-delay:0.1s]">.</span>
                      <span className="animate-bounce [animation-delay:0.2s]">.</span>
                      <span className="animate-bounce [animation-delay:0.3s]">.</span>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
                    {error.message}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <ChatInput
            input={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
          />

          <div className="border-t border-gray-800 px-3 py-1.5 text-center text-[10px] text-gray-500">
            ⚠️ Di ako CPA ha, best practice lang to. Consult your accountant for legal advice.
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close TaxLaya chat" : "Open TaxLaya chat"}
        className="relative ml-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-taxlaya-green/40 bg-gray-900 shadow-[0_0_24px_rgba(0,255,136,0.35)] transition hover:scale-105 hover:shadow-[0_0_32px_rgba(0,255,136,0.5)]"
      >
        <Image
          src="/taxlaya-avatar.png"
          alt="TaxLaya"
          width={64}
          height={64}
          className="h-full w-full rounded-full object-cover"
        />
        {!isOpen && (
          <span className="absolute right-0 top-0 h-4 w-4 animate-pulse rounded-full border-2 border-gray-900 bg-taxlaya-green shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
        )}
      </button>
    </div>
  );
}
