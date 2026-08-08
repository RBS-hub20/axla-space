"use client";

import { useState } from "react";
import { LayoutDashboard, Users, Clock, Wallet, FileText, BarChart3, ShieldCheck, Settings as SettingsIcon, Menu, X } from "lucide-react";
import type { Company, Tab } from "@/components/payroll/PayrollAppDashboard";

const MENU_ITEMS: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "staff", label: "Staff", icon: Users },
  { id: "timekeeping", label: "Timekeeping", icon: Clock },
  { id: "run", label: "Payroll Run", icon: Wallet },
  { id: "payslip", label: "Payslip & BIR", icon: FileText },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "compliance", label: "Tax & Compliance", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/** `forceLabels` is true only for the mobile drawer (full width, no collapse) — the persistent desktop/tablet <aside> instead hides labels via `hidden lg:inline` so the icon-only "tablet" state is pure CSS, not a JS breakpoint check. */
function NavItems({
  tab,
  onTabChange,
  tourHighlightTab,
  forceLabels,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  tourHighlightTab: Tab | null;
  forceLabels: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {MENU_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            title={label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              active ? "bg-[#8BFF00] text-black" : "text-gray-400 hover:bg-white/5 hover:text-white"
            } ${tourHighlightTab === id ? "ring-2 ring-[#00FF88] ring-offset-2 ring-offset-[#111111]" : ""} ${
              forceLabels ? "" : "justify-center lg:justify-start"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
            <span className={`truncate ${forceLabels ? "" : "hidden lg:inline"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  company,
  planLabel,
  isFreePlan,
  onUpgrade,
  onTabChange,
  forceLabels,
}: {
  company: Company | null;
  planLabel: string;
  isFreePlan: boolean;
  onUpgrade: () => void;
  onTabChange: (tab: Tab) => void;
  forceLabels: boolean;
}) {
  const labelClass = forceLabels ? "" : "hidden lg:inline";
  return (
    <div className="mt-auto space-y-3 border-t border-[#222] px-3 py-4">
      {company && (
        <div className={`flex items-center gap-2 px-1 ${forceLabels ? "" : "justify-center lg:justify-start"}`}>
          {company.logo_signed_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/optimizable asset
            <img src={company.logo_signed_url} alt="" className="h-7 w-7 shrink-0 rounded-lg border border-[#00FF88]/40 object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#8BFF00] text-[10px] font-bold text-black">
              {company.business_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className={`truncate text-xs font-medium text-slate-300 ${labelClass}`}>{company.business_name}</span>
        </div>
      )}

      {isFreePlan ? (
        <button
          type="button"
          onClick={onUpgrade}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#8BFF00] text-xs font-bold text-black transition hover:bg-[#7AE600] ${
            forceLabels ? "w-full px-3" : "mx-auto w-9 lg:mx-0 lg:w-full lg:px-3"
          }`}
        >
          <span className={labelClass}>Upgrade Pro</span>
          <span className={forceLabels ? "hidden" : "lg:hidden"}>↑</span>
        </button>
      ) : (
        <div
          className={`flex h-9 items-center justify-center rounded-xl bg-[#8BFF00]/15 text-[10px] font-bold uppercase tracking-wide text-[#8BFF00] ${
            forceLabels ? "w-full px-3" : "mx-auto w-9 lg:mx-0 lg:w-full lg:px-3"
          }`}
        >
          <span className={labelClass}>{planLabel}</span>
          <span className={forceLabels ? "hidden" : "lg:hidden"}>{planLabel.slice(0, 1)}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => onTabChange("settings")}
        title="Settings"
        className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-gray-500 transition hover:bg-white/5 hover:text-[#8BFF00] ${
          forceLabels ? "" : "justify-center lg:justify-start"
        }`}
      >
        <SettingsIcon className="h-4 w-4 shrink-0" />
        <span className={labelClass}>Settings</span>
      </button>
    </div>
  );
}

/**
 * Axla-styled left sidebar for the payroll app dashboard, replacing the old
 * horizontal tab bar (see Phase 1's design reference: Remunix's layout —
 * colors/theme are Axla dark+green, not a copy). Three responsive states:
 * desktop (lg+, 260px, icons+labels), tablet (md–lg, 72px, icons only via
 * CSS, no JS breakpoint check), mobile (<md, hidden + hamburger drawer).
 */
export function PayrollSidebar({
  tab,
  onTabChange,
  tourHighlightTab,
  company,
  planLabel,
  isFreePlan,
  onUpgrade,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  tourHighlightTab: Tab | null;
  company: Company | null;
  planLabel: string;
  isFreePlan: boolean;
  onUpgrade: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleMobileTabChange(next: Tab) {
    onTabChange(next);
    setMobileOpen(false);
  }

  return (
    <>
      {/* Mobile hamburger — sits just under the sticky top header */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-[72px] z-40 rounded-lg border border-[#222] bg-[#111111] p-2 text-slate-300 shadow-lg md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative flex h-full w-64 flex-col border-r border-[#222] bg-[#0F0F0F] pt-4">
            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-sm font-bold text-white">
                Axla <span className="text-[#8BFF00]">Payroll</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavItems tab={tab} onTabChange={handleMobileTabChange} tourHighlightTab={tourHighlightTab} forceLabels />
            <SidebarFooter
              company={company}
              planLabel={planLabel}
              isFreePlan={isFreePlan}
              onUpgrade={onUpgrade}
              onTabChange={handleMobileTabChange}
              forceLabels
            />
          </div>
        </div>
      )}

      {/* Desktop / tablet persistent sidebar */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[72px] shrink-0 flex-col border-r border-[#222] bg-[#0F0F0F] pt-4 md:flex lg:w-[260px]">
        <NavItems tab={tab} onTabChange={onTabChange} tourHighlightTab={tourHighlightTab} forceLabels={false} />
        <SidebarFooter
          company={company}
          planLabel={planLabel}
          isFreePlan={isFreePlan}
          onUpgrade={onUpgrade}
          onTabChange={onTabChange}
          forceLabels={false}
        />
      </aside>
    </>
  );
}
