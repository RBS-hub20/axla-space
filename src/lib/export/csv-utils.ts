/** Shared CSV row-encoding for the export/*.ts generators — quotes any field containing a comma, quote, or newline, doubling embedded quotes per RFC 4180. */
export function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
