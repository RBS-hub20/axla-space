// Shared enum-ish constants for the business-ready Staff tab — imported by
// both API routes (validation) and UI components (dropdown options), one
// source of truth instead of the same string list drifting in two places.

export const EMPLOYMENT_TYPES = ["Regular", "Part-time", "Probationary", "Contractual"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const RATE_TYPES = ["daily", "hourly", "monthly"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  daily: "/day",
  hourly: "/hr",
  monthly: "/mo",
};

export const STAFF_STATUSES = ["Active", "On Leave", "Inactive"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];
