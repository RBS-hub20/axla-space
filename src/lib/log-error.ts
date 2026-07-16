/**
 * Logs a single-line, greppable summary first (name/message/Prisma error
 * code all fit on one line so they survive truncated log-list views like
 * Vercel's "Logs" tab), then the full error object for whoever opens the
 * detail view.
 */
export function logError(label: string, err: unknown) {
  const e = err as { name?: string; message?: string; code?: string };
  console.error(
    `${label} :: name=${e?.name ?? "?"} code=${e?.code ?? "?"} message=${e?.message ?? String(err)}`,
  );
  console.error(err);
}
