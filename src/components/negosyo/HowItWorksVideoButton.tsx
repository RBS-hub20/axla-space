"use client";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const YOUTUBE_EMBED_ID = "V5hq4WBRpto";

/** The hero's "Paano gumagana?" button — opens the demo video in a modal instead of scrolling to the how-it-works section. */
export function HowItWorksVideoButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full rounded-full border border-white/15 px-7 py-3.5 text-center text-base font-medium text-white transition hover:bg-white/5 sm:w-auto"
        >
          Paano gumagana?
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-[#00FF88]/20 bg-[#0B0F1A] p-2 sm:p-3">
        <div className="aspect-video overflow-hidden rounded-xl">
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_EMBED_ID}?autoplay=1`}
            className="h-full w-full"
            title="Negosyo Tracker demo"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
