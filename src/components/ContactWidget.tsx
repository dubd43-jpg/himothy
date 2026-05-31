"use client";

// Floating "Contact" widget — bottom-right of every page. Customer clicks the bubble, types
// email + message, hits Send. Submits to /api/contact which emails the owner. Reply from the
// inbox goes straight back to the customer (Reply-To is set on the email).

import { useEffect, useState } from "react";
import { MessageCircle, X, Loader2, Send, CheckCircle2 } from "lucide-react";

export function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render on /admin (it has its own admin context + email tooling).
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) setHide(true);
  }, []);
  if (hide) return null;

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError("Enter a valid email."); return; }
    if (message.trim().length < 4) { setError("Add a short message."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, message }),
      });
      const data = await res.json();
      if (!data.success) setError(data.error || "Send failed. Try again in a minute.");
      else { setSent(true); setMessage(""); }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      {open ? (
        <div className="w-[320px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-white/15 bg-[#0a0a0a] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-white/70">Contact HIMOTHY</span>
            </div>
            <button type="button" onClick={() => { setOpen(false); setSent(false); setError(null); }} aria-label="Close" className="text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          {sent ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm font-bold text-white">Got it — we'll reply to your email.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary/50" />
              <input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary/50" />
              <textarea placeholder="What's up?" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary/50 resize-none" />
              {error && <p className="text-xs font-bold text-amber-400">{error}</p>}
              <button type="button" onClick={submit} disabled={sending} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black uppercase tracking-widest text-black hover:bg-white transition-colors disabled:opacity-40">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
              <p className="text-[10px] text-white/30 text-center mt-1">We read every message. Reply usually within a day.</p>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open contact form"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_-5px_rgba(212,168,67,0.5)] hover:bg-white transition-colors"
        >
          <MessageCircle className="h-4 w-4" /> Contact
        </button>
      )}
    </div>
  );
}
