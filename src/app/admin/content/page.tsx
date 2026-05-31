"use client";

// ADMIN — Site Content editor. Lists every editable field grouped by page area; the owner
// edits, hits Save, the changes go live immediately on the pages that read from getContent().
// Behind the admin password gate (layout). Admin secret pasted once, saved in localStorage.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Plus, Key } from "lucide-react";
import { CONTENT_FIELDS } from "@/lib/siteContent";

const SECRET_KEY = "himothy_admin_secret";

export default function AdminContentPage() {
  const [secret, setSecret] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Array<{ key: string; value: string }>>([]); // ad-hoc keys not in CONTENT_FIELDS
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem(SECRET_KEY); if (s) setSecret(s); } catch {}
  }, []);
  useEffect(() => {
    (async () => {
      if (!secret) { setLoading(false); return; }
      try {
        const res = await fetch("/api/admin/content", { headers: { "x-admin-secret": secret } });
        const d = await res.json();
        if (d.success) {
          const v: Record<string, string> = {};
          const declared = new Set(CONTENT_FIELDS.map((f) => f.key));
          const extra: Array<{ key: string; value: string }> = [];
          for (const it of d.items || []) {
            if (declared.has(it.key)) v[it.key] = it.value;
            else extra.push({ key: it.key, value: it.value });
          }
          setValues(v);
          setExtras(extra);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [secret]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof CONTENT_FIELDS> = {};
    for (const f of CONTENT_FIELDS) (g[f.group] ||= [] as any).push(f);
    return g;
  }, []);

  const save = async () => {
    if (!secret) { setMsg("Paste your admin secret."); return; }
    setMsg(null);
    setSaving(true);
    try {
      const items = [
        ...CONTENT_FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? "" })),
        ...extras.filter((e) => e.key.trim()).map((e) => ({ key: e.key.trim(), value: e.value })),
      ];
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ items }),
      });
      const d = await res.json();
      setMsg(d.success ? `Saved ${d.saved} field(s) — live on the site now.` : `Save failed: ${d.error}`);
    } catch (e: any) { setMsg(`Save error: ${String(e?.message || e)}`); }
    finally { setSaving(false); }
  };

  const saveSecret = (v: string) => { setSecret(v); try { localStorage.setItem(SECRET_KEY, v); } catch {} };

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-3xl px-5 py-8 flex flex-col gap-5">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white w-max">
          <ArrowLeft className="h-4 w-4" /> Admin
        </Link>
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Site Content</h1>
          <p className="mt-2 text-sm text-white/50">Edit any text on the site. Save once, it's live everywhere those fields render.</p>
        </div>

        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5"><Key className="h-3 w-3" /> Admin secret (saved locally)</span>
          <input type="password" value={secret} onChange={(e) => saveSecret(e.target.value)} placeholder="paste your ADMIN_SECRET once" className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white/80 outline-none focus:border-primary/50" />
        </label>

        {!secret ? (
          <p className="text-sm text-amber-400">Paste your admin secret above to load fields.</p>
        ) : loading ? (
          <p className="text-sm text-white/40">Loading fields…</p>
        ) : (
          <>
            {Object.entries(grouped).map(([group, fields]) => (
              <section key={group} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-primary/80 mb-3">{group}</h2>
                <div className="space-y-3">
                  {fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="text-[11px] font-bold text-white/60">{f.label} <span className="text-white/30 font-mono">— {f.key}</span></span>
                      {f.multiline ? (
                        <textarea
                          rows={3}
                          value={values[f.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.default}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none focus:border-primary/50"
                        />
                      ) : (
                        <input
                          type="text"
                          value={values[f.key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.default}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 outline-none focus:border-primary/50"
                        />
                      )}
                      {f.hint && <span className="block text-[10px] text-white/35 mt-1">{f.hint}</span>}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary/80 mb-3">Custom keys (any field)</h2>
              <p className="text-[11px] text-white/40 mb-2">Add an ad-hoc key for any other text you want editable. Use it in code via <code>getContent("your.key")</code>.</p>
              {extras.map((e, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" placeholder="key.name" value={e.key} onChange={(ev) => setExtras((arr) => arr.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)))} className="w-1/3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-primary/50" />
                  <input type="text" placeholder="value" value={e.value} onChange={(ev) => setExtras((arr) => arr.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))} className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/90 outline-none focus:border-primary/50" />
                </div>
              ))}
              <button type="button" onClick={() => setExtras((arr) => [...arr, { key: "", value: "" }])} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80">
                <Plus className="h-3 w-3" /> Add field
              </button>
            </section>

            <div className="flex items-center gap-3 sticky bottom-4">
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save all changes
              </button>
              {msg && <span className={`text-sm font-bold ${msg.startsWith("Saved") ? "text-emerald-400" : "text-amber-400"}`}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
