import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

// Public contact form endpoint. Customers submit { email, message } and it lands in the
// owner's Gmail inbox via the same Gmail SMTP. Reply-To is set to the customer's email so a
// reply from the inbox goes straight back to them — no support mailbox needed.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const inflight = new Map<string, number>(); // tiny IP throttle so a single client can't spam

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'bad json' }, { status: 400 }); }

  const email = String(body?.email || '').trim();
  const message = String(body?.message || '').trim();
  const name = String(body?.name || '').trim().slice(0, 80);

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ success: false, error: 'valid email required' }, { status: 400 });
  if (message.length < 4 || message.length > 4000) return NextResponse.json({ success: false, error: 'message must be 4–4000 chars' }, { status: 400 });

  // Soft IP throttle: max 1 submit per 30s per IP. Best-effort, in-memory.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const last = inflight.get(ip) || 0;
  const now = Date.now();
  if (now - last < 30_000) return NextResponse.json({ success: false, error: 'please wait a moment before sending again' }, { status: 429 });
  inflight.set(ip, now);
  // Prune old entries occasionally so the map doesn't grow.
  if (inflight.size > 500) for (const [k, t] of Array.from(inflight)) if (now - t > 300_000) inflight.delete(k);

  const owner = process.env.GMAIL_USER;
  if (!owner) return NextResponse.json({ success: false, error: 'email not configured' }, { status: 500 });

  const safe = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto">
  <h2 style="margin:0 0 10px 0;font-size:18px">New contact form message</h2>
  <p style="margin:0 0 4px 0;color:#444"><strong>From:</strong> ${safe(name || '(no name)')} &lt;${safe(email)}&gt;</p>
  <p style="margin:0 0 14px 0;color:#666;font-size:12px">Reply to this email and it goes back to the customer.</p>
  <div style="white-space:pre-wrap;line-height:1.6;background:#f7f7f8;border:1px solid #e5e7eb;border-radius:10px;padding:14px;color:#111">${safe(message)}</div>
  <p style="margin:14px 0 0 0;color:#9ca3af;font-size:11px">Sent from himothypicks.com · IP ${safe(ip)}</p>
</div>`.trim();

  const r = await sendEmail({
    to: owner,
    subject: `[himothypicks.com] ${name || 'Contact'} – ${message.slice(0, 60).replace(/\s+/g, ' ')}`,
    html,
    replyTo: email,
  });
  if (!r.ok) return NextResponse.json({ success: false, error: r.error || 'send failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
