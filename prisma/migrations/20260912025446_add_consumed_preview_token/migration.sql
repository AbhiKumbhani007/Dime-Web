-- CreateTable
CREATE TABLE "ConsumedPreviewToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedPreviewToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedPreviewToken_tokenHash_key" ON "ConsumedPreviewToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "ConsumedPreviewToken" ADD CONSTRAINT "ConsumedPreviewToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
