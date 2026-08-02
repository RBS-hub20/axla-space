import Image from "next/image";
import Link from "next/link";
import { isPromoActive } from "@/lib/promo";

interface NavbarProps {
  /** Overrides the Login link's target — used by /payroll so a login there returns to /payroll/app instead of the default /dashboard. Every other caller is unaffected (defaults to plain "/login"). */
  loginHref?: string;
  /** Overrides the right-hand CTA's target — used by /payroll to scroll to its own pricing section instead of the homepage waitlist anchor. */
  ctaHref?: string;
}

export function Navbar({ loginHref = "/login", ctaHref = "/#waitlist" }: NavbarProps = {}) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080F14]/85 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/#top" className="flex items-center">
          <Image
            src="/axla-logo-dark.png"
            alt="Axla"
            width={140}
            height={40}
            className="h-7 w-auto sm:h-8"
            priority
          />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={loginHref}
            className="rounded-full px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white sm:px-4"
          >
            Login
          </Link>
          {/* Default target is still the real waitlist anchor — there's no
              live self-serve signup yet on most pages, so this can't point
              anywhere else without being a dead end for anyone not already
              waitlist-approved. Homepage-absolute ("/#waitlist", not
              "#waitlist") since Navbar also renders on /pricing and /about,
              which have no #waitlist section of their own — a bare
              "#waitlist" there would just silently do nothing. /payroll
              overrides this to "#pricing" (its own section, same page). */}
          <Link
            href={ctaHref}
            className="rounded-full bg-[#00FF88] px-4 py-2 text-sm font-semibold text-[#080F14] transition hover:bg-[#22C55E] sm:px-5"
          >
            {isPromoActive() ? "Claim 50% OFF" : "Join waitlist"}
          </Link>
        </div>
      </nav>
    </header>
  );
}
