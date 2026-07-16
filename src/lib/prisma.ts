import "server-only";
import { PrismaClient } from "@prisma/client";

// Next.js dev hot-reload re-executes this module on every edit; stashing
// the client on globalThis keeps one connection pool alive across reloads
// instead of leaking a new one each time. Standard Prisma+Next.js pattern.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
