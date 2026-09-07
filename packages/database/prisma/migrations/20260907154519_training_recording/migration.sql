-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('RECORDING', 'COMPLETED', 'ABANDONED');

-- AlterTable
ALTER TABLE "TrainingCheckpoint" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "nextVisitNote" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "generatedRouteId" TEXT,
ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "status" "TrainingSessionStatus" NOT NULL DEFAULT 'RECORDING';

-- CreateIndex
CREATE INDEX "TrainingCheckpoint_trainingSessionId_sequence_idx" ON "TrainingCheckpoint"("trainingSessionId", "sequence");

-- CreateIndex
CREATE INDEX "TrainingSession_status_startedAt_idx" ON "TrainingSession"("status", "startedAt");
