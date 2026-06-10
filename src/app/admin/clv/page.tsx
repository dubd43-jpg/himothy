"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

interface ClvPick {
  id: string;
  date: string;
  category: string;
  league: string;
  selection: string;
  result: string;
  openOdds: string | null;
  entryOdds: string | null;
  closingOdds: string | null;
  clvPct: number | null;
  lineMoveAmerican: number | null;
}

interface ClvData {
  success: boolean;
  sinceDays: number;
  summary: {
    totalPicks: number; decidedPicks: number;
    wins: number; losses: number; pushes: number;
    winRate: number | null;
    clvCoverage: number;
    avgClvPct: number | null;
    interpretation: string;
  };
  byCategory: Record<string, { count: number; avgClv: number | null; winRate: number | null }>;
  byLeague: Record<string, { count: number; avgClv: number | null; winRate: number | null }>;
  picks: ClvPick[];
}

export default function ClvPage() {
  const [secret, setSecret] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<ClvData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem(SECRET_KEY) || '';
      setSecret(s);
    }
  }, []);

  useEffect(() => {
    if (secret) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, days]);

  async function load() {
    if (!secret) { setError('Enter admin secret'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/clv?days=${days}`, {
        headers: { 'x-admin-secret': secret },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'failed');
      setData(json);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function saveSecret(s: string) {
    setSecret(s);
    if (typeof window !== 'undefined') localStorage.setItem(SECRET_KEY, s);
  }

  function ClvBadge({ clv }: { clv: number | null }) {
    if (clv == null) return <span className="text-white/30 text-xs">—</span>;
    const color = clv >= 1 ? 'text-emerald-400' : clv <= -1 ? 'text-red-400' : 'text-amber-300';
    const Icon = clv >= 1 ? TrendingUp : clv <= -1 ? TrendingDown : Minus;
    return (
      <span className={`inline-flex items-center gap-1 font-black tabular-nums ${color}`}>
        <Icon className="w-3.5 h-3.5" />
        {clv >= 0 ? '+' : ''}{clv.toFixed(2)}%
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Closing Line Value</h1>
            <p className="text-sm text-muted-foreground mt-1">CLV is the only metric that tells you long-term if your process is actually sharp. Positive = beating the close.</p>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground font-bold uppercase tracking-widest">Days</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-card border border-border rounded px-2 py-1 text-sm">
                {[7, 14, 30, 60, 90, 180].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase px-3 py-2 rounded text-xs disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
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
            {/* Headline cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Avg CLV</div>
                <div className="mt-1"><ClvBadge clv={data.summary.avgClvPct} /></div>
                <div className="text-xs text-muted-foreground mt-2">{data.summary.interpretation}</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Win Rate</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.winRate?.toFixed(1) ?? '—'}%</div>
                <div className="text-xs text-muted-foreground mt-2">{data.summary.wins}-{data.summary.losses}-{data.summary.pushes} over {data.sinceDays}d</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Picks</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.totalPicks}</div>
                <div className="text-xs text-muted-foreground mt-2">{data.summary.decidedPicks} decided</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CLV Coverage</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.summary.clvCoverage.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground mt-2">of picks have a close snapshot</div>
              </div>
            </div>

            {/* By category */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">By Product</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr><th className="text-left py-2">Product</th><th className="text-right">Picks</th><th className="text-right">Avg CLV</th><th className="text-right">Win %</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byCategory).sort((a, b) => b[1].count - a[1].count).map(([cat, v]) => (
                      <tr key={cat} className="border-t border-border/40">
                        <td className="py-2 font-bold">{cat}</td>
                        <td className="text-right tabular-nums">{v.count}</td>
                        <td className="text-right"><ClvBadge clv={v.avgClv} /></td>
                        <td className="text-right tabular-nums">{v.winRate?.toFixed(1) ?? '—'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By league */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">By League</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr><th className="text-left py-2">League</th><th className="text-right">Picks</th><th className="text-right">Avg CLV</th><th className="text-right">Win %</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byLeague).sort((a, b) => b[1].count - a[1].count).map(([lg, v]) => (
                      <tr key={lg} className="border-t border-border/40">
                        <td className="py-2 font-bold">{lg}</td>
                        <td className="text-right tabular-nums">{v.count}</td>
                        <td className="text-right"><ClvBadge clv={v.avgClv} /></td>
                        <td className="text-right tabular-nums">{v.winRate?.toFixed(1) ?? '—'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per pick */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Recent Picks</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Date</th>
                      <th className="text-left">Product</th>
                      <th className="text-left">Lg</th>
                      <th className="text-left">Selection</th>
                      <th className="text-right">Open</th>
                      <th className="text-right">Entry</th>
                      <th className="text-right">Close</th>
                      <th className="text-right">CLV</th>
                      <th className="text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.picks.map((p) => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="py-2 tabular-nums">{p.date}</td>
                        <td>{p.category}</td>
                        <td>{p.league}</td>
                        <td className="max-w-[280px] truncate" title={p.selection}>{p.selection}</td>
                        <td className="text-right tabular-nums">{p.openOdds ?? '—'}</td>
                        <td className="text-right tabular-nums">{p.entryOdds ?? '—'}</td>
                        <td className="text-right tabular-nums">{p.closingOdds ?? '—'}</td>
                        <td className="text-right"><ClvBadge clv={p.clvPct} /></td>
                        <td className={`text-right font-black ${p.result === 'win' ? 'text-emerald-400' : p.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}`}>{p.result?.toUpperCase()}</td>
                      </tr>
                    ))}
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
