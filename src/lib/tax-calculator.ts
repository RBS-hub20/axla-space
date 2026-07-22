import "server-only";

export type TaxType = "8%" | "3%" | "itemized";

export interface TaxCalculationInput {
  income: number;
  expenses: number;
  taxType: TaxType;
  quarter: 1 | 2 | 3 | 4;
  year: number;
}

export interface TaxCalculationResult {
  taxDue: number;
  baseTax: number;
  surcharge: number;
  interest: number;
  isLate: boolean;
  dueDate: string; // ISO date
  breakdown: string[];
}

// TRAIN law graduated brackets (annual taxable income), in effect since 2023.
// Source: BIR / NIRC as amended by RA 10963 — verify against bir.gov.ph before
// relying on this for an actual filing; tax law can change.
const GRADUATED_BRACKETS = [
  { upTo: 250_000, base: 0, rate: 0, excessOver: 0 },
  { upTo: 400_000, base: 0, rate: 0.15, excessOver: 250_000 },
  { upTo: 800_000, base: 22_500, rate: 0.2, excessOver: 400_000 },
  { upTo: 2_000_000, base: 102_500, rate: 0.25, excessOver: 800_000 },
  { upTo: 8_000_000, base: 402_500, rate: 0.3, excessOver: 2_000_000 },
  { upTo: Infinity, base: 2_202_500, rate: 0.35, excessOver: 8_000_000 },
];

/** Annual graduated income tax on taxable income, per the TRAIN law table. */
export function computeGraduatedAnnualTax(annualTaxableIncome: number): number {
  const taxable = Math.max(0, annualTaxableIncome);
  const bracket = GRADUATED_BRACKETS.find((b) => taxable <= b.upTo)!;
  return bracket.base + (taxable - bracket.excessOver) * bracket.rate;
}

const QUARTERLY_8PCT_EXEMPTION = 250_000 / 4; // 62,500 — the ₱250k annual exemption, prorated per quarter

/**
 * Quarterly tax due for the three self-employed/professional tax types.
 * NOTE: this is a simplified PER-QUARTER estimate — it treats each quarter
 * independently rather than the cumulative year-to-date computation BIR
 * actually uses (where later quarters credit tax already paid in earlier
 * ones). Good enough for a quick estimate; not a substitute for your
 * accountant's actual cumulative computation, especially from Q2 onward.
 */
function computeBaseTax(input: Pick<TaxCalculationInput, "income" | "expenses" | "taxType">): {
  taxDue: number;
  breakdown: string[];
} {
  const { income, expenses, taxType } = input;

  if (taxType === "8%") {
    const taxableBase = Math.max(0, income - QUARTERLY_8PCT_EXEMPTION);
    const taxDue = taxableBase * 0.08;
    return {
      taxDue,
      breakdown: [
        `Gross income: ₱${income.toLocaleString()}`,
        `Less: ₱${QUARTERLY_8PCT_EXEMPTION.toLocaleString()} quarterly exemption (₱250,000/year ÷ 4)`,
        `Taxable base: ₱${taxableBase.toLocaleString()}`,
        `Tax due (8%): ₱${taxDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      ],
    };
  }

  if (taxType === "3%") {
    const taxDue = income * 0.03;
    return {
      taxDue,
      breakdown: [
        `Gross receipts: ₱${income.toLocaleString()}`,
        `Percentage tax (3%, no deductions): ₱${taxDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      ],
    };
  }

  // itemized / graduated
  const netIncome = Math.max(0, income - expenses);
  const annualizedNet = netIncome * 4;
  const annualTax = computeGraduatedAnnualTax(annualizedNet);
  const taxDue = annualTax / 4;
  return {
    taxDue,
    breakdown: [
      `Gross income: ₱${income.toLocaleString()}`,
      `Less expenses: ₱${expenses.toLocaleString()}`,
      `Net taxable income (this quarter): ₱${netIncome.toLocaleString()}`,
      `Annualized (×4) for bracket lookup: ₱${annualizedNet.toLocaleString()}`,
      `Graduated tax on annualized amount: ₱${annualTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      `Quarterly share (÷4): ₱${taxDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    ],
  };
}

/** BIR filing deadline for a given quarterly form. */
export function getQuarterDeadline(formType: "2551Q" | "1701Q", quarter: 1 | 2 | 3 | 4, year: number): Date {
  if (formType === "2551Q") {
    // 25 days after quarter end.
    const deadlines: Record<number, [number, number]> = {
      1: [3, 25], // Apr 25
      2: [6, 25], // Jul 25
      3: [9, 25], // Oct 25
      4: [0, 25], // Jan 25 next year
    };
    const [month, day] = deadlines[quarter];
    return new Date(Date.UTC(quarter === 4 ? year + 1 : year, month, day));
  }

  // 1701Q — 15th of the 2nd month after quarter end (Q4 uses the annual
  // 1701 instead, due Apr 15 next year — not covered by this quarterly form).
  const deadlines: Record<number, [number, number]> = {
    1: [4, 15], // May 15
    2: [7, 15], // Aug 15
    3: [10, 15], // Nov 15
    4: [3, 15], // Apr 15 next year (annual 1701, shown here for reference)
  };
  const [month, day] = deadlines[quarter];
  return new Date(Date.UTC(quarter === 4 ? year + 1 : year, month, day));
}

/**
 * 25% surcharge + 12% annual interest (prorated by days late), per NIRC
 * Sec. 248-249 as amended — the standard penalty for late payment/filing
 * assuming no fraud (fraud is 50%, not modeled here).
 */
function computeSurchargeInterest(taxDue: number, dueDate: Date, asOf: Date): { surcharge: number; interest: number; isLate: boolean } {
  const daysLate = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLate <= 0) {
    return { surcharge: 0, interest: 0, isLate: false };
  }

  const surcharge = taxDue * 0.25;
  const interest = taxDue * 0.12 * (daysLate / 365);
  return { surcharge, interest, isLate: true };
}

export function calculateTax(input: TaxCalculationInput, asOf: Date = new Date()): TaxCalculationResult {
  const { taxDue: baseTax, breakdown } = computeBaseTax(input);

  const formType = input.taxType === "3%" ? "2551Q" : "1701Q";
  const dueDate = getQuarterDeadline(formType, input.quarter, input.year);
  const { surcharge, interest, isLate } = computeSurchargeInterest(baseTax, dueDate, asOf);

  return {
    taxDue: baseTax + surcharge + interest,
    baseTax,
    surcharge,
    interest,
    isLate,
    dueDate: dueDate.toISOString(),
    breakdown,
  };
}
