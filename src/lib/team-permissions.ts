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
  /** Business profile identity fields (name, TIN, address, RDO, tax type) and the My Businesses list — distinct from canEditFilings, which covers tax calculations/receipts/transactions. Owner + admin only. */
  canEditSettings: boolean;
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
  canEditSettings: true,
};

/**
 * Per-role grants for everyone who isn't the account owner.
 *
 * 'admin' is a trusted deputy with every operational permission the owner
 * has (settings, businesses, billing visibility, deleting a business)
 * EXCEPT canManageTeam — inviting/removing teammates stays strictly
 * owner-only, so an admin can never grant themselves (or anyone else)
 * owner-equivalent account access. Every other invited role
 * (accountant/team_leader/va) is scoped much narrower and never touches
 * settings/billing/business management at all.
 */
const ROLE_PERMISSIONS: Record<Exclude<TeamRole, "owner">, TeamPermissions> = {
  admin: {
    ...OWNER_PERMISSIONS,
    canManageTeam: false,
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
    canEditSettings: false,
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
    canEditSettings: false,
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
    canEditSettings: false,
  },
};

export function permissionsForRole(role: TeamRole): TeamPermissions {
  return role === "owner" ? OWNER_PERMISSIONS : ROLE_PERMISSIONS[role];
}

/**
 * Masks all but the first 3 and last 3 digits of a TIN, preserving
 * whatever separators (dashes/spaces) the value already has — used
 * whenever a profile/business record is returned to a viewer without
 * canEditSettings, so the raw TIN never actually leaves the server for a
 * shared accountant/VA/team_leader session in the first place (not just
 * hidden in the UI, which devtools/network tab would still expose).
 */
export function maskTin(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  if (digits.length <= 6) return tin.replace(/\d/g, "*");
  let seen = 0;
  return tin.replace(/\d/g, () => {
    const i = seen++;
    return i < 3 || i >= digits.length - 3 ? digits[i] : "*";
  });
}
