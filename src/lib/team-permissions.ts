// Deliberately NOT "server-only" — pure types/constants, no DB or cookies
// access, so both server code (src/lib/team.ts) and client code (the
// TeamContext provider) can import role/permission data without pulling in
// server-only guards. Same split as session-cookie.ts vs session.ts.

export const ACTIVE_TEAM_OWNER_COOKIE = "active_team_owner_id";

export type TeamRole = "owner" | "accountant" | "team_leader" | "va" | "admin";

/** Roles a person can be invited as — "owner" is never assigned, only ever the account holder themselves. */
export const INVITABLE_ROLES = ["accountant", "team_leader", "va", "admin"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  accountant: "Accountant",
  team_leader: "Team Leader",
  va: "VA",
  admin: "Admin",
};

export interface TeamPermissions {
  canViewFilings: boolean;
  canEditFilings: boolean;
  canViewBirForms: boolean;
  canEditBirForms: boolean;
  canExport: boolean;
  canViewPayroll: boolean;
  canEditPayroll: boolean;
  canApproveTimekeeping: boolean;
  canRunPayroll: boolean;
  canManageTeam: boolean;
  canViewBilling: boolean;
  canDeleteShop: boolean;
}

export const OWNER_PERMISSIONS: TeamPermissions = {
  canViewFilings: true,
  canEditFilings: true,
  canViewBirForms: true,
  canEditBirForms: true,
  canExport: true,
  canViewPayroll: true,
  canEditPayroll: true,
  canApproveTimekeeping: true,
  canRunPayroll: true,
  canManageTeam: true,
  canViewBilling: true,
  canDeleteShop: true,
};

/**
 * Per-role grants for everyone who isn't the account owner. Deliberately
 * conservative: canManageTeam/canViewBilling/canDeleteShop are false for
 * every invited role, including 'admin' — a trusted deputy still can't
 * invite/remove teammates, see billing, or delete the shop, so an
 * accountant account can never escalate itself to owner-equivalent access
 * by being re-invited at a higher role. Only the real owner (the switcher
 * pointing at yourself, or nothing invited/accepted yet) gets
 * OWNER_PERMISSIONS.
 */
const ROLE_PERMISSIONS: Record<Exclude<TeamRole, "owner">, TeamPermissions> = {
  admin: {
    ...OWNER_PERMISSIONS,
    canManageTeam: false,
    canViewBilling: false,
    canDeleteShop: false,
  },
  team_leader: {
    canViewFilings: true,
    canEditFilings: true,
    canViewBirForms: true,
    canEditBirForms: true,
    canExport: true,
    canViewPayroll: true,
    canEditPayroll: true,
    canApproveTimekeeping: true,
    canRunPayroll: true,
    canManageTeam: false,
    canViewBilling: false,
    canDeleteShop: false,
  },
  accountant: {
    canViewFilings: true,
    canEditFilings: true,
    canViewBirForms: true,
    canEditBirForms: true,
    canExport: true,
    canViewPayroll: true,
    canEditPayroll: true,
    canApproveTimekeeping: false,
    canRunPayroll: false,
    canManageTeam: false,
    canViewBilling: false,
    canDeleteShop: false,
  },
  va: {
    canViewFilings: true,
    canEditFilings: false,
    canViewBirForms: true,
    canEditBirForms: false,
    canExport: false,
    canViewPayroll: true,
    canEditPayroll: false,
    canApproveTimekeeping: false,
    canRunPayroll: false,
    canManageTeam: false,
    canViewBilling: false,
    canDeleteShop: false,
  },
};

export function permissionsForRole(role: TeamRole): TeamPermissions {
  return role === "owner" ? OWNER_PERMISSIONS : ROLE_PERMISSIONS[role];
}
