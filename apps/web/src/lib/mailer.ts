import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email via your own SMTP server.
 *
 * Supabase is no longer involved in sending: it was failing at the transport
 * layer and its built-in mailer is rate-limited to a handful of messages an
 * hour. This talks to whatever SMTP host you configure.
 *
 * Fill these in apps/web/.env.local (and your host's env for deployment):
 *
 *   SMTP_HOST=smtp.gmail.com          <- a hostname, never a code or app name
 *   SMTP_PORT=587                     <- 587 STARTTLS, 465 implicit TLS
 *   SMTP_USER=you@example.com
 *   SMTP_PASSWORD=your-app-password
 *   SMTP_FROM="EasyDel <you@example.com>"
 *
 * Until SMTP_HOST is set, sends are logged to the server console instead of
 * being delivered — see sendMail() below. That keeps signup usable in local
 * development with no mail server at all.
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let cached: Transporter | null = null;

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function transporter(): Transporter {
  if (cached) return cached;

  const port = Number(process.env.SMTP_PORT);

  /*
   * Google displays app passwords as four space-separated groups
   * ("abcd efgh ijkl mnop"). Pasted verbatim that is 19 characters, and some
   * servers reject the spaces. Strip all whitespace so either form works.
   */
  const pass = process.env.SMTP_PASSWORD?.replace(/\s+/g, '');

  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Port 465 speaks TLS from the first byte; 587 upgrades via STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER && pass ? { user: process.env.SMTP_USER, pass } : undefined,

    /*
     * Timeouts are essential, not optional. nodemailer waits indefinitely by
     * default, so a firewalled port or a wrong host would hang the signup
     * Server Action forever — the browser eventually gives up and reports a
     * bare "Failed to fetch" with nothing in the logs. Fail fast instead.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cached;
}

function sender() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'EasyDel <no-reply@easydel.local>';
}

export type SendResult = { ok: true; delivered: boolean } | { ok: false; error: string };

/**
 * Sends a message, returning a result rather than throwing.
 *
 * Callers decide what the user sees; the failure is always logged here so an
 * SMTP problem is visible in the server output instead of vanishing. The
 * previous Supabase setup swallowed a hard 500 and showed a success message,
 * which meant a DNS typo in the host could only be found by reading Supabase's
 * own logs.
 */
export async function sendMail(message: MailMessage): Promise<SendResult> {
  if (!smtpConfigured()) {
    // Development fallback: no SMTP configured, so print instead of sending.
    // The OTP is in the text body, which is enough to complete signup locally.
    console.warn(
      [
        '',
        '─────────────────────────────────────────────────────────────',
        ' SMTP is not configured — email was NOT sent.',
        ' Set SMTP_HOST / SMTP_PORT in apps/web/.env.local to deliver.',
        '─────────────────────────────────────────────────────────────',
        ` To:      ${message.to}`,
        ` Subject: ${message.subject}`,
        '',
        message.text,
        '─────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { ok: true, delivered: false };
  }

  try {
    await transporter().sendMail({
      from: sender(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true, delivered: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[mailer] send to ${message.to} failed: ${detail}`);
    return { ok: false, error: detail };
  }
}

/* ------------------------------------------------------------- templates --- */

const SHELL = (title: string, body: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e13;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#131b25;border:1px solid #22303f;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 4px;color:#f5a524;font-size:11px;letter-spacing:.16em;text-transform:uppercase;">EasyDel</p>
        <h1 style="margin:0 0 8px;color:#e9f0f7;font-size:20px;font-weight:600;">${title}</h1>
        ${body}
      </td></tr>
    </table>
  </td></tr>
</table>`;

export function verificationEmail(code: string): Omit<MailMessage, 'to'> {
  return {
    subject: `${code} is your EasyDel verification code`,
    text: [
      'Confirm your email',
      '',
      `Your EasyDel verification code is: ${code}`,
      '',
      'It expires in 15 minutes.',
      "If you didn't sign up for EasyDel, you can ignore this email.",
    ].join('\n'),
    html: SHELL(
      'Confirm your email',
      `<p style="margin:0 0 24px;color:#9fb0c2;font-size:14px;line-height:1.6;">
         Enter this code in the app to finish creating your account.
       </p>
       <div style="background:#0f151d;border:1px solid #2e4054;border-radius:8px;padding:18px;text-align:center;">
         <span style="color:#e9f0f7;font-family:'Courier New',monospace;font-size:30px;font-weight:600;letter-spacing:.32em;">${code}</span>
       </div>
       <p style="margin:24px 0 0;color:#6d8096;font-size:12px;line-height:1.6;">
         This code expires in 15 minutes. If you didn't sign up for EasyDel, ignore this email.
       </p>`,
    ),
  };
}

export function passwordResetEmail(link: string): Omit<MailMessage, 'to'> {
  return {
    subject: 'Reset your EasyDel password',
    text: [
      'Reset your password',
      '',
      'Open this link to choose a new password:',
      link,
      '',
      'It works once and expires in 1 hour.',
      "If you didn't request this, ignore this email — your password will not change.",
    ].join('\n'),
    html: SHELL(
      'Reset your password',
      `<p style="margin:0 0 24px;color:#9fb0c2;font-size:14px;line-height:1.6;">
         Click below to choose a new password. The link works once and expires in 1 hour.
       </p>
       <a href="${link}" style="display:inline-block;background:#f5a524;color:#1a1204;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;">
         Set a new password
       </a>
       <p style="margin:24px 0 0;color:#6d8096;font-size:12px;line-height:1.6;word-break:break-all;">
         Or paste this into your browser:<br>${link}
       </p>`,
    ),
  };
}
