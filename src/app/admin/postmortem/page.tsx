"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

const SECRET_KEY = "himothy_admin_secret";

const CATEGORIES = ['', 'GRAND_SLAM', 'PRESSURE_PACK', 'VIP_4_PACK', 'PARLAY_PLAN', 'MARQUEE', 'ASLEEP_PICKS', 'NRFI', 'VALUE_PLAYS'];

type Pick = {
  id: string;
  date: string;
  category: string | null;
  league: string | null;
  selection: string;
  odds: string | null;
  result: string | null;
  pickedSide: 'home' | 'away' | null;
  homeScore: number | null;
  awayScore: number | null;
  scoreGap: number | null;
  oppEngineScore: number | null;
  confidenceAtPublish: number | null;
  signalsPicked: any;
  signalsOpp: any;
  pickedInjuries: any;
  oppInjuries: any;
  starOutPick: string | null;
  starOutOpp: string | null;
  dataQuality: number | null;
  game: {
    home: string; away: string;
    homeFinal: number; awayFinal: number;
    total: number;
    pickedTeamFinal: number; oppTeamFinal: number;
    rawMargin: number;
    completed: boolean;
  } | null;
  coverNote: string | null;
  flippedSideWouldHaveWon: boolean | null;
  verdict: string;
};

type ApiResp = {
  success: boolean;
  summary?: { total: number; wins: number; losses: number; flipWouldHaveWon: number; flipRate: number; withEvidence: number; evidenceCoverage: number };
  picks?: Pick[];
  error?: string;
};

