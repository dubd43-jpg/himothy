import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Track Record',
  description: "HIMOTHY Plays and Parlays' publicly graded record — units won/lost, ROI, win rate, and per-product performance over the lifetime, last 30 days, and last 7 days. Every pick graded honestly.",
  path: '/track-record',
});

interface Bucket {
  picks: number; wins: number; losses: number; pushes: number;
  units: number; winRate: number | null; roi: number | null;
}
interface TrackRecordData {
  success: boolean;
  asOf: string;
  lifetime: Bucket;
  last30: Bucket;
  last7: Bucket;
  streak: { type: 'win' | 'loss' | 'push' | null; length: number };
  byProduct: Record<string, Bucket>;
  byLeague: Record<string, Bucket>;
  recentForm: Array<{ date: string; category: string; league: string; result: string; odds: string | null }>;
}

async function fetchTrackRecord(): Promise<TrackRecordData | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://himothypicks.com';
    const res = await fetch(`${base}/api/track-record`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data : null;
  } catch {
    return null;
  }
}

function fmtUnits(u: number): string {
  if (u > 0) return `+${u.toFixed(2)}u`;
  if (u < 0) return `${u.toFixed(2)}u`;
  return '0.00u';
}

function fmtPct(p: number | null, withSign = false): string {
  if (p == null) return '—';
  return `${withSign && p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

function BucketCard({ title, b }: { title: string; b: Bucket }) {
  const unitsColor = b.units > 0 ? 'text-emerald-400' : b.units < 0 ? 'text-red-400' : 'text-muted-foreground';
  const roiColor = b.roi != null && b.roi > 0 ? 'text-emerald-400' : b.roi != null && b.roi < 0 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className={`text-4xl font-black tabular-nums ${unitsColor}`}>{fmtUnits(b.units)}</div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground uppercase font-bold tracking-wider text-[10px]">Picks</div>
          <div className="text-foreground font-black text-lg tabular-nums">{b.picks}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase font-bold tracking-wider text-[10px]">Win Rate</div>
          <div className="text-foreground font-black text-lg tabular-nums">{fmtPct(b.winRate)}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase font-bold tracking-wider text-[10px]">ROI</div>
          <div className={`font-black text-lg tabular-nums ${roiColor}`}>{fmtPct(b.roi, true)}</div>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/40">
        Record: {b.wins}-{b.losses}{b.pushes > 0 ? `-${b.pushes}` : ''}
      </div>
    </div>
  );
}

function TableRow({ label, b }: { label: string; b: Bucket }) {
  const unitsColor = b.units > 0 ? 'text-emerald-400' : b.units < 0 ? 'text-red-400' : 'text-muted-foreground';
  const Icon = b.units > 0 ? TrendingUp : b.units < 0 ? TrendingDown : Minus;
  return (
    <tr className="border-t border-border/40">
      <td className="py-3 font-black uppercase text-sm tracking-wider">{label}</td>
      <td className="text-right tabular-nums">{b.picks}</td>
      <td className="text-right tabular-nums">{b.wins}-{b.losses}{b.pushes > 0 ? `-${b.pushes}` : ''}</td>
      <td className="text-right tabular-nums">{fmtPct(b.winRate)}</td>
      <td className={`text-right tabular-nums font-black inline-flex items-center gap-1 justify-end w-full ${unitsColor}`}>
        <Icon className="w-3.5 h-3.5" /> {fmtUnits(b.units)}
      </td>
      <td className="text-right tabular-nums font-black">{fmtPct(b.roi, true)}</td>
    </tr>
  );
}

export default async function TrackRecordPage() {
  const data = await fetchTrackRecord();
  if (!data) {
    return (
      <div className="min-h-screen bg-background text-foreground pb-24">
        <div className="px-6 lg:px-10 py-10 max-w-3xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Home</Link>
          <h1 className="text-4xl font-black uppercase mt-6">Track Record</h1>
          <p className="text-muted-foreground mt-3">Track record temporarily unavailable. Check back shortly.</p>
        </div>
      </div>
    );
  }

  const productEntries = Object.entries(data.byProduct).sort((a, b) => b[1].picks - a[1].picks);
  const leagueEntries = Object.entries(data.byLeague).sort((a, b) => b[1].picks - a[1].picks);

  const streakColor = data.streak.type === 'win' ? 'text-emerald-400' : data.streak.type === 'loss' ? 'text-red-400' : 'text-muted-foreground';
  const streakLabel = data.streak.type === 'win' ? 'WIN streak' : data.streak.type === 'loss' ? 'LOSS streak' : 'No streak';

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-5xl mx-auto space-y-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <div className="border-b border-border pb-8 space-y-3">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Track Record</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every pick HIMOTHY posts is recorded to the public ledger and graded against the official result.
            No deleted losses. No silent edits. Updated continuously as games settle.
          </p>
          {data.streak.type && (
            <p className={`text-sm font-black uppercase tracking-widest ${streakColor}`}>
              Current: {data.streak.length}-game {streakLabel}
            </p>
          )}
          <p className="text-xs text-muted-foreground/60">
            Units assume flat 1-unit risk per pick. ROI = units returned per unit risked. As of {new Date(data.asOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} ET.
          </p>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BucketCard title="Last 7 Days" b={data.last7} />
          <BucketCard title="Last 30 Days" b={data.last30} />
          <BucketCard title="Lifetime" b={data.lifetime} />
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">By Product</h2>
          <div className="bg-card border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                <tr><th className="text-left p-3">Product</th><th className="text-right">Picks</th><th className="text-right">Record</th><th className="text-right">Win %</th><th className="text-right">Units</th><th className="text-right">ROI</th></tr>
              </thead>
              <tbody>
                {productEntries.map(([k, v]) => <TableRow key={k} label={k.replace(/_/g, ' ')} b={v} />)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">By League</h2>
          <div className="bg-card border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                <tr><th className="text-left p-3">League</th><th className="text-right">Picks</th><th className="text-right">Record</th><th className="text-right">Win %</th><th className="text-right">Units</th><th className="text-right">ROI</th></tr>
              </thead>
              <tbody>
                {leagueEntries.map(([k, v]) => <TableRow key={k} label={k} b={v} />)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Last 20 Graded Picks</h2>
          <div className="bg-card border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                <tr><th className="text-left p-3">Date</th><th className="text-left">Product</th><th className="text-left">League</th><th className="text-right">Odds</th><th className="text-right">Result</th></tr>
              </thead>
              <tbody>
                {data.recentForm.map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="p-3 tabular-nums">{r.date}</td>
                    <td>{r.category.replace(/_/g, ' ')}</td>
                    <td>{r.league}</td>
                    <td className="text-right tabular-nums">{r.odds || '—'}</td>
                    <td className={`text-right font-black uppercase ${r.result === 'win' ? 'text-emerald-400' : r.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}`}>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="text-xs text-muted-foreground/60 border-t border-border pt-6">
          21+ only. Sports betting involves substantial risk and is not suitable for all bettors. Past performance is not a guarantee of future results. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
        </div>
      </div>
    </div>
  );
}
