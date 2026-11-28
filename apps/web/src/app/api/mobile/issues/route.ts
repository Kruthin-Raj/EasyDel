import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Reports or resolves a delivery issue from the mobile app. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: {
    action: 'create' | 'resolve';
    issueId?: string;
    locationId?: string;
    category?: string;
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.action === 'resolve') {
    const existing = await db.issue.findUnique({ where: { id: String(body.issueId ?? '') } });
    if (!existing || existing.reportedBy !== user.id) {
      return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
    }
    await db.issue.update({ where: { id: existing.id }, data: { status: 'RESOLVED' } });
    return NextResponse.json({ ok: true });
  }

  const description = String(body.description ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'Describe the issue.' }, { status: 400 });
  }

  const created = await db.issue.create({
    data: {
      reportedBy: user.id,
      entityType: body.locationId ? 'DeliveryLocation' : 'Route',
      entityId: body.locationId || user.id,
      category: body.category?.trim() || 'Other',
      description,
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
