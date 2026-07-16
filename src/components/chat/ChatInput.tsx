"use client";

import { type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ input, onInputChange, onSubmit, isLoading }: ChatInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!input.trim() || isLoading) return;
      onSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-800 bg-gray-900 p-4">
      <div className="mx-auto flex max-w-4xl gap-2">
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tanong mo kay TaxLaya... (Shift+Enter for new line)"
          className="max-h-32 min-h-[52px] resize-none border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus:border-taxlaya-green focus:ring-taxlaya-green/30"
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !input.trim()}
          className="h-[52px] w-[52px] flex-shrink-0 bg-taxlaya-green text-gray-950 shadow-[0_0_16px_rgba(0,255,136,0.35)] hover:bg-taxlaya-green/90 hover:shadow-[0_0_24px_rgba(0,255,136,0.5)]"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}
