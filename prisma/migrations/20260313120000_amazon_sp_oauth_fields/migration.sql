-- Redefine AmazonAccount: optional email/password, add OAuth token fields (SQLite).
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AmazonAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amazonEmail" TEXT,
    "amazonPasswordHash" TEXT,
    "spRefreshTokenEnc" TEXT,
    "sellerId" TEXT,
    "oauthMarketplaceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmazonAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AmazonAccount" ("id", "userId", "amazonEmail", "amazonPasswordHash", "createdAt", "updatedAt")
SELECT "id", "userId", "amazonEmail", "amazonPasswordHash", "createdAt", "updatedAt" FROM "AmazonAccount";
DROP TABLE "AmazonAccount";
ALTER TABLE "new_AmazonAccount" RENAME TO "AmazonAccount";
CREATE UNIQUE INDEX "AmazonAccount_userId_key" ON "AmazonAccount"("userId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
