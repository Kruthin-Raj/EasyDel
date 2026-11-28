-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN     "shareCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLocation_shareCode_key" ON "DeliveryLocation"("shareCode");

