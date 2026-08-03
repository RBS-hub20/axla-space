"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { permissionsForRole, type TeamPermissions, type TeamRole } from "@/lib/team-permissions";

export interface TeamMembershipOption {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  role: TeamRole;
}

interface TeamContextValue {
  /** Accounts (besides your own) you can switch into. */
  memberships: TeamMembershipOption[];
  /** The account currently being viewed — your own if isOwner is true. */
  activeOwnerId: string | null;
  isOwner: boolean;
  role: TeamRole;
  permissions: TeamPermissions;
  isLoading: boolean;
  /** Switches which account's data the dashboard reads/writes, then reloads server data. Pass null to switch back to your own account. */
  switchAccount: (ownerId: string | null) => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [memberships, setMemberships] = useState<TeamMembershipOption[]>([]);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const [role, setRole] = useState<TeamRole>("owner");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team/memberships", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMemberships(data.memberships ?? []);
      setActiveOwnerId(data.active?.ownerId ?? null);
      setIsOwner(data.active?.isOwner ?? true);
      setRole((data.active?.role as TeamRole) ?? "owner");
    } catch {
      // Fails safe to "owner, no memberships" — the default state already set.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchAccount = useCallback(
    async (ownerId: string | null) => {
      const res = await fetch("/api/team/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      if (!res.ok) return;
      await load();
      router.push("/dashboard");
      router.refresh();
    },
    [load, router],
  );

  return (
    <TeamContext.Provider
      value={{ memberships, activeOwnerId, isOwner, role, permissions: permissionsForRole(role), isLoading, switchAccount }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeamRole(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error("useTeamRole must be used within a TeamProvider");
  }
  return ctx;
}
