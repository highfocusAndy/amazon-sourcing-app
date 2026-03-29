import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/** True when this PrismaClient matches the current schema (e.g. ApiResponseCache after migrate). */
function prismaClientIsCurrent(client: PrismaClient): boolean {
  return typeof (client as unknown as { apiResponseCache?: { findUnique?: unknown } }).apiResponseCache?.findUnique === "function";
}

function createPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && prismaClientIsCurrent(existing)) {
    return existing;
  }
  if (existing) {
    void existing.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
  }
  const client = new PrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = createPrisma();
