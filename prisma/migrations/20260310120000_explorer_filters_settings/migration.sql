-- CreateTable
CREATE TABLE "UserExplorerFilters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showKeyword" INTEGER NOT NULL DEFAULT 1,
    "showSort" INTEGER NOT NULL DEFAULT 1,
    "showBsr" INTEGER NOT NULL DEFAULT 1,
    "showBrand" INTEGER NOT NULL DEFAULT 0,
    "showMinRoi" INTEGER NOT NULL DEFAULT 0,
    "showMinProfit" INTEGER NOT NULL DEFAULT 0,
    "showSellerCount" INTEGER NOT NULL DEFAULT 0,
    "showFbaFbm" INTEGER NOT NULL DEFAULT 0,
    "showRestriction" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExplorerFilters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserExplorerFilters_userId_key" ON "UserExplorerFilters"("userId");
