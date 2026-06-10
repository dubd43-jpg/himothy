"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Minus } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

interface CalibrationBucket {
  confidenceBand: string; picks: number; wins: number; losses: number; pushes: number;
  predictedWinRate: number; actualWinRate: number | null; miscalibration: number | null; units: number;
}
interface SignalRoiRow {
  signalName: string;
  picksWithSignal: number; picksWithoutSignal: number;
  winRateWith: number | null; winRateWithout: number | null; winRateDelta: number | null;
  unitsWith: number; unitsWithout: number; roiDelta: number | null;
  verdict: 'predictive' | 'neutral' | 'noise';
}
interface TierRoiRow {
  category: string; picks: number; wins: number; losses: number; pushes: number;
  units: number; winRate: number | null; roi: number | null;
}
interface BacktestResp {
  success: boolean; asOf: string; windowDays: number;
  totalPicks: number; totalDecided: number;
  calibration: CalibrationBucket[];
  signalRoi: SignalRoiRow[];
  tierRoi: TierRoiRow[];
  recommendations: string[];
}

function fmtPct(p: number | null, withSign = false): string {
  if (p == null) return '—';
  return `${withSign && p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}
function fmtUnits(u: number): string {
  if (u > 0) return `+${u.toFixed(2)}u`;
  if (u < 0) return `${u.toFixed(2)}u`;
  return '0.00u';
}

export default function BacktestPage() {
  const [secret, setSecret] = useState('');
  const [days, setDays] = useState(60);
  const [data, setData] = useState<BacktestResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setSecret(localStorage.getItem(SECRET_KEY) || '');
  }, []);
  useEffect(() => { if (secret) load(); /* eslint-disable-next-line */ }, [secret, days]);

  async function load() {
    if (!secret) { setError('Enter admin secret'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/backtest?days=${days}`, { headers: { 'x-admin-secret': secret } });
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
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Backtest</h1>
            <p className="text-sm text-muted-foreground mt-1">Win-rate attribution: which signals actually predict winners, and is the engine calibrated?</p>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground font-bold uppercase tracking-widest">Days</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-card border border-border rounded px-2 py-1 text-sm">
                {[7, 14, 30, 60, 90, 180, 365].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase px-3 py-2 rounded text-xs disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Run
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
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Window</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.windowDays}d</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Graded Picks</div>
                <div className="text-2xl font-black tabular-nums mt-1">{data.totalDecided}</div>
                <div className="text-xs text-muted-foreground mt-1">{data.totalPicks} total</div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 md:col-span-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bottom Line</div>
                <div className="text-sm font-bold mt-1 leading-relaxed">{data.recommendations[0] || '—'}</div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-amber-400/5 border border-amber-400/30 rounded-2xl p-4 space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-amber-300">Engine Recommendations</div>
              <ul className="text-sm leading-relaxed text-amber-100/90 space-y-1.5">
                {data.recommendations.map((r, i) => <li key={i} className="flex gap-2"><span className="text-amber-300 shrink-0">▸</span><span>{r}</span></li>)}
              </ul>
            </div>

            {/* Calibration */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Confidence Calibration</h2>
              <p className="text-xs text-muted-foreground mb-3">A perfectly-calibrated 85 should win 85% of the time. Negative miscalibration = OVERCONFIDENT.</p>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left py-2">Conf Band</th><th className="text-right">Picks</th><th className="text-right">Predicted Win%</th><th className="text-right">Actual Win%</th><th className="text-right">Miscalibration</th><th className="text-right">Units</th></tr>
                </thead>
                <tbody>
                  {data.calibration.map((b) => {
                    const miscolor = b.miscalibration == null ? '' : b.miscalibration < -5 ? 'text-red-400' : b.miscalibration > 5 ? 'text-emerald-400' : 'text-muted-foreground';
                    return (
                      <tr key={b.confidenceBand} className="border-t border-border/40">
                        <td className="py-2 font-bold">{b.confidenceBand}</td>
                        <td className="text-right tabular-nums">{b.picks}</td>
                        <td className="text-right tabular-nums">{fmtPct(b.predictedWinRate)}</td>
                        <td className="text-right tabular-nums">{fmtPct(b.actualWinRate)}</td>
                        <td className={`text-right tabular-nums font-black ${miscolor}`}>{b.miscalibration == null ? '—' : `${b.miscalibration > 0 ? '+' : ''}${b.miscalibration.toFixed(1)}pt`}</td>
                        <td className={`text-right tabular-nums font-bold ${b.units > 0 ? 'text-emerald-400' : b.units < 0 ? 'text-red-400' : ''}`}>{fmtUnits(b.units)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Signal ROI */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Signal Effectiveness</h2>
              <p className="text-xs text-muted-foreground mb-3">For each signal, win rate when it fires vs when it doesn't. PREDICTIVE = weight it more. NOISE = remove or invert.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Verdict</th>
                      <th className="text-left">Signal</th>
                      <th className="text-right">With (n)</th>
                      <th className="text-right">Without (n)</th>
                      <th className="text-right">Win% Δ</th>
                      <th className="text-right">ROI Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.signalRoi.map((s) => {
                      const VerdictIcon = s.verdict === 'predictive' ? TrendingUp : s.verdict === 'noise' ? TrendingDown : Minus;
                      const vColor = s.verdict === 'predictive' ? 'text-emerald-400' : s.verdict === 'noise' ? 'text-red-400' : 'text-muted-foreground';
                      return (
                        <tr key={s.signalName} className="border-t border-border/40">
                          <td className="py-2"><span className={`inline-flex items-center gap-1 ${vColor}`}><VerdictIcon className="w-3.5 h-3.5" /><span className="text-[10px] font-black uppercase">{s.verdict}</span></span></td>
                          <td className="font-mono text-xs">{s.signalName}</td>
                          <td className="text-right tabular-nums">{s.picksWithSignal}</td>
                          <td className="text-right tabular-nums">{s.picksWithoutSignal}</td>
                          <td className={`text-right tabular-nums font-bold ${(s.winRateDelta ?? 0) > 0 ? 'text-emerald-400' : (s.winRateDelta ?? 0) < 0 ? 'text-red-400' : ''}`}>{s.winRateDelta == null ? '—' : `${s.winRateDelta > 0 ? '+' : ''}${s.winRateDelta.toFixed(1)}pt`}</td>
                          <td className={`text-right tabular-nums font-bold ${(s.roiDelta ?? 0) > 0 ? 'text-emerald-400' : (s.roiDelta ?? 0) < 0 ? 'text-red-400' : ''}`}>{s.roiDelta == null ? '—' : `${s.roiDelta > 0 ? '+' : ''}${s.roiDelta.toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tier ROI */}
            <div className="bg-card border border-border rounded-2xl p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">By Product Tier</h2>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left py-2">Product</th><th className="text-right">Picks</th><th className="text-right">Record</th><th className="text-right">Win%</th><th className="text-right">Units</th><th className="text-right">ROI</th></tr>
                </thead>
                <tbody>
                  {data.tierRoi.map((t) => {
                    const roiColor = (t.roi ?? 0) > 0 ? 'text-emerald-400' : (t.roi ?? 0) < 0 ? 'text-red-400' : '';
                    return (
                      <tr key={t.category} className="border-t border-border/40">
                        <td className="py-2 font-bold">{t.category.replace(/_/g, ' ')}</td>
                        <td className="text-right tabular-nums">{t.picks}</td>
                        <td className="text-right tabular-nums">{t.wins}-{t.losses}{t.pushes > 0 ? `-${t.pushes}` : ''}</td>
                        <td className="text-right tabular-nums">{fmtPct(t.winRate)}</td>
                        <td className={`text-right tabular-nums font-bold ${(t.units ?? 0) > 0 ? 'text-emerald-400' : (t.units ?? 0) < 0 ? 'text-red-400' : ''}`}>{fmtUnits(t.units)}</td>
                        <td className={`text-right tabular-nums font-black ${roiColor}`}>{fmtPct(t.roi, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
