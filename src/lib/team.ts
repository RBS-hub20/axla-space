import "server-only";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import {
  ACTIVE_TEAM_OWNER_COOKIE,
  ROLE_LABELS,
  INVITABLE_ROLES,
  isInvitableRole,
  permissionsForRole,
  maskTin,
  OWNER_PERMISSIONS,
  type TeamRole,
  type InvitableRole,
  type TeamPermissions,
} from "@/lib/team-permissions";

export {
  ACTIVE_TEAM_OWNER_COOKIE,
  ROLE_LABELS,
  INVITABLE_ROLES,
  isInvitableRole,
  permissionsForRole,
  maskTin,
  type TeamRole,
  type InvitableRole,
  type TeamPermissions,
};

export interface EffectiveOwner {
  /** The Prisma User.id whose data every query should filter on. */
  ownerId: string;
  /** The owner's email — plan/subscription lookups (getUserPlan, getPayrollPlan) are keyed by email, not id, and a shared viewer's own plan is irrelevant to what they can see. */
  ownerEmail: string;
  role: TeamRole;
  isOwner: boolean;
  permissions: TeamPermissions;
}

function ownAccount(user: User): EffectiveOwner {
  return { ownerId: user.id, ownerEmail: user.email, role: "owner", isOwner: true, permissions: OWNER_PERMISSIONS };
}

/**
 * Resolves which account's data the current request should touch. Reads
 * the active_team_owner_id cookie (set by POST /api/team/switch); if unset,
 * pointing at the caller's own id, or pointing at a membership that no
 * longer validates (revoked/removed/tampered cookie), falls back to the
 * caller's own account rather than erroring — a stale/bogus cookie should
 * never lock someone out of their own dashboard.
 *
 * This is the single choke point every dashboard API route that supports
 * shared access must call instead of using getCurrentUser().id directly —
 * it's what turns team_members from a ledger into an actual permission
 * boundary.
 */
export async function getEffectiveOwner(user: User): Promise<EffectiveOwner> {
  const requestedOwnerId = cookies().get(ACTIVE_TEAM_OWNER_COOKIE)?.value;
  if (!requestedOwnerId || requestedOwnerId === user.id) {
    return ownAccount(user);
  }

  const { data: membership, error } = await supabaseAdmin
    .from("team_members")
    .select("role")
    .eq("owner_user_id", requestedOwnerId)
    .eq("member_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    logError("getEffectiveOwner: team_members lookup failed", error);
    return ownAccount(user);
  }
  if (!membership) {
    return ownAccount(user);
  }

  const { data: ownerProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", requestedOwnerId)
    .maybeSingle();
  if (profileError) {
    logError("getEffectiveOwner: owner profile lookup failed", profileError);
    return ownAccount(user);
  }

  const role = membership.role as TeamRole;
  return {
    ownerId: requestedOwnerId,
    ownerEmail: ownerProfile?.email ?? user.email,
    role,
    isOwner: false,
    permissions: permissionsForRole(role),
  };
}

/** Accounts (besides the caller's own) that the current user has active shared access to — powers the dashboard account switcher. */
export interface TeamMembership {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  role: TeamRole;
}

export async function listMyMemberships(user: User): Promise<TeamMembership[]> {
  const { data: memberships, error } = await supabaseAdmin
    .from("team_members")
    .select("owner_user_id, role")
    .eq("member_user_id", user.id)
    .eq("status", "active");

  if (error) {
    logError("listMyMemberships: query failed", error);
    return [];
  }
  if (!memberships || memberships.length === 0) return [];

  const ownerIds = memberships.map((m) => m.owner_user_id);
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ownerIds);
  if (profilesError) {
    logError("listMyMemberships: owner profile lookup failed", profilesError);
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return memberships.map((m) => {
    const profile = profileById.get(m.owner_user_id);
    return {
      ownerId: m.owner_user_id,
      ownerName: profile?.full_name || profile?.email || "Unknown",
      ownerEmail: profile?.email ?? "",
      role: m.role as TeamRole,
    };
  });
}

export const INVITE_TOKEN_RE = /^[0-9a-f-]{36}$/i;

export type InviteState = "pending" | "expired" | "accepted" | "revoked" | "not_found";

export interface InviteLookup {
  state: InviteState;
  ownerId: string | null;
  ownerName: string;
  role: TeamRole | null;
  invitedEmail: string | null;
}

/** Public lookup (no auth) — used by both the accept page (server component) and GET /api/team/accept. */
export async function getInviteByToken(token: string): Promise<InviteLookup> {
  const notFound: InviteLookup = { state: "not_found", ownerId: null, ownerName: "", role: null, invitedEmail: null };
  if (!INVITE_TOKEN_RE.test(token)) return notFound;

  const { data: invite, error } = await supabaseAdmin
    .from("team_invites")
    .select("owner_user_id, invited_email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logError("getInviteByToken: lookup failed", error);
    return notFound;
  }
  if (!invite) return notFound;

  const { data: ownerProfile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", invite.owner_user_id)
    .maybeSingle();

  const isExpired = invite.status === "pending" && new Date(invite.expires_at) < new Date();
  const state: InviteState = invite.status !== "pending" ? (invite.status as InviteState) : isExpired ? "expired" : "pending";

  return {
    state,
    ownerId: invite.owner_user_id,
    ownerName: ownerProfile?.full_name || ownerProfile?.email || "Someone",
    role: invite.role as TeamRole,
    invitedEmail: invite.invited_email,
  };
}
