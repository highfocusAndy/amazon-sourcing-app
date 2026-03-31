-- CreateTable
CREATE TABLE "UserMonthlyUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserMonthlyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyUsage_userId_periodKey_metric_key" ON "UserMonthlyUsage"("userId", "periodKey", "metric");

-- CreateIndex
CREATE INDEX "UserMonthlyUsage_userId_periodKey_idx" ON "UserMonthlyUsage"("userId", "periodKey");