export default function PostmortemPage() {
  const [secret, setSecret] = useState("");
  const [since, setSince] = useState("2026-05-27");
  const [category, setCategory] = useState("");
  const [resultFilter, setResultFilter] = useState("loss");
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SECRET_KEY) : "";
    if (saved) setSecret(saved);
  }, []);

  const run = async () => {
    if (!secret) { alert("Set the admin secret first."); return; }
    localStorage.setItem(SECRET_KEY, secret);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ since });
      if (category) qs.set("category", category);
      if (resultFilter) qs.set("result", resultFilter);
      const r = await fetch(`/api/admin/postmortem?${qs}`, { headers: { "x-admin-secret": secret } });
      setData(await r.json());
    } catch (e: any) {
      setData({ success: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500" />
        <h1 className="text-2xl font-black">Loss Postmortem</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Every graded pick since the chosen date. Each loss shows what the engine knew on
        BOTH sides at publish + the actual game outcome — so you can see whether we should
        have flipped.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 border rounded-lg bg-card">
        <input
          type="password" placeholder="Admin secret"
          value={secret} onChange={(e) => setSecret(e.target.value)}
          className="px-3 py-2 border rounded bg-background text-sm"
        />
        <input
          type="date" value={since} onChange={(e) => setSince(e.target.value)}
          className="px-3 py-2 border rounded bg-background text-sm"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 border rounded bg-background text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "All categories"}</option>)}
        </select>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="px-3 py-2 border rounded bg-background text-sm">
          <option value="loss">Losses only</option>
          <option value="win">Wins only</option>
          <option value="">All graded</option>
        </select>
        <button onClick={run} disabled={loading}
          className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {data?.error && <div className="p-3 border border-red-500/40 text-red-500 rounded">{data.error}</div>}

      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total graded" value={`${data.summary.total}`} />
          <Stat label="W-L" value={`${data.summary.wins}-${data.summary.losses}`} />
          <Stat label="FLIP would have won" value={`${data.summary.flipWouldHaveWon} / ${data.summary.losses} (${data.summary.flipRate}%)`} accent={data.summary.flipRate >= 50 ? "danger" : "muted"} />
          <Stat label="Evidence coverage" value={`${data.summary.withEvidence} / ${data.summary.total} (${data.summary.evidenceCoverage}%)`} />
        </div>
      )}

      {data?.picks?.map((p) => {
        const isLoss = p.result === "loss";
        const flip = p.flippedSideWouldHaveWon;
        return (
          <div key={p.id} className={`border rounded-lg p-4 ${isLoss ? "border-red-500/40 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
            <button onClick={() => toggle(p.id)} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{p.date} · {p.category} · {p.league}</div>
                  <div className="font-bold mt-1">
                    {isLoss ? <TrendingDown className="inline w-4 h-4 text-red-500 mr-1" /> : <TrendingUp className="inline w-4 h-4 text-green-500 mr-1" />}
                    {p.selection} <span className="text-muted-foreground font-normal">({p.odds})</span>
                  </div>
                  {p.game && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {p.game.away} {p.game.awayFinal}-{p.game.homeFinal} {p.game.home} · {p.coverNote}
                    </div>
                  )}
                  {flip && <div className="text-xs font-bold text-red-400 mt-1">FLIP would have won outright.</div>}
                </div>
                <div className="text-right text-xs">
                  {p.scoreGap != null && (
                    <div className="font-mono">
                      <span className="text-green-400">{p.homeScore}</span> vs <span className="text-red-400">{p.awayScore}</span>
                      <div className="text-muted-foreground">gap {p.scoreGap}</div>
                    </div>
                  )}
                </div>
              </div>
            </button>
            {expanded.has(p.id) && (
              <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                <Detail label="Verdict" value={p.verdict} />
                <Detail label="Picked side" value={p.pickedSide ?? "—"} />
                <Detail label="Confidence at publish" value={p.confidenceAtPublish?.toString() ?? "—"} />
                <Detail label="Data quality" value={p.dataQuality?.toString() ?? "—"} />
                {p.starOutPick && <Detail label="⚠ Key player OUT (our side)" value={p.starOutPick} />}
                {p.starOutOpp && <Detail label="Key player OUT (opp)" value={p.starOutOpp} />}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <SignalBlock title="Our side signals" data={p.signalsPicked} injuries={p.pickedInjuries} />
                  <SignalBlock title="Opponent signals" data={p.signalsOpp} injuries={p.oppInjuries} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "danger" | "muted" }) {
  const color = accent === "danger" ? "text-red-400" : accent === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-black mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-mono text-right">{value}</span></div>
  );
}

function SignalBlock({ title, data, injuries }: { title: string; data: any; injuries: any }) {
  if (!data) return <div className="text-muted-foreground">{title}: no evidence captured</div>;
  return (
    <div className="border rounded p-2 bg-background/50">
      <div className="font-bold text-xs mb-1">{title}</div>
      <SignalRow label="WP gap" value={data.winProbabilityGap?.toFixed(1)} />
      <SignalRow label="ATS%" value={data.atsCoverPct?.toFixed(1)} />
      <SignalRow label="ATS H/A%" value={data.atsHomeAwayCoverPct?.toFixed(1)} />
      <SignalRow label="Line value gap" value={data.lineValueGap?.toFixed(1)} />
      <SignalRow label="Streak" value={data.recentFormStreak} />
      <SignalRow label="Avg margin L10" value={data.pickedAvgMargin10 != null ? data.pickedAvgMargin10.toFixed(1) : null} />
      <SignalRow label="Sharp aligned" value={data.sharpMoneyAligned ? "yes" : "no"} />
      <SignalRow label="Reverse line" value={data.reverseLineMovement ? "yes" : "no"} />
      <SignalRow label="Rest edge" value={data.restAdvantage ? "yes" : "no"} />
      <SignalRow label="Key inj. on side" value={data.keyInjuryOnPickSide ? "yes" : "no"} />
      <SignalRow label="Sharp bonus" value={data.sharpScoreBonus} />
      {data.oddsBucketSample > 0 && (
        <SignalRow label={`Bucket edge (${data.oddsBucketSample}g)`} value={`${data.oddsBucketEdgePct > 0 ? '+' : ''}${data.oddsBucketEdgePct?.toFixed(1)}pp`} />
      )}
      {data.hasOpeningLine && (
        <>
          <SignalRow label="ML move toward us" value={`${data.mlMovementForSide > 0 ? '+' : ''}${data.mlMovementForSide}c`} />
          {data.spreadMovementForSide !== 0 && (
            <SignalRow label="Spread move toward us" value={`${data.spreadMovementForSide > 0 ? '+' : ''}${data.spreadMovementForSide?.toFixed(1)}`} />
          )}
          {data.totalMovement !== 0 && (
            <SignalRow label="Total move" value={`${data.totalMovement > 0 ? '+' : ''}${data.totalMovement?.toFixed(1)}`} />
          )}
        </>
      )}
      {data.tendencyFirstFrameSample > 0 && (
        <>
          <SignalRow label="1st-inn scored %" value={data.tendencyFirstFrameScored?.toFixed(0)} />
          <SignalRow label="1st-inn allowed %" value={data.tendencyFirstFrameAllowed?.toFixed(0)} />
          {data.tendencyF5TotalAvg > 0 && <SignalRow label="F5 avg total" value={data.tendencyF5TotalAvg?.toFixed(1)} />}
        </>
      )}
      {data.pickedPitcherStarts > 0 && (
        <>
          <SignalRow label={`SP ERA L${data.pickedPitcherStarts}`} value={data.pickedPitcherEraL5?.toFixed(2)} />
          {data.pickedPitcherWhipL5 > 0 && <SignalRow label="SP WHIP L5" value={data.pickedPitcherWhipL5?.toFixed(2)} />}
        </>
      )}
      {data.pickedBullpenAllowed > 0 && (
        <SignalRow label="Bullpen 7+ R/g" value={data.pickedBullpenAllowed?.toFixed(1)} />
      )}
      {data.pickedPctBlewLateLead > 0 && (
        <SignalRow label="Blew late lead %" value={`${Math.round(data.pickedPctBlewLateLead)}%`} />
      )}
      {data.pickedAvgQ1Scored > 0 && (
        <>
          <SignalRow label="Q1 scored avg" value={data.pickedAvgQ1Scored?.toFixed(1)} />
          <SignalRow label="Q1 allowed avg" value={data.pickedAvgQ1Allowed?.toFixed(1)} />
          <SignalRow label="Lead-after-Q1 %" value={`${Math.round(data.pickedPctLeadAfterQ1)}%`} />
          <SignalRow label="H1 scored avg" value={data.pickedAvgH1Scored?.toFixed(1)} />
          <SignalRow label="Lead-after-H1 %" value={`${Math.round(data.pickedPctLeadAfterH1)}%`} />
        </>
      )}
      {injuries && (injuries.out?.length || injuries.doubtful?.length) ? (
        <div className="mt-1 text-[11px] text-red-300">
          OUT: {injuries.out?.join(", ") || "—"} · DOUBTFUL: {injuries.doubtful?.join(", ") || "—"}
        </div>
      ) : null}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: any }) {
  if (value == null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-2 text-[11px]"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value}</span></div>
  );
}
