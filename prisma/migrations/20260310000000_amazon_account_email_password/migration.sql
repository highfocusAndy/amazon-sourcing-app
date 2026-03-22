-- AlterTable: Replace AmazonAccount with email/password only (no API credentials).
-- SQLite: drop and recreate table.

DROP TABLE IF EXISTS "AmazonAccount";

CREATE TABLE "AmazonAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amazonEmail" TEXT NOT NULL,
    "amazonPasswordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmazonAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AmazonAccount_userId_key" ON "AmazonAccount"("userId");
