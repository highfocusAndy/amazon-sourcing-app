-- Remove defaultProjectedMonthlyUnits from UserPreferences (SQLite: recreate table)
CREATE TABLE "UserPreferences_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "defaultSellerType" TEXT NOT NULL DEFAULT 'FBA',
    "defaultShippingCostFbm" REAL NOT NULL DEFAULT 0,
    "catalogPageSize" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPreferences_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "UserPreferences_new" ("id", "userId", "defaultSellerType", "defaultShippingCostFbm", "catalogPageSize", "updatedAt")
SELECT "id", "userId", "defaultSellerType", "defaultShippingCostFbm", "catalogPageSize", "updatedAt"
FROM "UserPreferences";

DROP TABLE "UserPreferences";

ALTER TABLE "UserPreferences_new" RENAME TO "UserPreferences";

CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");
