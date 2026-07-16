"use client";

import { useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  message: UIMessage;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const text = messageText(message);

  function copyToClipboard() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <Image
          src="/taxlaya-avatar.png"
          alt="TaxLaya"
          width={40}
          height={40}
          className="h-10 w-10 flex-shrink-0 rounded-full border-2 border-green-500/20 object-cover"
        />
      )}

      <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
        {!isUser && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold">TaxLaya</span>
            <span className="text-xs">🔥 Freedom from BIR hassle</span>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm",
            isUser ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" : "bg-muted",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{text}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && text && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={copyToClipboard}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
    </div>
  );
}
