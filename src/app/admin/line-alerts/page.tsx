"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, AlertOctagon, CheckCircle2, Eye, Activity } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

interface Alert {
  id: string; date: string; category: string; league: string;
  selection: string; entryOdds: string | null;
  currentConf: number | null; preAlertConf: number | null;
  alertLevel: string | null; moveCents: number | null;
  flaggedAt: string | null; startTime: string | null;
  reasons: string[];
}

interface AlertsResponse {
  success: boolean; summary: { total: number; red: number; yellow: number; watch: number; clean: number };
  alerts: Alert[];
}

export default function LineAlertsPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setSecret(localStorage.getItem(SECRET_KEY) || '');
  }, []);
  useEffect(() => { if (secret) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [secret]);
  // Auto-refresh every 60s
  useEffect(() => {
    if (!secret) return;
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  async function load() {
    if (!secret) { setError('Enter admin secret'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/line-alerts', { headers: { 'x-admin-secret': secret } });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'failed');
      setData(json);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  function saveSecret(s: string) {
    setSecret(s);
    if (typeof window !== 'undefined') localStorage.setItem(SECRET_KEY, s);
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Line Alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">Continuous market-movement watcher. Auto-refreshes every 60s.</p>
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase px-3 py-2 rounded text-xs disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {!secret && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="text-xs uppercase font-black text-muted-foreground">Admin Secret</div>
            <input type="password" placeholder="adm_..." onBlur={(e) => saveSecret(e.target.value)} className="w-full bg-background border border-border rounded px-3 py-2 text-sm" />
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded">{error}</div>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pre-game Picks Watched</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.total}</div>
              </div>
              <div className="bg-card border border-red-500/40 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"><AlertOctagon className="w-3 h-3" /> Red</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-red-400">{data.summary.red}</div>
                <div className="text-xs text-muted-foreground mt-1">Critical signal OR 3+ agree</div>
              </div>
              <div className="bg-card border border-amber-400/40 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> Yellow</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-amber-300">{data.summary.yellow}</div>
                <div className="text-xs text-muted-foreground mt-1">2 signals agree</div>
              </div>
              <div className="bg-card border border-sky-400/40 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Watch</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-sky-300">{data.summary.watch}</div>
                <div className="text-xs text-muted-foreground mt-1">1 signal — info only</div>
              </div>
              <div className="bg-card border border-emerald-400/30 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Clean</div>
                <div className="text-2xl font-black tabular-nums mt-1 text-emerald-400">{data.summary.clean}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left">Product</th>
                      <th className="text-left">Lg</th>
                      <th className="text-left">Selection</th>
                      <th className="text-right">Entry</th>
                      <th className="text-right">Move ¢</th>
                      <th className="text-right">Conf</th>
                      <th className="text-right">Pre-Alert</th>
                      <th className="text-right">Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alerts.map((a) => {
                      const lvlClass = a.alertLevel === 'red'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                        : a.alertLevel === 'yellow'
                        ? 'bg-amber-400/10 text-amber-300 border border-amber-400/40'
                        : a.alertLevel === 'watch'
                        ? 'bg-sky-400/10 text-sky-300 border border-sky-400/40'
                        : 'text-emerald-400/60';
                      const Icon = a.alertLevel === 'red' ? AlertOctagon
                        : a.alertLevel === 'yellow' ? AlertTriangle
                        : a.alertLevel === 'watch' ? Activity
                        : Eye;
                      const label = a.alertLevel ? a.alertLevel.toUpperCase() : 'OK';
                      return (
                        <>
                        <tr key={a.id} className="border-t border-border/40">
                          <td className="py-2">
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase ${lvlClass}`}>
                              <Icon className="w-3 h-3" /> {label}
                            </span>
                          </td>
                          <td>{a.category}</td>
                          <td>{a.league}</td>
                          <td className="max-w-[280px] truncate" title={a.selection}>{a.selection}</td>
                          <td className="text-right tabular-nums">{a.entryOdds ?? '—'}</td>
                          <td className={`text-right tabular-nums font-bold ${a.moveCents != null && a.moveCents > 0 ? 'text-red-400' : a.moveCents != null && a.moveCents < 0 ? 'text-emerald-400' : ''}`}>
                            {a.moveCents == null ? '—' : (a.moveCents > 0 ? `+${a.moveCents}` : a.moveCents)}
                          </td>
                          <td className="text-right tabular-nums font-black">{a.currentConf ?? '—'}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{a.preAlertConf ?? '—'}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{a.startTime ? a.startTime.slice(11, 16) : '—'}</td>
                        </tr>
                        {a.reasons.length > 0 && (
                          <tr key={`${a.id}-reasons`} className="border-b border-border/20">
                            <td colSpan={9} className="pb-2 pl-1 text-[11px] text-muted-foreground italic">
                              {a.reasons.map((r, i) => <div key={i}>· {r}</div>)}
                            </td>
                          </tr>
                        )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
