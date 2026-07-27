// No "server-only" guard here deliberately — this is plain category
// metadata (labels/taglines/template names, no secrets), and the create
// page's client component needs it too for the category dropdown.

export type TemplateType = "base" | "airbnb" | "barbershop" | "carwash" | "pandesal" | "rental";

export interface CategoryDef {
  /** Value used by the frontend dropdown — kept stable, never renamed once shipped. */
  key: string;
  /** Uppercase label used in "NEGOSYO TRACKER PH — {label}" on every sheet. */
  label: string;
  /** Tagline shown on row 2 of every sheet, gold italic bold. Verified against the
   * real reference file where one exists (Airbnb/Barbershop/CarWash/Pandesal/Rental/
   * Sari-Sari) — several differ from earlier draft copy, the verified version wins.
   * The 10 categories with no reference file use the best available (task-provided) copy. */
  tagline: string;
  template: TemplateType;
}

/**
 * 16 categories total: 11 share the "base" template (reverse-engineered from
 * SariSari_Store_System.xlsx, 10 sheets) and 5 have their own bespoke
 * template (reverse-engineered from the 5 attached NegosyoTracker_*.xlsx
 * premium samples). Sheet lists per template live in templates/*.ts next to
 * each template's generator, not here — this file is category metadata only.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    key: "Sari-Sari Store",
    label: "SARI-SARI STORE",
    tagline: "Sari-Sari Store System  •  Track. Analyze. Grow.",
    template: "base",
  },
  {
    key: "Online Seller",
    label: "ONLINE SELLER",
    tagline: "Track Every Order. Monitor Every Stock. Grow Every Follower.",
    template: "base",
  },
  {
    key: "Food Cart",
    label: "FOOD CART",
    tagline: "Track Every Serve. Monitor Every Puhunan. Grow Every Branch.",
    template: "base",
  },
  {
    key: "Milktea/Coffee",
    label: "MILKTEA/COFFEE",
    tagline: "Track Every Cup. Reward Every Barista. Grow Every Branch.",
    template: "base",
  },
  {
    key: "Ukay/RTW",
    label: "UKAY/RTW",
    tagline: "Track Every Piece. Monitor Every Style. Grow Every Collection.",
    template: "base",
  },
  {
    key: "Bigas/Egg",
    label: "BIGAS/EGG",
    tagline: "Track Every Kilo. Monitor Every Delivery. Grow Every Suki.",
    template: "base",
  },
  {
    key: "Carinderia",
    label: "CARINDERIA",
    tagline: "Track Every Luto. Monitor Every Sahog. Grow Every Suki.",
    template: "base",
  },
  {
    key: "Bake Shop",
    label: "BAKE SHOP",
    tagline: "Track Every Bake. Monitor Every Recipe. Grow Every Suki.",
    template: "base",
  },
  {
    key: "GCash/Loading",
    label: "GCASH/LOADING",
    tagline: "Track Every Transaction. Monitor Every Fee. Grow Every Day.",
    template: "base",
  },
  {
    key: "Beauty Services",
    label: "BEAUTY SERVICES",
    tagline: "Track Every Client. Reward Every Artist. Grow Every Branch.",
    template: "base",
  },
  {
    key: "Other",
    label: "OTHER",
    tagline: "Track Every Sale. Manage Every Peso. Maximize Every Profit.",
    template: "base",
  },
  {
    key: "Pandesal",
    label: "PANDESAL ROLLING",
    tagline: "Track Every Tray. Account Every Piece. Grow Every Route.",
    template: "pandesal",
  },
  {
    key: "Airbnb",
    label: "AIRBNB",
    tagline: "Track Every Booking. Manage Every Property. Maximize Every Stay.",
    template: "airbnb",
  },
  {
    key: "Car Wash",
    label: "CAR WASH",
    tagline: "Track Every Vehicle. Monitor Every Peso. Grow Every Day.",
    template: "carwash",
  },
  {
    key: "Barbershop",
    label: "BARBERSHOP",
    tagline: "Track Every Cut. Reward Every Barber. Grow Every Branch.",
    template: "barbershop",
  },
  {
    key: "Rental",
    label: "RENTAL & LANDLORD MANAGER",
    tagline: "Never Miss Rent. Never Miss a Renewal. Less Paperwork, More Profit.",
    template: "rental",
  },
];

export function getCategory(key: string): CategoryDef {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
}

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
