"use client";

// ADMIN — compose + send email blasts to customers via Gmail SMTP (free, 500/day quota).
// Behind the admin password gate (layout). To call the send endpoint we need the
// x-admin-secret; pasted once and remembered in localStorage. Includes a "Tonight's Picks"
// preset that pulls today's slate and formats a customer-safe email (no methodology).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send, Loader2, ListPlus, Key } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

export default function AdminEmailPage() {
  const [secret, setSecret] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [presetLoading, setPresetLoading] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem(SECRET_KEY); if (s) setSecret(s); } catch {}
  }, []);

  const saveSecret = (v: string) => { setSecret(v); try { localStorage.setItem(SECRET_KEY, v); } catch {} };

  const loadTodaysPicks = async () => {
    setPresetLoading(true);
    try {
      const res = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
      const d = await res.json();
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
      setSubject(`Tonight's HIMOTHY Picks — ${today}`);

      const line = (label: string, p: any) => p ? `<tr><td style="padding:6px 0;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;width:130px">${label}</td><td style="padding:6px 0;font-weight:700;color:#fff">${p.selection} <span style="color:#9ca3af;font-weight:500">${p.odds || ""}</span></td></tr>` : "";
      const list = (label: string, arr: any[]) => (arr || []).length === 0 ? "" : `<tr><td colspan="2" style="padding:10px 0 4px 0;color:#d4a843;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em">${label}</td></tr>` + (arr || []).map((p: any) => `<tr><td style="padding:4px 0;color:#9ca3af;font-size:12px"></td><td style="padding:4px 0;font-weight:600;color:#fff">${p.selection} <span style="color:#9ca3af;font-weight:500">${p.odds || ""}</span></td></tr>`).join("");

      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h1 style="font-size:22px;font-weight:900;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:-0.01em">HIMOTHY Plays &amp; Parlays</h1>
  <p style="margin:0 0 18px 0;color:#9ca3af;font-size:13px">Tonight's board — ${today}</p>
  <table style="width:100%;border-collapse:collapse">
    ${line("Grand Slam", d.grandSlam)}
    ${list("Pressure Pack", d.pressurePack)}
    ${list("VIP 4-Pack", d.vip4Pack)}
    ${list("$10 Parlay", d.parlayPlan)}
  </table>
  <p style="margin:22px 0 0 0;color:#9ca3af;font-size:12px;line-height:1.6">Bet the straights as single tickets — one play per ticket. The $10 Parlay is the only combined play. Reply to this email if you have any questions.</p>
  <p style="margin:14px 0 0 0;color:#6b7280;font-size:11px">himothypicks.com · Official Record Since 2026-05-27</p>
</div>`.trim();
      setBody(html);
    } catch (e: any) {
      setResult(`Preset failed: ${String(e?.message || e)}`);
    } finally {
      setPresetLoading(false);
    }
  };

  const send = async () => {
    setResult(null);
    if (!secret) { setResult("Paste your admin secret first."); return; }
    const to = recipients.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) { setResult("Add at least one recipient."); return; }
    if (!subject.trim() || !body.trim()) { setResult("Subject and body are required."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ recipients: to, subject, html: body }),
      });
      const data = await res.json();
      if (!data.success) { setResult(`Send failed: ${data.error || res.status}`); }
      else { setResult(`Sent ${data.sent}/${data.total}${data.failed ? ` — ${data.failed} failed` : ""}.`); }
    } catch (e: any) {
      setResult(`Send error: ${String(e?.message || e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-3xl px-5 py-8 flex flex-col gap-5">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white w-max">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Email Customers</h1>
          <p className="mt-2 text-sm text-white/50">Sends via your Gmail (free, 500/day cap). Replies hit your inbox automatically.</p>
        </div>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Key className="h-3 w-3" /> Admin secret (saved locally)</span>
          <input type="password" value={secret} onChange={(e) => saveSecret(e.target.value)} placeholder="paste your ADMIN_SECRET once" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white/80 outline-none focus:border-primary/50" />
        </label>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40">Recipients (comma or newline)</span>
          <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={3} placeholder="user1@example.com, user2@example.com" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none focus:border-primary/50 font-mono" />
        </label>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tonight's HIMOTHY Picks" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-primary/50" />
        </label>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40 flex items-center justify-between">
            <span>Body (HTML)</span>
            <button type="button" onClick={loadTodaysPicks} disabled={presetLoading} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 disabled:opacity-40">
              {presetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />} Load tonight's picks
            </button>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} placeholder="<p>Tonight's picks...</p>" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 outline-none focus:border-primary/50 font-mono" />
        </label>

        <div className="flex items-center gap-3">
          <button type="button" onClick={send} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-40 transition-colors">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
          {result && <span className={`text-sm font-bold ${result.startsWith("Sent") ? "text-emerald-400" : "text-amber-400"}`}>{result}</span>}
        </div>

        <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-xs text-white/45 leading-relaxed">
          <p><strong className="text-white/70">Setup once:</strong> enable 2-step verification on your Gmail, then create an App Password at <span className="text-primary">myaccount.google.com/apppasswords</span>. Add two env vars on Vercel: <code className="text-white/60">GMAIL_USER=rentalsgradea@gmail.com</code> and <code className="text-white/60">GMAIL_APP_PASSWORD=&lt;16-char password&gt;</code>. Redeploy. After that, this page sends with one click.</p>
        </div>
      </div>
    </div>
  );
}
