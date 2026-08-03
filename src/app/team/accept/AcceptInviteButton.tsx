"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface AcceptInviteButtonProps {
  token: string;
  roleLabel: string;
}

export function AcceptInviteButton({ token, roleLabel }: AcceptInviteButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Failed to accept invite.");
        return;
      }

      // Land the new member straight into the shared account they just joined, not their own empty dashboard.
      await fetch("/api/team/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: data.ownerId }),
      });

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleAccept}
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-4 py-3 text-sm font-bold text-[#001A29] shadow-lg shadow-[#00FF88]/20 transition hover:bg-[#1ee87f] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isLoading ? "Accepting..." : `Accept invitation as ${roleLabel}`}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
