import Image from "next/image";
import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080F14]/85 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="#top" className="flex items-center">
          <Image
            src="/axla-logo-dark.png"
            alt="Axla"
            width={140}
            height={40}
            className="h-7 w-auto sm:h-8"
            priority
          />
        </Link>
        <Link
          href="#waitlist"
          className="rounded-full bg-[#00FF88] px-4 py-2 text-sm font-semibold text-[#080F14] transition hover:bg-[#22C55E] sm:px-5"
        >
          Join waitlist
        </Link>
      </nav>
    </header>
  );
}
