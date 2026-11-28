import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBearerUser } from '@/lib/auth';
import {
  bagReminderKey,
  checkpointTypesKey,
  defaultStartKey,
  distanceUnitKey,
  geofenceKey,
  memorizeAutoAdvanceKey,
  memorizeQuizKey,
} from '@/lib/permissions';
import { isValidCoord } from '@/lib/optimize';
import { sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/** Saves user profile & preferences from the mobile app. */
export async function POST(request: Request) {
  const user = await getBearerUser(request);
  if (!user) return NextResponse.json({ error: 'Please sign in to save settings.' }, { status: 401 });

  let body: {
    firstName?: string;
    lastName?: string;
    geofenceMetres?: number;
    distanceUnit?: 'metric' | 'imperial';
    defaultStartName?: string;
    defaultStartLat?: number;
    defaultStartLng?: number;
    memorizeQuizDefault?: boolean;
    memorizeAutoAdvance?: boolean;
    showBagReminder?: boolean;
    checkpointTypes?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.firstName?.trim()) {
    await db.user.update({
      where: { id: user.id },
      data: {
        firstName: body.firstName.trim().slice(0, 60),
        lastName: (body.lastName ?? user.lastName).trim().slice(0, 60),
      },
    });
  }

  const geofence = Number(body.geofenceMetres ?? 150);
  if (!Number.isFinite(geofence) || geofence < 10 || geofence > 5000) {
    return NextResponse.json({ error: 'Geofence must be between 10 and 5000 m.' }, { status: 400 });
  }

  const startLat = Number(body.defaultStartLat ?? 13.6288);
  const startLng = Number(body.defaultStartLng ?? 79.4192);
  if (!isValidCoord(startLat, startLng)) {
    return NextResponse.json({ error: 'Default start coordinates must be valid.' }, { status: 400 });
  }

  const pairs: [string, string][] = [
    [geofenceKey(user.id), String(Math.round(geofence))],
    [distanceUnitKey(user.id), body.distanceUnit === 'imperial' ? 'imperial' : 'metric'],
    [
      defaultStartKey(user.id),
      JSON.stringify({
        name: body.defaultStartName?.trim().slice(0, 80) || 'Depot',
        lat: startLat,
        lng: startLng,
      }),
    ],
    [memorizeQuizKey(user.id), body.memorizeQuizDefault ? 'true' : 'false'],
    [memorizeAutoAdvanceKey(user.id), body.memorizeAutoAdvance !== false ? 'true' : 'false'],
    [bagReminderKey(user.id), body.showBagReminder !== false ? 'true' : 'false'],
  ];

  if (Array.isArray(body.checkpointTypes) && body.checkpointTypes.length > 0) {
    pairs.push([checkpointTypesKey(user.id), body.checkpointTypes.join('\n')]);
  }

  await Promise.all(
    pairs.map(([key, value]) =>
      db.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );

  return NextResponse.json({ ok: true });
}

/** Handles support / contact messages submitted from mobile Contact screen. */
export async function PUT(request: Request) {
  const user = await getBearerUser(request);

  let body: { name?: string; email?: string; topic?: string; subject?: string; message?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const subject = String(body.subject ?? '').trim();
  const message = String(body.message ?? '').trim();
  const topic = String(body.topic ?? 'Mobile app').trim();

  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) {
    return NextResponse.json({ error: 'Enter name, valid email, and your message.' }, { status: 400 });
  }

  const ticketId = `ED-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const supportInbox =
    process.env.SUPPORT_EMAIL?.trim() || process.env.SMTP_USER?.trim() || 'support@easydel.local';

  await sendMail({
    to: supportInbox,
    subject: `[${ticketId}] ${topic}: ${subject || 'Mobile support'}`,
    text: `From: ${name} <${email}>\nAccount: ${user?.id ?? 'Guest'}\n\n${message}`,
    html: `<p><strong>From:</strong> ${name.replace(/</g, '&lt;')} (${email.replace(/</g, '&lt;')})</p><pre>${message.replace(/</g, '&lt;')}</pre>`,
  });

  if (user) {
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUPPORT_CONTACT',
        entityType: 'Support',
        entityId: ticketId,
        newValue: `${topic}: ${subject || 'Mobile support'}`,
      },
    });
  }

  return NextResponse.json({ ok: true, ticketId });
}
