"use client";

import Image from "next/image";
import { Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  onClear: () => void;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function ChatHeader({ onClear, onClose, soundEnabled, onToggleSound }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 p-3 backdrop-blur sm:rounded-t-2xl">
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <Image
            src="/taxlaya-avatar.png"
            alt="TaxLaya"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border-2 border-taxlaya-green/30 object-cover shadow-[0_0_16px_rgba(0,255,136,0.25)]"
          />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-gray-900 bg-taxlaya-green shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold text-gray-100">TaxLaya</h1>
            <span className="text-xs">🔥</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-taxlaya-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-taxlaya-green" />
            <span>Online 24/7</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSound}
          aria-label={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
          className="h-8 w-8 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          aria-label="Clear chat"
          className="h-8 w-8 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close chat"
          className="h-8 w-8 text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
