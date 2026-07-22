import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#080F14] py-10 text-slate-400">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center text-sm sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Image src="/axla-logo-dark.png" alt="Axla" width={100} height={28} className="h-6 w-auto" />
          <p>
            <span className="font-semibold text-white">Axla.space</span> · Your AI agent for adulting
          </p>
        </div>
        <div className="flex gap-5">
          <a href="/privacy" className="transition hover:text-white">
            Privacy
          </a>
          <a href="/terms" className="transition hover:text-white">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
