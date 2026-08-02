// Deliberately NOT "server-only" — nothing here touches the DB or secrets,
// just string/math generation, so it stays importable from client code too
// (e.g. a future client-side preview) without pulling in server-only guards.

import { randomBytes } from "crypto";

// Excludes visually-ambiguous characters (0/O, 1/I/l) — this token gets
// hand-typed occasionally (e.g. a staff member re-entering a mistyped
// link), unlike a UUID that's always copy-pasted.
const TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/** 8 random characters from a 54-symbol alphabet — ~46 bits of entropy, not sequential/guessable, short enough to read off a shared link. */
export function generateClockToken(): string {
  const bytes = randomBytes(8);
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return token;
}
