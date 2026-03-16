"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bomb, BarChart3, Plus, X, Copy, ExternalLink, CheckSquare, Zap, TrendingUp } from "lucide-react";
import { hailmaryParlays, tenDollarParlayPlan, overseasPicks, overnightBets } from "@/lib/picksData";
import { PickCard } from "@/components/PickCard";

// Suggested parlay legs users can mix and match
const SUGGESTED_LEGS = [
  { label: "Hawks -0.5 (1Q)", game: "ATL Hawks vs ORL Magic", odds: "-115", sport: "NBA" },
  { label: "Tatum OVER 6.5 1Q Pts", game: "BOS Celtics vs PHX Suns", odds: "-120", sport: "NBA" },
  { label: "Rockets -1.5 (1H)", game: "HOU Rockets vs LA Lakers", odds: "-110", sport: "NBA" },
  { label: "Clippers OVER 58.5 (1H)", game: "SA Spurs vs LA Clippers", odds: "-115", sport: "NBA" },
  { label: "Fiorentina ML", game: "Cremonese vs Fiorentina", odds: "-115", sport: "Serie A" },
  { label: "UNDER 2.5 Goals", game: "Cremonese vs Fiorentina", odds: "-120", sport: "Serie A" },
  { label: "Vejle +0.25", game: "Silkeborg vs Vejle", odds: "-103", sport: "Denmark" },
  { label: "CFR Cluj ML", game: "Cluj vs CFR Cluj", odds: "-130", sport: "Romania" },
];

function calcParlayOdds(legs: typeof SUGGESTED_LEGS) {
  if (legs.length === 0) return null;
  let decimal = 1;
  for (const leg of legs) {
    const o = parseInt(leg.odds);
    const d = o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
    decimal *= d;
  }
  const american = decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
  return { decimal: decimal.toFixed(2), american };
}

export default function ParlayCenter() {
  const [builderLegs, setBuilderLegs] = useState<typeof SUGGESTED_LEGS>([]);
  const [stake, setStake] = useState("10");
  const [copied, setCopied] = useState(false);
  const [selectedPicks, setSelectedPicks] = useState<any[]>([]);

  const toggleLeg = (leg: typeof SUGGESTED_LEGS[0]) => {
    if (builderLegs.find((l) => l.label === leg.label)) {
      setBuilderLegs(builderLegs.filter((l) => l.label !== leg.label));
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
          <p className="text-muted-foreground text-sm mb-6">Tap picks below to add them. Odds update automatically.</p>

          {/* Leg Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {SUGGESTED_LEGS.map((leg) => {
              const active = !!builderLegs.find((l) => l.label === leg.label);
              return (
                <button
                  key={leg.label}
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
                    <div className="text-2xl font-black text-primary">{parlayOdds?.american ?? "-"}</div>
                  </div>
                  <div className="text-center border-l border-border">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Payout on ${stake}</div>
                    <div className="text-2xl font-black text-emerald-400">${payout}</div>
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
