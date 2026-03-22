-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "defaultSellerType" TEXT NOT NULL DEFAULT 'FBA',
    "defaultProjectedMonthlyUnits" INTEGER NOT NULL DEFAULT 1,
    "defaultShippingCostFbm" REAL NOT NULL DEFAULT 0,
    "catalogPageSize" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");
