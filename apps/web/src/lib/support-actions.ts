'use server';

import { getSessionUser } from './auth';
import { db } from './db';
import { sendMail } from './mailer';

export type SupportState = { error?: string; success?: string } | null;

const ALLOWED_TOPICS = new Set([
  'General question',
  'Route sharing & codes',
  'Memorize & recording',
  'Delivery issue / bug',
  'Feature request',
  'Account & sign-in',
]);

/**
 * Handles submissions from `/contact` (both signed-in users and visitors).
 * Sends an email via SMTP when configured, logs cleanly in dev, and records
 * an audit entry when a signed-in user submits feedback.
 */
export async function submitContactAction(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const sessionUser = await getSessionUser();

  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 200);
  const topicRaw = String(formData.get('topic') ?? '').trim();
  const topic = ALLOWED_TOPICS.has(topicRaw) ? topicRaw : 'General question';
  const subject = String(formData.get('subject') ?? '').trim().slice(0, 140);
  const message = String(formData.get('message') ?? '').trim().slice(0, 4000);

  if (name.length < 2) {
    return { error: 'Please enter your name so we know how to address you.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address so we can reply.' };
  }
  if (subject.length < 3) {
    return { error: 'Please enter a brief subject line.' };
  }
  if (message.length < 10) {
    return { error: 'Please include at least a few words describing your message.' };
  }

  const ticketId = `ED-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const supportInbox =
    process.env.SUPPORT_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    'support@easydel.local';

  const result = await sendMail({
    to: supportInbox,
    subject: `[${ticketId}] ${topic}: ${subject}`,
    text: [
      `Ticket: ${ticketId}`,
      `From: ${name} <${email}>`,
      sessionUser ? `Account ID: ${sessionUser.id}` : 'Account: Visitor (not signed in)',
      `Topic: ${topic}`,
      `Subject: ${subject}`,
      '',
      message,
    ].join('\n'),
    html: `<div style="font-family:Helvetica,Arial,sans-serif;background:#0a0e13;color:#e9f0f7;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#131b25;border:1px solid #22303f;border-radius:12px;padding:24px;">
        <p style="margin:0 0 6px;color:#f5a524;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">EasyDel Support · ${ticketId}</p>
        <h2 style="margin:0 0 12px;font-size:18px;">${subject.replace(/</g, '&lt;')}</h2>
        <p style="margin:0 0 8px;color:#9fb0c2;font-size:13px;"><strong>From:</strong> ${name.replace(/</g, '&lt;')} (${email.replace(/</g, '&lt;')})</p>
        <p style="margin:0 0 16px;color:#9fb0c2;font-size:13px;"><strong>Topic:</strong> ${topic}</p>
        <pre style="white-space:pre-wrap;background:#0f151d;border:1px solid #22303f;border-radius:8px;padding:14px;color:#e9f0f7;font-family:inherit;font-size:14px;">${message.replace(/</g, '&lt;')}</pre>
      </div>
    </div>`,
  });

  if (!result.ok) {
    return {
      error: `We could not send your message right now (${result.error}). Please try again shortly.`,
    };
  }

  if (sessionUser) {
    await db.auditLog.create({
      data: {
        userId: sessionUser.id,
        action: 'SUPPORT_CONTACT',
        entityType: 'Support',
        entityId: ticketId,
        newValue: `${topic}: ${subject}`,
      },
    });
  }

  return {
    success: `Message received (Reference ${ticketId}). We'll reply to ${email} as soon as possible.`,
  };
}
