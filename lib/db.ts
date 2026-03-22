import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = new PrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = createPrisma();
