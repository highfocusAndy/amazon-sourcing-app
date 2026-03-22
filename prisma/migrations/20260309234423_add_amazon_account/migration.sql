-- CreateTable
CREATE TABLE "AmazonAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "awsAccessKeyId" TEXT NOT NULL,
    "awsSecretAccessKey" TEXT NOT NULL,
    "awsRegion" TEXT NOT NULL DEFAULT 'us-east-1',
    "spApiHost" TEXT,
    "amazonSellerIds" TEXT,
    "awsRoleArn" TEXT,
    "awsRoleSessionName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AmazonAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AmazonAccount_userId_key" ON "AmazonAccount"("userId");
