// Shared between the client RDO Transfer tab (checkbox list) and the
// server-side PDF generator (labels the checked items on the letter page)
// — same list, single source of truth.
export const RDO_CHECKLIST_ITEMS = [
  { id: "form_1905", label: "Accomplished BIR Form 1905" },
  { id: "valid_id", label: "Valid government-issued ID" },
  { id: "cor", label: "Original COR (Certificate of Registration / Form 2303)" },
  { id: "books", label: "Registered Books of Accounts" },
  { id: "unused_receipts", label: "Unused Official Receipts/Invoices (for cancellation)" },
  { id: "sec_cert", label: "Board Resolution / Secretary's Certificate (corporations only)" },
  { id: "transfer_letter", label: "Application letter addressed to the new RDO" },
] as const;
