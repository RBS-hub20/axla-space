"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatInput } from "@/components/chat/ChatInput";
import { playNotificationSound } from "@/lib/notification-sound";
import { trackEvent } from "@/lib/analytics";
import { formsMentionedIn } from "@/lib/chat-analytics";

const WELCOME_MESSAGE =
  "Hi! I'm TaxLaya 👋 Your AI BIR buddy! Hate BIR paperwork? Same! Upload your GCash and I'll file 2551Q in 3 mins. Want me to show you how? 😊";

const QUICK_REPLIES = ["How does Axla work?", "Magkano PRO?", "Paano GCash sync?"];

const SOUND_PREF_KEY = "taxlaya-sound-enabled";
const WELCOMED_KEY = "taxlaya_welcomed";
const TOAST_DELAY_MS = 800;
const TOAST_DURATION_MS = 5000;
const AUTO_OPEN_DELAY_MS = 2000;
const TYPING_BEFORE_WELCOME_MS = 1000;
const BOUNCE_DURATION_MS = 1000;

export function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [isTypingWelcome, setIsTypingWelcome] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [bounceAvatar, setBounceAvatar] = useState(false);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({ transport });
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(status);

  // Welcome toast: appears once shortly after load, auto-hides after 5s.
  useEffect(() => {
    const showTimer = setTimeout(() => setShowToast(true), TOAST_DELAY_MS);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!showToast) return;
    const hideTimer = setTimeout(() => setShowToast(false), TOAST_DURATION_MS);
    return () => clearTimeout(hideTimer);
  }, [showToast]);

  // Auto-open once ever, only on the landing page, 2s after first visit —
  // gated on localStorage (not sessionStorage) exactly as requested, so it
  // genuinely only ever fires once per browser, not once per tab/session.
  useEffect(() => {
    if (pathname !== "/") return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(WELCOMED_KEY) === "true") return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      setShowToast(false);
      setEverOpened(true);
      setBounceAvatar(true);
      localStorage.setItem(WELCOMED_KEY, "true");
      trackEvent("widget_auto_opened");
      setTimeout(() => setBounceAvatar(false), BOUNCE_DURATION_MS);
    }, AUTO_OPEN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname]);

  // Typing indicator, then the scripted first message — runs on ANY first
  // open (auto or manual click), not just the auto-popup case, so the
  // experience is consistent either way. Doesn't re-fire on reopen once
  // shown, unless the chat is explicitly cleared.
  useEffect(() => {
    if (!isOpen || messages.length > 0 || hasShownWelcome) return;

    setIsTypingWelcome(true);
    const timer = setTimeout(() => {
      setIsTypingWelcome(false);
      setHasShownWelcome(true);
      setMessages([{ id: "welcome", role: "assistant", parts: [{ type: "text", text: WELCOME_MESSAGE }] }]);
    }, TYPING_BEFORE_WELCOME_MS);

    return () => clearTimeout(timer);
  }, [isOpen, messages.length, hasShownWelcome, setMessages]);

  // Sound preference persists across visits.
  useEffect(() => {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    if (stored !== null) setSoundEnabled(stored === "true");
  }, []);

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      return next;
    });
  }

  // Chime once per completed reply (loading -> ready transition), even if minimized.
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    const justFinished = (previousStatus === "streaming" || previousStatus === "submitted") && status === "ready";
    const lastMessage = messages[messages.length - 1];

    if (justFinished && lastMessage?.role === "assistant" && soundEnabled) {
      playNotificationSound();
    }
  }, [status, messages, soundEnabled]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isOpen]);

  function openChat() {
    setIsOpen(true);
    setShowToast(false);
    setEverOpened(true);
    trackEvent("widget_opened");
  }

  function sendChatMessage(text: string) {
    trackEvent("message_sent", { length: text.length });
    for (const form of formsMentionedIn(text)) {
      trackEvent("form_mentioned", { form });
    }
    sendMessage({ text });
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendChatMessage(text);
  }

  function handlePromptClick(prompt: string) {
    sendChatMessage(prompt);
  }

  function clearChat() {
    setMessages([]);
    clearError();
    setHasShownWelcome(false);
  }

  // Internal admin dashboard isn't a public support surface — skip the widget there.
  // /dashboard has its own dedicated Brain AI assistant now — showing this
  // widget there too would be a confusing duplicate. /login has its own
  // static TaxLaya avatar built into the page design — the floating widget
  // would be a second, redundant TaxLaya on the same screen.
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/dashboard") || pathname === "/login") return null;

  const lastMessage = messages[messages.length - 1];
  const showQuickReplies = lastMessage?.role === "assistant" && !isLoading;

  return (
    <>
      {isOpen && (
        <div
          className="pointer-events-auto fixed bottom-4 right-[5vw] z-50 flex h-[min(70vh,600px)] w-[90vw] flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl shadow-black/50 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100vh-8rem))] sm:w-[min(400px,calc(100vw-2rem))]"
          role="dialog"
          aria-label="TaxLaya chat"
        >
          <ChatHeader
            onClear={clearChat}
            onClose={() => setIsOpen(false)}
            onMinimize={() => setIsOpen(false)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            bounceAvatar={bounceAvatar}
          />

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {(isTypingWelcome || isLoading) && (
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
              {showQuickReplies && (
                <div className="flex flex-wrap gap-2 px-1">
                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => handlePromptClick(reply)}
                      className="rounded-full border border-taxlaya-green/30 bg-gray-800 px-3 py-1.5 text-xs font-medium text-taxlaya-green transition hover:bg-gray-700"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
                  {error.message}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <ChatInput
            input={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
          />

          <div className="border-t border-gray-800 px-3 py-1.5 text-center text-[10px] text-gray-500">
            ⚠️ Di ako CPA ha, best practice lang to. Consult your accountant for legal advice.
            <br />
            <a href="/privacy" className="underline hover:text-gray-300">
              Privacy
            </a>{" "}
            ·{" "}
            <a href="/terms" className="underline hover:text-gray-300">
              Terms
            </a>
          </div>
        </div>
      )}

      {!isOpen && (
        <div className="pointer-events-auto fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
          {showToast && (
            <div className="relative w-64 rounded-2xl rounded-br-sm border border-gray-800 bg-gray-900 p-3 pr-8 text-sm text-gray-100 shadow-xl shadow-black/40">
              <button
                type="button"
                onClick={() => setShowToast(false)}
                aria-label="Dismiss"
                className="absolute right-1.5 top-1.5 rounded-full p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
              >
                <X className="h-3 w-3" />
              </button>
              <button type="button" onClick={openChat} className="text-left">
                Hi! TaxLaya here 👋 Need help with BIR forms?
              </button>
            </div>
          )}

          <div className="relative">
            {/* Pulsing attention ring — only until the user has ever opened the widget. */}
            {!everOpened && (
              <span className="absolute inset-0 animate-ping rounded-full bg-taxlaya-green/40" />
            )}
            <button
              type="button"
              onClick={openChat}
              aria-label="Open TaxLaya chat"
              className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-taxlaya-green/40 bg-gray-900 shadow-[0_0_24px_rgba(0,255,136,0.35)] transition hover:scale-105 hover:shadow-[0_0_32px_rgba(0,255,136,0.5)]"
            >
              <Image
                src="/taxlaya-avatar.png"
                alt="TaxLaya"
                width={64}
                height={64}
                className="h-full w-full rounded-full object-cover"
              />
              <span className="absolute right-0 top-0 h-4 w-4 animate-pulse rounded-full border-2 border-gray-900 bg-taxlaya-green shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
