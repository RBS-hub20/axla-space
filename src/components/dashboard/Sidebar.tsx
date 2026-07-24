"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  FileText,
  FolderOpen,
  Upload,
  Bot,
  Users,
  BarChart3,
  Settings,
  Shield,
  ShieldCheck,
  Briefcase,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tax Calculator", href: "/dashboard/calculator", icon: Calculator },
  { label: "BIR Forms", href: "/dashboard/forms", icon: FileText },
  { label: "BIR Guard", href: "/dashboard/bir-guard", icon: Shield, badge: "BETA" },
  { label: "Business Toolkit", href: "/dashboard/toolkit", icon: Briefcase, badge: "NEW" },
  { label: "GCash Upload", href: "/dashboard/upload", icon: Upload },
  { label: "Documents", href: "/dashboard/documents", icon: FolderOpen },
  { label: "Brain AI", href: "/dashboard/brain", icon: Bot },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

const BUSINESS_PLAN_ITEMS: NavItem[] = [
  { label: "Team", href: "/dashboard/team", icon: Users },
  { label: "Annual ITR", href: "/dashboard/annual", icon: BarChart3 },
];

function NavLinks({
  pathname,
  onNavigate,
  isAdmin,
  pendingCount,
  isBusinessPlan,
}: {
  pathname: string;
  onNavigate?: () => void;
  isAdmin?: boolean;
  pendingCount?: number;
  isBusinessPlan?: boolean;
}) {
  const items = isBusinessPlan ? [...NAV_ITEMS, ...BUSINESS_PLAN_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ label, href, icon: Icon, badge }) => {
        const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-[#00FF85]/10 text-[#00FF85]"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
            {label}
            {badge && (
              <span className="ml-auto rounded-full bg-[#00FF85]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00FF85]">
                {badge}
              </span>
            )}
          </Link>
        );
      })}

      {isAdmin && (
        <Link
          href="/admin/waitlist"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname.startsWith("/admin/waitlist")
              ? "bg-[#00FF85]/10 text-[#00FF85]"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
          )}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={pathname.startsWith("/admin/waitlist") ? 2.5 : 2} />
          Admin Waitlist
          {Boolean(pendingCount) && (
            <span className="ml-auto rounded-full bg-[#00FF85] px-2 py-0.5 text-xs font-bold text-[#001A29]">
              {pendingCount}
            </span>
          )}
        </Link>
      )}
    </nav>
  );
}

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/waitlist/list", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.counts?.pending !== undefined) setPendingCount(data.counts.pending);
      })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    fetch("/api/dashboard/billing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIsBusinessPlan(data?.plan === "business"))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-4 top-4 z-40 rounded-lg border border-white/10 bg-[#001A29] p-2 text-slate-300 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative flex h-full w-64 flex-col border-r border-white/10 bg-[#001A29] pt-4">
            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-sm font-bold text-white">
                Tax<span className="text-[#00FF85]">Laya</span>
              </span>
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks
              pathname={pathname}
              onNavigate={() => setIsMobileOpen(false)}
              isAdmin={isAdmin}
              pendingCount={pendingCount}
              isBusinessPlan={isBusinessPlan}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-[#001A29] pt-6 md:flex">
        <NavLinks pathname={pathname} isAdmin={isAdmin} pendingCount={pendingCount} isBusinessPlan={isBusinessPlan} />
      </aside>
    </>
  );
}
