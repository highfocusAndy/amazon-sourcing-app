/*
  Warnings:

  - You are about to alter the column `showBsr` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showFbaFbm` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showKeyword` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showMinProfit` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showMinRoi` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showPriceRange` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showRestriction` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `showSort` on the `UserExplorerFilters` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserExplorerFilters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showKeyword" BOOLEAN NOT NULL DEFAULT true,
    "showSort" BOOLEAN NOT NULL DEFAULT true,
    "showBsr" BOOLEAN NOT NULL DEFAULT true,
    "showMinRoi" BOOLEAN NOT NULL DEFAULT false,
    "showMinProfit" BOOLEAN NOT NULL DEFAULT false,
    "showFbaFbm" BOOLEAN NOT NULL DEFAULT false,
    "showRestriction" BOOLEAN NOT NULL DEFAULT false,
    "showPriceRange" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserExplorerFilters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserExplorerFilters" ("id", "showBsr", "showFbaFbm", "showKeyword", "showMinProfit", "showMinRoi", "showPriceRange", "showRestriction", "showSort", "updatedAt", "userId") SELECT "id", "showBsr", "showFbaFbm", "showKeyword", "showMinProfit", "showMinRoi", "showPriceRange", "showRestriction", "showSort", "updatedAt", "userId" FROM "UserExplorerFilters";
DROP TABLE "UserExplorerFilters";
ALTER TABLE "new_UserExplorerFilters" RENAME TO "UserExplorerFilters";
CREATE UNIQUE INDEX "UserExplorerFilters_userId_key" ON "UserExplorerFilters"("userId");
CREATE TABLE "new_UserPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "defaultSellerType" TEXT NOT NULL DEFAULT 'FBA',
    "defaultShippingCostFbm" REAL NOT NULL DEFAULT 0,
    "catalogPageSize" INTEGER NOT NULL DEFAULT 20,
    "marketplaceId" TEXT,
    "competitionLowMaxOffers" INTEGER NOT NULL DEFAULT 3,
    "competitionModerateMaxOffers" INTEGER NOT NULL DEFAULT 8,
    "competitionSaturatedMinOffers" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserPreferences" ("catalogPageSize", "defaultSellerType", "defaultShippingCostFbm", "id", "marketplaceId", "updatedAt", "userId") SELECT "catalogPageSize", "defaultSellerType", "defaultShippingCostFbm", "id", "marketplaceId", "updatedAt", "userId" FROM "UserPreferences";
DROP TABLE "UserPreferences";
ALTER TABLE "new_UserPreferences" RENAME TO "UserPreferences";
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
