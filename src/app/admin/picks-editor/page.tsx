"use client";

// ADMIN — Edit Picks. Full control over every pick in the registry: edit any field, change
// the result (mark won / lost / push / void / pending), delete picks, or add a manual pick.
// No engine guards — owner has full control over their own record.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Trash2, Plus, Key, RefreshCw } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

const FIELDS: Array<{ key: string; label: string; type?: "text" | "number" | "select"; options?: string[] }> = [
  { key: "category", label: "Category", type: "select", options: ["GRAND_SLAM", "PRESSURE_PACK", "VIP_4_PACK", "PARLAY_PLAN", "MARQUEE", "ASLEEP_PICKS", "VALUE_PLAYS", "NRFI", "PERSONAL_PLAY", "HAILMARY", "OVERNIGHT", "OVERSEAS"] },
  { key: "selection", label: "Selection" },
  { key: "line", label: "Line" },
  { key: "odds", label: "Odds" },
  { key: "result", label: "Result", type: "select", options: ["pending", "win", "loss", "push", "void"] },
  { key: "status", label: "Status", type: "select", options: ["published", "locked", "graded", "archived"] },
  { key: "market_type", label: "Market type" },
  { key: "sport", label: "Sport" },
  { key: "league", label: "League" },
  { key: "event_name", label: "Event name" },
  { key: "home_team", label: "Home team" },
  { key: "away_team", label: "Away team" },
  { key: "event_id", label: "Event ID (ESPN)" },
  { key: "board_date", label: "Board date (YYYY-MM-DD)" },
];

function todayET() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}

function PickEditor({ pick, secret, onSaved, onDeleted }: { pick: any; secret: string; onSaved: () => void; onDeleted: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = pick[snakeToCamel(f.key)] ?? pick[f.key] ?? "";
      out[f.key] = v == null ? "" : String(v);
    }
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/picks-editor/${pick.pickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(fields),
      });
      const d = await res.json();
      setMsg(d.success ? "Saved." : `Failed: ${d.error}`);
      if (d.success) onSaved();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete this pick? (${pick.selection})`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/picks-editor/${pick.pickId}`, { method: "DELETE", headers: { "x-admin-secret": secret } });
      const d = await res.json();
      if (d.success) onDeleted(); else setMsg(`Delete failed: ${d.error}`);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{pick.category} · {pick.league}</span>
        <code className="text-[9px] text-white/25 font-mono">{pick.pickId?.slice(0, 8)}…</code>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[10px] font-bold text-white/50">{f.label}</span>
            {f.type === "select" ? (
              <select value={fields[f.key]} onChange={(e) => setFields((v) => ({ ...v, [f.key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary/50">
                <option value="">—</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type="text" value={fields[f.key]} onChange={(e) => setFields((v) => ({ ...v, [f.key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary/50" />
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-40">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
        </button>
        <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20 disabled:opacity-40">
          <Trash2 className="h-3 w-3" /> Delete
        </button>
        {msg && <span className={`text-[11px] font-bold ${msg === "Saved." ? "text-emerald-400" : "text-amber-400"}`}>{msg}</span>}
      </div>
    </div>
  );
}

function snakeToCamel(s: string) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }

export default function PicksEditorPage() {
  const [secret, setSecret] = useState("");
  const [date, setDate] = useState(todayET());
  const [picks, setPicks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { try { const s = localStorage.getItem(SECRET_KEY); if (s) setSecret(s); } catch {} }, []);
  const saveSecret = (v: string) => { setSecret(v); try { localStorage.setItem(SECRET_KEY, v); } catch {} };

  const load = async () => {
    if (!secret) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/picks-editor?date=${date}`, { headers: { "x-admin-secret": secret } });
      const d = await res.json();
      if (d.success) setPicks(d.picks || []);
      else setMsg(`Load failed: ${d.error}`);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [secret, date]);

  const create = async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/picks-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ ...newFields, board_date: newFields.board_date || date }),
      });
      const d = await res.json();
      if (d.success) { setAdding(false); setNewFields({}); load(); }
      else setMsg(`Create failed: ${d.error}`);
    } catch (e: any) { setMsg(String(e?.message || e)); }
  };

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-4xl px-5 py-8 flex flex-col gap-5">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white w-max">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Edit Picks</h1>
          <p className="mt-2 text-sm text-white/50">Full control over every pick in the record. Change any field, mark results, delete, or add manually. Owner-only — no engine guards.</p>
        </div>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Key className="h-3 w-3" /> Admin secret</span>
          <input type="password" value={secret} onChange={(e) => saveSecret(e.target.value)} placeholder="paste your ADMIN_SECRET once" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white/80 outline-none focus:border-primary/50" />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[10px] font-bold text-white/50">Board date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-primary/50" />
          </label>
          <button type="button" onClick={load} disabled={!secret || loading} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white/70 hover:text-white disabled:opacity-40">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reload
          </button>
          <button type="button" onClick={() => setAdding((v) => !v)} disabled={!secret} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-40">
            <Plus className="h-3 w-3" /> {adding ? "Cancel" : "Add pick"}
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-primary/80 mb-3">New pick (any fields)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[10px] font-bold text-white/50">{f.label}</span>
                  {f.type === "select" ? (
                    <select value={newFields[f.key] || ""} onChange={(e) => setNewFields((v) => ({ ...v, [f.key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary/50">
                      <option value="">—</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={newFields[f.key] || ""} onChange={(e) => setNewFields((v) => ({ ...v, [f.key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary/50" />
                  )}
                </label>
              ))}
            </div>
            <button type="button" onClick={create} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-black hover:bg-white">
              <Plus className="h-3 w-3" /> Create
            </button>
          </div>
        )}

        {msg && <p className="text-sm font-bold text-amber-400">{msg}</p>}

        {!secret ? <p className="text-sm text-amber-400">Paste your admin secret above.</p>
          : loading ? <p className="text-sm text-white/40">Loading picks…</p>
          : picks.length === 0 ? <p className="text-sm text-white/40">No picks for {date}.</p>
          : (
            <div className="space-y-3">
              <p className="text-xs text-white/40">{picks.length} pick(s) for {date}.</p>
              {picks.map((p) => <PickEditor key={p.pickId} pick={p} secret={secret} onSaved={load} onDeleted={load} />)}
            </div>
          )}
      </div>
    </div>
  );
}
