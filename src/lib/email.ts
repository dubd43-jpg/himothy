// Email sending via Gmail SMTP — free, 500/day per Gmail account. From + replies both use the
// owner's Gmail (rentalsgradea@gmail.com by default), so customer replies land in the same
// inbox naturally. Env: GMAIL_USER + GMAIL_APP_PASSWORD (generate at
// https://myaccount.google.com/apppasswords after enabling 2FA).

export const FROM_NAME = 'HIMOTHY Plays & Parlays';

export interface SendResult { ok: boolean; id?: string; error?: string }

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: 'GMAIL_USER and GMAIL_APP_PASSWORD must be set on Vercel (enable 2FA on Gmail, create an App Password).' };
  }
  let mod: any;
  try {
    mod = await import('nodemailer');
  } catch {
    return { ok: false, error: 'nodemailer package not installed (run npm install).' };
  }
  const transporter = mod.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass },
  });
  try {
    const info = await transporter.sendMail({
      from: `"${opts.fromName || FROM_NAME}" <${user}>`,
      to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo || user,
    });
    return { ok: true, id: String(info?.messageId || '') };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
