-- CreateTable
CREATE TABLE "ApiResponseCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiResponseCache_cacheKey_key" ON "ApiResponseCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ApiResponseCache_expiresAt_idx" ON "ApiResponseCache"("expiresAt");
