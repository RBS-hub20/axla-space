"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  onClear: () => void;
}

export function ChatHeader({ onClear }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 p-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Image
            src="/taxlaya-avatar.png"
            alt="TaxLaya"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border-2 border-taxlaya-green/30 object-cover shadow-[0_0_16px_rgba(0,255,136,0.25)]"
          />
          <span className="absolute bottom-0 right-0 h-3 w-3 animate-pulse rounded-full border-2 border-gray-900 bg-taxlaya-green shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-100">TaxLaya</h1>
            <span className="text-xs">🔥</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-taxlaya-green">
            <span className="h-2 w-2 animate-pulse rounded-full bg-taxlaya-green" />
            <span>Online 24/7 • AI SUPPORT</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/waitlist"
          className="hidden text-xs font-medium text-gray-500 transition hover:text-taxlaya-green sm:block"
        >
          Waitlist
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          aria-label="Clear chat"
          className="text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
