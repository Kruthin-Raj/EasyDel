-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "DeliveryLocation_createdById_status_idx" ON "DeliveryLocation"("createdById", "status");

-- AddForeignKey
ALTER TABLE "DeliveryLocation" ADD CONSTRAINT "DeliveryLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill location owners from the original LOCATION_CREATED audit entries
UPDATE "DeliveryLocation" dl
SET "createdById" = a."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "AuditLog"
  WHERE "entityType" = 'DeliveryLocation' AND "action" = 'LOCATION_CREATED'
  ORDER BY "entityId", "timestamp" ASC
) a
WHERE dl."id" = a."entityId"
  AND dl."createdById" IS NULL;

-- Fallback: attribute any remaining location referenced by a route stop to the route creator
UPDATE "DeliveryLocation" dl
SET "createdById" = r."createdById"
FROM (
  SELECT DISTINCT ON (rs."deliveryLocationId") rs."deliveryLocationId", rt."createdById"
  FROM "RouteStop" rs
  JOIN "RouteVersion" rv ON rv."id" = rs."routeVersionId"
  JOIN "Route" rt ON rt."id" = rv."routeId"
  ORDER BY rs."deliveryLocationId", rt."createdAt" ASC
) r
WHERE dl."id" = r."deliveryLocationId"
  AND dl."createdById" IS NULL;


