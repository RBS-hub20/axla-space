"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  onClear: () => void;
}

export function ChatHeader({ onClear }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Image
            src="/taxlaya-avatar.png"
            alt="TaxLaya"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border-2 border-green-500/30 object-cover"
          />
          <span className="absolute bottom-0 right-0 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-green-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">TaxLaya</h1>
            <span className="text-xs">🔥</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span>Online 24/7 • AI SUPPORT</span>
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onClear} aria-label="Clear chat">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
