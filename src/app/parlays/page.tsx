"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bomb, BarChart3, Plus, X, Copy, ExternalLink, CheckSquare, Zap, TrendingUp } from "lucide-react";
import { hailmaryParlays, tenDollarParlayPlan, overseasPicks, overnightBets } from "@/lib/picksData";
import { PickCard } from "@/components/PickCard";

interface ParlayLeg {
  id: string;
  label: string;
  game: string;
  odds: string;
  sport: string;
  externalLink: string;
  status: string;
  startTime: string;
  oddsSource?: string | null;
  lineTimestampUtc?: string | null;
  freshnessMinutes?: number;
  oddsAvailable?: boolean;
  research?: {
    edgeScore?: number;
    marketType?: string | null;
    selection?: string | null;
    reasoningSummary?: string | null;
  } | null;
}

function calcParlayOdds(legs: ParlayLeg[]) {
  const pricedLegs = legs.filter((leg) => /^[-+]?\d+$/.test(leg.odds));
  if (pricedLegs.length === 0) return null;

  let decimal = 1;
  for (const leg of pricedLegs) {
    const o = Number.parseInt(leg.odds, 10);
    const d = o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
    decimal *= d;
  }
  const american = decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
  return { decimal: decimal.toFixed(2), american };
}

export default function ParlayCenter() {
  const [suggestedLegs, setSuggestedLegs] = useState<ParlayLeg[]>([]);
  const [builderLegs, setBuilderLegs] = useState<ParlayLeg[]>([]);
  const [stake, setStake] = useState("10");
  const [copied, setCopied] = useState(false);
  const [selectedPicks, setSelectedPicks] = useState<any[]>([]);
  const [isLoadingLegs, setIsLoadingLegs] = useState(true);
  const [refreshMeta, setRefreshMeta] = useState<{ generatedAt?: string; lineChanges?: number; researchReady?: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchRealGames = async () => {
      try {
        const res = await fetch("/api/games/today", { cache: 'no-store' });
        const data = await res.json();

        if (!mounted) return;

        if (data.success && Array.isArray(data.suggestedLegs)) {
          setSuggestedLegs(data.suggestedLegs);
          setRefreshMeta({
            generatedAt: data?.refresh?.generatedAt,
            lineChanges: data?.refresh?.lineChanges,
            researchReady: data?.refresh?.researchReady,
          });
        }
      } catch (error) {
        console.error("Failed to load today's games", error);
      } finally {
        if (mounted) setIsLoadingLegs(false);
      }
    };

    fetchRealGames();
    const interval = setInterval(fetchRealGames, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const toggleLeg = (leg: ParlayLeg) => {
    if (builderLegs.find((l) => l.id === leg.id)) {
      setBuilderLegs(builderLegs.filter((l) => l.id !== leg.id));
    } else {
      setBuilderLegs([...builderLegs, leg]);
    }
  };

  const parlayOdds = calcParlayOdds(builderLegs);
  const payout = parlayOdds
    ? ((parseFloat(stake) || 0) * parseFloat(parlayOdds.decimal)).toFixed(2)
    : "0.00";

  const copySlip = () => {
    const text = `HIMOTHY PARLAY SLIP\n--------------------\n` +
      builderLegs.map((l) => `• ${l.game}\n  ${l.label} (${l.odds})`).join("\n\n") +
      `\n\nParlay Odds: ${parlayOdds?.american}\nStake: $${stake} → Payout: $${payout}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePick = (pick: any) => {
    if (selectedPicks.find((p) => p.selection === pick.selection)) {
      setSelectedPicks(selectedPicks.filter((p) => p.selection !== pick.selection));
    } else {
      setSelectedPicks([...selectedPicks, pick]);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-36">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-10">

        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        {/* Header */}
        <div className="border-b border-border pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black mb-4 border border-primary/20 uppercase tracking-widest">
            <Bomb className="w-3.5 h-3.5" /> Parlay Central
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-3">
            Parlay <span className="text-primary">Center</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
            Build your own multi-leg slip, grab today&apos;s pre-built parlays, or mix our picks into a custom ticket. All odds calculated live.
          </p>
        </div>

        {/* ── PARLAY BUILDER ──────────────────────────── */}
        <section>
          <h2 className="text-2xl font-black uppercase mb-1 flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" /> Build Your Parlay
          </h2>
          <p className="text-muted-foreground text-sm mb-2">Tap today&apos;s real games below to add legs. Odds appear when the odds feed is available.</p>
          {refreshMeta && (
            <p className="text-[11px] font-bold text-muted-foreground mb-6 uppercase tracking-widest">
              Live Sync: {refreshMeta.researchReady ?? 0} research-ready · {refreshMeta.lineChanges ?? 0} line changes · {refreshMeta.generatedAt ? new Date(refreshMeta.generatedAt).toLocaleTimeString() : '--'}
            </p>
          )}

          {/* Leg Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {isLoadingLegs ? (
              <div className="col-span-full border border-border rounded-xl p-4 text-sm text-muted-foreground">Loading today&apos;s games...</div>
            ) : suggestedLegs.length === 0 ? (
              <div className="col-span-full border border-border rounded-xl p-4 text-sm text-muted-foreground">No verified games found right now. Check back shortly.</div>
            ) : suggestedLegs.map((leg) => {
              const active = !!builderLegs.find((l) => l.id === leg.id);
              return (
                <button
                  key={leg.id}
                  onClick={() => toggleLeg(leg)}
                  className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all
                    ${active
                      ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(212,168,67,0.2)]"
                      : "border-border bg-card hover:border-primary/40"
                    }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{leg.sport}</span>
                    {active && <CheckSquare className="w-4 h-4 text-primary" />}
                    {!active && <Plus className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <span className="font-black text-sm text-foreground leading-tight">{leg.label}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{leg.game}</span>
                  <span className="text-primary font-black text-sm">{leg.odds}</span>
                  {leg.oddsSource && (
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {leg.oddsSource} · {leg.freshnessMinutes ?? 0}m ago
                    </span>
                  )}
                  {leg.research?.edgeScore != null && (
                    <span className="text-[10px] text-emerald-500 font-black uppercase tracking-wide">
                      Edge {leg.research.edgeScore} · {leg.research.marketType || 'Market'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Slip Card */}
          <div className="bg-card border-2 border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg uppercase">Your Slip ({builderLegs.length} leg{builderLegs.length !== 1 ? "s" : ""})</h3>
              {builderLegs.length > 0 && (
                <button onClick={() => setBuilderLegs([])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {builderLegs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Tap picks above to start building your parlay
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-5">
                  {builderLegs.map((leg, i) => (
                    <div key={i} className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-2.5 border border-border">
                      <div>
                        <span className="font-bold text-sm text-foreground">{leg.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{leg.game}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-primary">{leg.odds}</span>
                        <button onClick={() => toggleLeg(leg)} className="text-muted-foreground hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4 bg-secondary/20 rounded-xl p-4 border border-border mb-5">
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Legs</div>
                    <div className="text-2xl font-black text-foreground">{builderLegs.length}</div>
                  </div>
                  <div className="text-center border-l border-border">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Parlay Odds</div>
                    <div className="text-2xl font-black text-primary">{parlayOdds?.american ?? "Unavailable"}</div>
                  </div>
                  <div className="text-center border-l border-border">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Payout on ${stake}</div>
                    <div className="text-2xl font-black text-emerald-400">{parlayOdds ? `$${payout}` : "Unavailable"}</div>
                  </div>
                </div>

                {/* Stake Input + Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-4 py-2.5 flex-1">
                    <span className="text-muted-foreground font-bold text-sm">$</span>
                    <input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="bg-transparent outline-none text-foreground font-bold w-full text-sm"
                      placeholder="10"
                      min="1"
                    />
                  </div>
                  <button
                    onClick={copySlip}
                    className="flex items-center justify-center gap-2 bg-secondary text-foreground font-bold px-5 py-2.5 rounded-lg hover:bg-secondary/80 transition-colors border border-border text-sm"
                  >
                    <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy Slip"}
                  </button>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(builderLegs.map(l => l.label).join(" + ") + " parlay bet")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(212,168,67,0.3)] text-sm"
                  >
                    Place This Parlay <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── PRE-BUILT: $10 PARLAY PLAN ──────────────── */}
        <section>
          <h2 className="text-2xl font-black uppercase mb-1 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> $10 Parlay Plan
          </h2>
          <p className="text-sm text-muted-foreground mb-6">Today&apos;s pre-built flip ticket. $10 stake, smart legs, big payout potential.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tenDollarParlayPlan.map((pick, i) => (
              <PickCard
                key={i} {...pick}
                isSelected={selectedPicks.some((p) => p.selection === pick.selection)}
                onToggleSelect={() => togglePick(pick)}
              />
            ))}
          </div>
        </section>

        {/* ── HAILMARYS ───────────────────────────────── */}
        <section>
          <div className="border-b border-border pb-3 mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black uppercase flex items-center gap-2">
                <Bomb className="w-6 h-6 text-primary animate-pulse" /> The Hailmarys
              </h2>
              <p className="text-sm text-muted-foreground mt-1">10, 15, and 20-leg lottery tickets. Small stakes, moonshot payouts.</p>
            </div>
            <Link href="/picks/hailmarys" className="text-xs font-bold text-primary hover:underline hidden sm:block">
              Full Page →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {hailmaryParlays.map((pick, i) => (
              <PickCard
                key={i} {...pick}
                isSelected={selectedPicks.some((p) => p.selection === pick.selection)}
                onToggleSelect={() => togglePick(pick)}
              />
            ))}
          </div>
        </section>

        {/* ── OVERNIGHT LEGS ──────────────────────────── */}
        <section>
          <div className="border-b border-border pb-3 mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black uppercase flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-primary" /> Overnight Parlay Legs
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Add these overseas picks as individual legs to any parlay.</p>
            </div>
            <Link href="/picks/overseas" className="text-xs font-bold text-primary hover:underline hidden sm:block">
              Full Page →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {overseasPicks.slice(0, 4).map((pick, i) => (
              <PickCard
                key={i} {...pick}
                isSelected={selectedPicks.some((p) => p.selection === pick.selection)}
                onToggleSelect={() => togglePick(pick)}
              />
            ))}
          </div>
        </section>

        {/* Disclaimer */}
        <div className="p-5 bg-card border border-border rounded-xl text-sm text-muted-foreground leading-relaxed">
          ⚠️ Parlay odds are calculated estimates. Always verify final odds on your sportsbook before placing. Must be 21+ in a legal betting state. Bet responsibly.
        </div>
      </div>

      {/* Floating Slip Bar */}
      {selectedPicks.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none">
          <div className="max-w-3xl mx-auto bg-card border-2 border-primary rounded-xl p-4 shadow-[0_0_40px_rgba(212,168,67,0.3)] flex flex-col md:flex-row items-center justify-between gap-4 pointer-events-auto relative">
            <div className="absolute -top-3 left-6 bg-primary text-primary-foreground text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
              <CheckSquare className="w-3 h-3" /> {selectedPicks.length} Pick{selectedPicks.length > 1 ? "s" : ""} Selected
            </div>
            <div className="flex-1 mt-2 md:mt-0">
              <h4 className="font-bold text-lg leading-tight">{selectedPicks.length} play{selectedPicks.length > 1 ? "s" : ""} ready</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Add to your parlay builder above or place straight.</p>
            </div>
            <button
              onClick={() => setSelectedPicks([])}
              className="text-xs text-muted-foreground hover:text-foreground font-bold px-4 py-2 border border-border rounded-lg"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
