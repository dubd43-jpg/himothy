"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Flame, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { type DeepPick } from "@/components/PickBreakdown";
import { YearlyMemberGate } from "@/components/YearlyMemberGate";

type Team = NonNullable<DeepPick["homeTeam"]>;
type TrendRow = {
  teamName: string;
  abbreviation: string;
  league: string;
  gameId: string;
  metric: string;
  value: string;
  pct: number;
  sample: number;
  hot: boolean;
};

const fmt = (b?: { wins: number; losses: number; pushes: number; sample: number }) => {
  if (!b) return "";
  const dec = b.wins + b.losses;
  return `${b.wins}-${b.losses}${b.pushes ? `-${b.pushes}` : ""} (${dec > 0 ? Math.round((b.wins / dec) * 100) : 0}%)`;
};
const pct = (b?: { wins: number; losses: number; sample: number }) => {
  if (!b) return 0;
  const dec = b.wins + b.losses;
  return dec > 0 ? b.wins / dec : 0;
};

function pickTeamRows(t: Team, league: string, gameId: string): TrendRow[] {
  const tr = t.trends;
  if (!tr) return [];
  const rows: TrendRow[] = [];
  const push = (metric: string, b: any, hot: boolean) => {
    if (!b || b.sample < 5) return;
    rows.push({
      teamName: t.name, abbreviation: t.abbreviation, league, gameId,
      metric, value: fmt(b), pct: pct(b), sample: b.sample, hot,
    });
  };
  // Closing-line data only spans the last 10 games — L20 / Season buckets would just
  // mirror L10 and lie to the user, so we don't surface them. Threshold is 70%+ over 10+
  // games; that's a real edge, not noise.
  push("ATS Last 10", tr.ats10, pct(tr.ats10) >= 0.7);
  push("Over Last 10", tr.ou10, pct(tr.ou10) >= 0.7);
  push("Under Last 10", tr.ou10 ? { wins: tr.ou10.losses, losses: tr.ou10.wins, pushes: tr.ou10.pushes, sample: tr.ou10.sample } : undefined, tr.ou10 ? (tr.ou10.losses / (tr.ou10.wins + tr.ou10.losses) >= 0.7) : false);
  push(t.homeAway === "home" ? "ATS at Home" : "ATS on Road", t.homeAway === "home" ? tr.atsHome : tr.atsAway, pct(t.homeAway === "home" ? tr.atsHome : tr.atsAway) >= 0.65);
  return rows.filter((r) => r.hot);
}

export default function TrendsPage() {
  const [picks, setPicks] = useState<DeepPick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/research/daily-picks?board=north-american", { cache: "no-store" });
        const d = await r.json();
        const all: DeepPick[] = [d.grandSlam, ...(d.pressurePack || []), ...(d.vip4Pack || []), ...(d.parlayPlan || []), ...(d.marquee || [])].filter(Boolean) as DeepPick[];
        setPicks(all);
      } catch {/* ignore */}
      finally { setLoading(false); }
    })();
  }, []);

  const rows = useMemo(() => {
    const all: TrendRow[] = [];
    for (const p of picks) {
      all.push(...pickTeamRows(p.homeTeam, p.league, p.gameId));
      all.push(...pickTeamRows(p.awayTeam, p.league, p.gameId));
    }
    return all.sort((a, b) => b.pct - a.pct);
  }, [picks]);

  const ats = rows.filter((r) => r.metric.startsWith("ATS"));
  const overs = rows.filter((r) => r.metric.startsWith("Over"));
  const unders = rows.filter((r) => r.metric.startsWith("Under"));

  const Section = ({ title, icon: Icon, accent, items, empty }: { title: string; icon: any; accent: string; items: TrendRow[]; empty: string }) => (
    <section>
      <div className={`mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest ${accent}`}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] py-6 text-center text-xs text-white/40">{empty}</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 12).map((r, i) => (
            <Link key={i} href={`/pick/${r.gameId}?board=north-american&from=/trends`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-black text-white/30 w-6">{i + 1}.</span>
                <div className="min-w-0">
                  <div className="text-sm font-black truncate">{r.teamName}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">{r.league} · {r.metric}</div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-black tabular-nums">{r.value}</div>
                <div className="text-[10px] text-white/30">{r.sample} games</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-5xl px-5 py-8 md:px-8 flex flex-col gap-7">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={34} height={34} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <div className="border-b border-white/5 pb-6">
          <h1 className="flex items-center gap-3 text-3xl md:text-4xl font-black uppercase tracking-tight">
            <Flame className="h-8 w-8 text-amber-400" /> Hot Tendencies
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/50 leading-relaxed">
            Teams on tonight's board with a real recent edge — 70%+ ATS or O/U hit rate over the last 10 games. Real closing lines, no spin.
          </p>
        </div>

        <YearlyMemberGate
          toolName="Hot Tendencies"
          toolDescription="Real-time ATS and Over/Under tendency tracking — 65%+ hit-rate teams on tonight's board, computed from multi-book closing-line data."
        >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin" />
            <span className="text-sm font-semibold text-white/40">Scanning recent results...</span>
          </div>
        ) : (
          <div className="space-y-8">
            <Section title="ATS — Teams Covering" icon={TrendingUp} accent="text-emerald-400" items={ats}
              empty="No team on tonight's board has a 65%+ ATS run." />
            <Section title="Going Over the Total" icon={Activity} accent="text-sky-400" items={overs}
              empty="No teams trending hard to the OVER tonight." />
            <Section title="Going Under the Total" icon={TrendingDown} accent="text-rose-400" items={unders}
              empty="No teams trending hard to the UNDER tonight." />
          </div>
        )}
        </YearlyMemberGate>
      </div>
    </div>
  );
}
