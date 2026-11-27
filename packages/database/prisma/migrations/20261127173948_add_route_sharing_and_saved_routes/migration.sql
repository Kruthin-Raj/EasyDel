-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "shareCode" TEXT;

-- CreateTable
CREATE TABLE "SavedRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedRoute_userId_createdAt_idx" ON "SavedRoute"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRoute_userId_routeId_key" ON "SavedRoute"("userId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_shareCode_key" ON "Route"("shareCode");

-- AddForeignKey
ALTER TABLE "SavedRoute" ADD CONSTRAINT "SavedRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRoute" ADD CONSTRAINT "SavedRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

