-- Replace UserExplorerFilters: remove showBrand, showSellerCount; add showPriceRange (SQLite: recreate table)

CREATE TABLE "UserExplorerFilters_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showKeyword" INTEGER NOT NULL DEFAULT 1,
    "showSort" INTEGER NOT NULL DEFAULT 1,
    "showBsr" INTEGER NOT NULL DEFAULT 1,
    "showMinRoi" INTEGER NOT NULL DEFAULT 0,
    "showMinProfit" INTEGER NOT NULL DEFAULT 0,
    "showFbaFbm" INTEGER NOT NULL DEFAULT 0,
    "showRestriction" INTEGER NOT NULL DEFAULT 0,
    "showPriceRange" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExplorerFilters_new_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "UserExplorerFilters_new" ("id", "userId", "showKeyword", "showSort", "showBsr", "showMinRoi", "showMinProfit", "showFbaFbm", "showRestriction", "showPriceRange", "updatedAt")
SELECT "id", "userId", "showKeyword", "showSort", "showBsr", "showMinRoi", "showMinProfit", "showFbaFbm", "showRestriction", 0, "updatedAt"
FROM "UserExplorerFilters";

DROP TABLE "UserExplorerFilters";

ALTER TABLE "UserExplorerFilters_new" RENAME TO "UserExplorerFilters";

CREATE UNIQUE INDEX "UserExplorerFilters_userId_key" ON "UserExplorerFilters"("userId");
