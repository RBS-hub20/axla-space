"use client";

import { useRouter } from "next/navigation";
import { Lock, Check } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type UpgradeWallType = "filing" | "scan" | "ai_chat" | "business" | "team" | "transactions";

interface UpgradeWallModalProps {
  open: boolean;
  onClose: () => void;
  type: UpgradeWallType | null;
  message: string | null;
  /** Which plan actually resolves this limit — "business" limits (multi-business, team invites) need the ₱1,499 plan, not Pro. */
  requiredPlan?: "pro" | "business";
}

const PRO_FEATURES = [
  "Unlimited Filings",
  "Unlimited Receipt Scans",
  "Unlimited TaxLaya AI",
  "Auto eBIR Fill",
  "Tax Forecast",
  "Priority Support",
  "No BIR penalties",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "Up to 5 TINs/Branches",
  "Up to 5 team members",
  "Client Management Portal",
  "BIR 2307 / Alphalist",
  "Custom Reports",
];

export function UpgradeWallModal({ open, onClose, type, message, requiredPlan = "pro" }: UpgradeWallModalProps) {
  const router = useRouter();
  const isBusiness = requiredPlan === "business";

  function handleUpgrade() {
    onClose();
    router.push("/dashboard/settings");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm border border-white/10 bg-[#0B0F14] p-0 text-center shadow-2xl shadow-black/60">
        <div className="px-8 pb-8 pt-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Lock className="h-5 w-5 text-white" />
          </div>

          {message && <p className="mx-auto mt-4 max-w-[15rem] text-sm leading-relaxed text-slate-400">{message}</p>}

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
            Upgrade to {isBusiness ? "Business" : "Pro"}
          </h2>

          <p className="mt-1 text-3xl font-extrabold text-white">
            ₱{isBusiness ? "1,499" : "499"}
            <span className="text-base font-medium text-slate-500">/mo</span>
          </p>

          <ul className="mx-auto mt-6 max-w-[15rem] space-y-2.5 text-left">
            {(isBusiness ? BUSINESS_FEATURES : PRO_FEATURES).map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-300">
                <Check className="h-4 w-4 shrink-0 text-[#00FF85]" strokeWidth={2.5} />
                {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleUpgrade}
            className="mt-7 w-full rounded-lg bg-white py-3 text-sm font-semibold text-[#0B0F14] transition hover:bg-slate-200 active:scale-[0.98]"
          >
            Upgrade now
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-xs text-slate-500 transition hover:text-slate-300 hover:underline hover:underline-offset-2"
          >
            Maybe later
          </button>

          <p className="mt-6 text-[11px] text-slate-600">
            1,200+ freelancers naka-Pro na &middot; Mas mura pa sa BIR penalty na ₱1,000
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
