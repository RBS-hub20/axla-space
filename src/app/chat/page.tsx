"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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

export default function ChatPage() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, setMessages } = useChat({ transport });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

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
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatHeader onClear={clearChat} />

      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Image
              src="/taxlaya-avatar.png"
              alt="TaxLaya"
              width={96}
              height={96}
              className="mb-4 h-24 w-24 rounded-full border-4 border-green-500/20 object-cover"
              priority
            />
            <h2 className="mb-2 text-2xl font-bold text-foreground">Hi, TaxLaya here 👋</h2>
            <p className="mb-6 text-muted-foreground">
              Palayain kita sa BIR hassle. Ano problema natin today?
            </p>
            <div className="flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="text-sm"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 px-4 text-muted-foreground">
                <Image
                  src="/taxlaya-avatar.png"
                  alt="TaxLaya"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <div className="flex gap-1">
                  <span className="animate-bounce">TaxLaya is typing</span>
                  <span className="animate-bounce [animation-delay:0.1s]">.</span>
                  <span className="animate-bounce [animation-delay:0.2s]">.</span>
                  <span className="animate-bounce [animation-delay:0.3s]">.</span>
                </div>
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

      <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
        ⚠️ Disclaimer: Di ako CPA ha, best practice lang to. Consult your accountant for legal advice.
      </div>
    </div>
  );
}
