-- Two additive, nullable columns.
--
-- IF NOT EXISTS because `DeliveryLocation.nextVisitNote` was already applied
-- straight to the database without a migration. Recording it here brings the
-- migration history back in step with reality; `prisma migrate dev` was
-- otherwise going to offer a full reset, which would have destroyed live data.

-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN IF NOT EXISTS "nextVisitNote" TEXT;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN IF NOT EXISTS "nameOptions" TEXT;
