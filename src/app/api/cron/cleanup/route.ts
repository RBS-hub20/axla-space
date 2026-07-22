import { NextResponse } from "next/server";
import { readdir, stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { logError } from "@/lib/log-error";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Precautionary only: this app's GCash upload pipeline (src/app/api/dashboard/
 * transactions/route.ts, src/app/api/gcash/parse/route.ts) never writes
 * uploaded files to disk in the first place — PDFs/CSVs are read via
 * file.arrayBuffer()/file.text() straight into memory and parsed, so there's
 * nothing for this job to actually find in normal operation. It exists as a
 * defensive backstop, not a fix for an observed leak.
 *
 * Also worth knowing: on Vercel, /tmp is local to one serverless function
 * instance and doesn't persist across separate invocations the way disk
 * would on a traditional always-on server — a cron run only ever sees
 * whatever that particular warm instance itself wrote.
 *
 * Runs once daily (03:00 UTC), not hourly — Vercel's Hobby plan only
 * allows daily-or-coarser cron schedules. Fine here since this is a
 * precautionary backstop, not something actually clearing real buildup.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET isn't configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dir = tmpdir();
  let deleted = 0;
  let scanned = 0;

  try {
    const entries = await readdir(dir);
    scanned = entries.length;
    const now = Date.now();

    await Promise.all(
      entries.map(async (name) => {
        const filePath = join(dir, name);
        try {
          const info = await stat(filePath);
          if (info.isFile() && now - info.mtimeMs > ONE_HOUR_MS) {
            await unlink(filePath);
            deleted++;
          }
        } catch {
          // Race (already gone) or a path we can't touch — skip, not fatal.
        }
      }),
    );
  } catch (err) {
    logError("cron/cleanup: readdir failed (non-fatal)", err);
  }

  return NextResponse.json({ scanned, deleted });
}
