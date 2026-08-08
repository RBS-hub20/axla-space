"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  FileText,
  FolderOpen,
  Receipt,
  Upload,
  Bot,
  Users,
  BarChart3,
  Settings,
  Shield,
  Briefcase,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureBadge } from "@/components/dashboard/FeatureBadge";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  /** Pulsing FeatureBadge instead of the plain text badge above — used for the Maya/bank/BIR-forms/exports launch, distinct from the older static BETA/NEW pills. */
  pulseNew?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tax Calculator", href: "/dashboard/calculator", icon: Calculator },
  { label: "BIR Forms", href: "/dashboard/forms", icon: FileText, pulseNew: true },
  { label: "BIR Guard", href: "/dashboard/bir-guard", icon: Shield, badge: "BETA" },
  { label: "Business Toolkit", href: "/dashboard/toolkit", icon: Briefcase, badge: "NEW" },
  { label: "GCash Upload", href: "/dashboard/upload", icon: Upload, pulseNew: true },
  { label: "Documents", href: "/dashboard/documents", icon: FolderOpen },
  { label: "Invoices", href: "/dashboard/invoices", icon: Receipt, badge: "NEW" },
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
  isBusinessPlan,
  outstandingInvoices,
}: {
  pathname: string;
  onNavigate?: () => void;
  isBusinessPlan?: boolean;
  outstandingInvoices?: number;
}) {
  const items = isBusinessPlan ? [...NAV_ITEMS, ...BUSINESS_PLAN_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ label, href, icon: Icon, badge, pulseNew }) => {
        const isActive = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
        // Invoices' badge shows the live outstanding count once there is
        // one, instead of the static "NEW" label — same slot, more useful.
        const effectiveBadge = href === "/dashboard/invoices" && outstandingInvoices ? String(outstandingInvoices) : badge;

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
            {pulseNew ? (
              <FeatureBadge className="ml-auto" />
            ) : (
              effectiveBadge && (
                <span className="ml-auto rounded-full bg-[#00FF85]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00FF85]">
                  {effectiveBadge}
                </span>
              )
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);
  const [outstandingInvoices, setOutstandingInvoices] = useState(0);

  useEffect(() => {
    fetch("/api/dashboard/billing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIsBusinessPlan(data?.plan === "business"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/invoices", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const count = (data?.invoices ?? []).filter((inv: { status: string }) => inv.status === "sent").length;
        setOutstandingInvoices(count);
      })
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
              isBusinessPlan={isBusinessPlan}
              outstandingInvoices={outstandingInvoices}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-[#001A29] pt-6 md:flex">
        <NavLinks pathname={pathname} isBusinessPlan={isBusinessPlan} outstandingInvoices={outstandingInvoices} />
      </aside>
    </>
  );
}
