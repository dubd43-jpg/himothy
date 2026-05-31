import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { isAdminRequest, adminUnauthorized } from '@/lib/adminAuth';

// ADMIN ONLY. Sends an email to one or more recipients via Gmail SMTP. Gmail's free quota is
// 500 emails/day per account — exceed it and Gmail will throttle. Sends sequentially with a
// small delay so Gmail doesn't flag it as a burst.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAdminRequest(req)) return adminUnauthorized();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }

  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients.map((s: any) => String(s).trim()).filter((s: string) => /\S+@\S+\.\S+/.test(s))
    : [];
  const subject = String(body?.subject || '').trim();
  const html = String(body?.html || '').trim();
  if (recipients.length === 0 || !subject || !html) {
    return NextResponse.json({ success: false, error: 'recipients (valid emails), subject, and html are required' }, { status: 400 });
  }

  const results: Array<{ to: string; ok: boolean; id?: string; error?: string }> = [];
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, html });
    results.push({ to, ok: r.ok, id: r.id, error: r.error });
    // Tiny pause between sends so Gmail doesn't throttle on a burst.
    if (recipients.length > 1) await new Promise((res) => setTimeout(res, 250));
  }
  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ success: true, sent, failed: results.length - sent, total: results.length, results });
}
