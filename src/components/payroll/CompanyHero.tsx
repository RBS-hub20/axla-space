"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Pencil } from "lucide-react";
import type { Company } from "@/components/payroll/PayrollAppDashboard";

/**
 * Owner-facing "this is MY company" hero — sits between the top nav and the
 * 50% OFF banner. Every field is real data (company.business_name,
 * company.rdo_code, staff.length, the logged-in user's own name) — no
 * placeholder/fabricated fields like a city or industry column that don't
 * exist in payroll_companies.
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyHero({
  company,
  staffCount,
  ownerFirstName,
  planLabel,
  isFreePlan,
  onEditCompany,
  onLogoUploaded,
  onToast,
}: {
  company: Company | null;
  staffCount: number;
  ownerFirstName: string;
  planLabel: string;
  isFreePlan: boolean;
  onEditCompany: () => void;
  onLogoUploaded: (logoSignedUrl: string | null) => void;
  onToast: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const name = company?.business_name?.trim() || "Your Business";
  const subtitleParts = [`${staffCount} Active Staff`, company?.rdo_code?.trim() || null, "Payroll & Compliance"].filter(
    (p): p is string => Boolean(p),
  );

  async function handleLogoFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/payroll/company/logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || "Logo upload failed.");
        return;
      }
      onLogoUploaded(data.previewUrl ?? null);
      onToast("Logo updated ✅");
    } catch {
      onToast("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#2A4A2A] bg-gradient-to-br from-[#1A1A1A] to-[#0F1F15] p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#8BFF00]/10 blur-[80px]" />

      <div className="relative flex flex-col items-center gap-5 sm:flex-row">
        {/* Logo */}
        <div className="relative shrink-0">
          {company?.logo_signed_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/optimizable asset
            <img
              src={company.logo_signed_url}
              alt={`${name} logo`}
              className="h-16 w-16 rounded-xl border border-[#00FF88]/40 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#8BFF00] text-2xl font-bold text-black">
              {getInitials(name)}
            </div>
          )}
          {company && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Upload company logo"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#0F1F15] bg-[#00FF88] text-black transition hover:bg-[#22C55E] disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoFile(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>

        {/* Company info */}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="truncate text-2xl font-bold text-white">{name}</h1>
          <p className="mt-1 text-sm text-gray-400">{subtitleParts.join(" • ")}</p>
          <p className="mt-1.5 text-sm font-medium text-green-400">Welcome back, {ownerFirstName}! 👋</p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              isFreePlan ? "bg-white/10 text-slate-300" : "bg-[#00FF88]/15 text-[#00FF88]"
            }`}
          >
            {planLabel}
          </span>
          <button
            type="button"
            onClick={onEditCompany}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-[#00FF88]/40 hover:bg-[#00FF88]/10 hover:text-[#00FF88]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Company
          </button>
        </div>
      </div>
    </div>
  );
}
