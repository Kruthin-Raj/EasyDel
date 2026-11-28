import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import { canAccessRoute } from '@/lib/route-sharing';

type SyncDeliveryInput = {
  routeId: string;
  routeVersionId: string;
  locationId: string;
  subscriptionId?: string;
  status: 'DELIVERED' | 'FAILED' | 'SKIPPED';
  quantity?: number;
  notes?: string;
  nextVisitNote?: string;
  reason?: string;
  recordedDistance?: number | null;
};

/** Receives queued offline delivery updates recorded in WatermelonDB while on the road. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to sync your deliveries.' }, { status: 401 });
  }

  let body: { entries?: SyncDeliveryInput[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid sync payload.' }, { status: 400 });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const byVersion = new Map<string, SyncDeliveryInput[]>();
  for (const item of entries) {
    if (!item.routeVersionId || !item.routeId) continue;
    const list = byVersion.get(item.routeVersionId) ?? [];
    list.push(item);
    byVersion.set(item.routeVersionId, list);
  }

  let synced = 0;

  for (const [versionId, group] of byVersion.entries()) {
    const routeId = group[0]?.routeId;
    if (!routeId || !(await canAccessRoute(user.id, routeId))) continue;

    let run = await db.routeRun.findFirst({
      where: { driverId: user.id, routeVersionId: versionId, status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    });

    if (!run) {
      run = await db.routeRun.create({
        data: { routeVersionId: versionId, driverId: user.id, status: 'IN_PROGRESS' },
      });
    }

    for (const entry of group) {
      let subscriptionId = entry.subscriptionId;
      if (!subscriptionId) {
        const sub = await db.subscription.findFirst({
          where: { deliveryLocationId: entry.locationId, status: 'ACTIVE' },
          select: { id: true, quantity: true },
        });
        subscriptionId = sub?.id;
      }
      if (!subscriptionId) continue;

      const status =
        entry.status === 'FAILED' || entry.status === 'SKIPPED' ? entry.status : 'DELIVERED';

      const existing = await db.delivery.findFirst({
        where: { routeRunId: run.id, subscriptionId },
        select: { id: true },
      });

      if (existing) {
        await db.delivery.update({
          where: { id: existing.id },
          data: {
            status,
            notes: entry.notes || null,
            reason: entry.reason || null,
            recordedDistance: entry.recordedDistance ?? null,
            timestamp: new Date(),
          },
        });
      } else {
        await db.delivery.create({
          data: {
            routeVersionId: versionId,
            routeRunId: run.id,
            subscriptionId,
            status,
            quantity: entry.quantity ?? 1,
            notes: entry.notes || null,
            reason: entry.reason || null,
            recordedDistance: entry.recordedDistance ?? null,
          },
        });
      }
      if (entry.nextVisitNote?.trim()) {
        await db.deliveryLocation.updateMany({
          where: { id: entry.locationId, createdById: user.id },
          data: { nextVisitNote: entry.nextVisitNote.trim() },
        });
      }
      synced++;
    }
  }

  return NextResponse.json({ synced });
}
