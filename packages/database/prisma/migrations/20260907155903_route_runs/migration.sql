-- CreateEnum
CREATE TYPE "RouteRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "recordedDistance" DOUBLE PRECISION,
ADD COLUMN     "routeRunId" TEXT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "category" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "routeRunId" TEXT;

-- CreateTable
CREATE TABLE "RouteRun" (
    "id" TEXT NOT NULL,
    "routeVersionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "RouteRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,

    CONSTRAINT "RouteRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteRun_driverId_status_idx" ON "RouteRun"("driverId", "status");

-- CreateIndex
CREATE INDEX "RouteRun_routeVersionId_startedAt_idx" ON "RouteRun"("routeVersionId", "startedAt");

-- CreateIndex
CREATE INDEX "Issue_status_createdAt_idx" ON "Issue"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "RouteRun" ADD CONSTRAINT "RouteRun_routeVersionId_fkey" FOREIGN KEY ("routeVersionId") REFERENCES "RouteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteRun" ADD CONSTRAINT "RouteRun_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_routeRunId_fkey" FOREIGN KEY ("routeRunId") REFERENCES "RouteRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_routeRunId_fkey" FOREIGN KEY ("routeRunId") REFERENCES "RouteRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
