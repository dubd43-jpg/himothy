import { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { 
  CheckCircle2, 
  XOctagon, 
  MinusCircle, 
  Banknote, 
  BarChart, 
  CalendarDays,
  RotateCcw,
  ArrowLeft
} from "lucide-react";

export const metadata: Metadata = {
  title: "Official Record | HIMOTHY",
  description: "Complete transparency. View every win, loss, and push recorded by the HIMOTHY decision engine.",
};

export default function ResultsPage() {
  // Mock data for "Yesterday"
  const yesterdayResults = {
    date: "MARCH 15, 2026",
    record: "4-1",
    unitsWon: "+3.2U",
    winPercentage: "80%",
    totalRisked: "$500", // simulated based on standard $100 units
    totalReturned: "$820",
    status: "FINALIZED",
    overallRecap: "ABSOLUTE MASTERCLASS TONIGHT BOYS! 4-1 ON THE BOARD AND WE SECURED THE BAG. THE GRAND SLAM CASHED WITH ZERO SWEAT. The algorithm read the board perfectly. We take their money, we reset to 0-0, and we load up again tomorrow. BANG!",
    picks: [
      {
        package: "HIMOTHY GRAND SLAM",
        sport: "NBA",
        selection: "Denver Nuggets -4.5",
        odds: "-110",
        result: "WON (115-108)",
        status: "WIN",
        recap: "NEVER IN DOUBT! The Nuggets controlled the paint exactly like the models projected. Easy wire-to-wire cover. CASH IT! 💰"
      },
      {
        package: "VIP 4-PACK",
        sport: "NBA",
        selection: "Miami Heat ML",
        odds: "+120",
        result: "WON (102-98)",
        status: "WIN",
        recap: "WHAT A COMEBACK! Miami turns up the defense in the 4th quarter and our plus-money anchor hits right on the dot. Pure algorithm magic!"
      },
      {
        package: "PRESSURE PACK",
        sport: "TENNIS",
        selection: "J. Sinner ML",
        odds: "-150",
        result: "WON (6-4, 6-2)",
        status: "WIN",
        recap: "Too easy. Service metrics held up beautifully. He broke early in both sets and coasted. Another W for the Pressure Pack!"
      },
      {
        package: "VIP 4-PACK",
        sport: "NHL",
        selection: "Florida Panthers ML",
        odds: "-125",
        result: "WON (4-2)",
        status: "WIN",
        recap: "The boys on ice got it done. Empty netter sealed it but we were dominating zone time all 3 periods. Yessir!"
      },
      {
        package: "$10 PARLAY PLAN",
        sport: "NBA",
        selection: "Lakers / Rockets OVER 225.5",
        odds: "-110",
        result: "LOST (101-104)",
        status: "LOSS",
        recap: "Brutal shooting variance in the 4th quarter. They went cold. The read was right, but the shots didn't drop. Shake it off, back at it tomorrow."
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Back Button */}
      <div className="px-6 lg:px-10 pt-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
      {/* Header */}
      <header className="px-6 lg:px-10 py-12 border-b border-border bg-card">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-6 border border-primary/20">
            <BarChart className="w-3.5 h-3.5" /> THE LEDGER
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase mb-4">
            System <span className="text-primary">Results</span> Tracker
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">
            We don't hide our losses. Every night, the algorithm finalizes the record, tallies the profit, and zeroes the board out for the next day. 
            <strong className="text-foreground ml-1">The math wins in the end.</strong>
          </p>
        </div>
      </header>

      <main className="px-6 lg:px-10 py-12 max-w-5xl mx-auto flex flex-col gap-12">
        
        {/* TODAY'S BOARD STATUS */}
        <section className="bg-primary/5 border border-primary/20 rounded-xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
             <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
               <RotateCcw className="w-3.5 h-3.5" /> Reset Complete
             </div>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div>
              <h2 className="text-2xl font-black uppercase mb-1">MARCH 16, 2026 (TODAY)</h2>
              <p className="text-muted-foreground font-medium">The board is wiped clean. 0-0.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-background border border-border px-6 py-3 rounded-lg text-center">
                <span className="block text-3xl font-black">0-0</span>
                <span className="text-xs text-muted-foreground font-bold uppercase">Record</span>
              </div>
              <div className="bg-background border border-border px-6 py-3 rounded-lg text-center">
                <span className="block text-3xl font-black text-primary">+0.0</span>
                <span className="text-xs text-muted-foreground font-bold uppercase">Units</span>
              </div>
            </div>
          </div>
          <div className="mt-8">
            <Link href="/picks" className="inline-flex items-center justify-center bg-primary text-primary-foreground font-bold rounded-md px-6 py-3 hover:bg-primary/90 transition-colors w-full md:w-auto">
              View Today's Active Picks
            </Link>
          </div>
        </section>

        {/* YESTERDAY'S FINAL RECAP */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <CalendarDays className="text-primary w-6 h-6" />
            <h3 className="text-xl font-bold uppercase">Last Night's Final Tally ({yesterdayResults.date})</h3>
            <span className="ml-auto bg-green-500/10 text-green-500 text-xs font-black uppercase px-2 py-1 rounded">
              {yesterdayResults.status}
            </span>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Record</p>
              <p className="text-3xl font-black">{yesterdayResults.record}</p>
            </div>
            <div className="bg-card border border-green-500/30 p-5 rounded-xl flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full -mr-4 -mt-4"></div>
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 text-green-500">Net Profit (Units)</p>
              <p className="text-3xl font-black text-green-500">{yesterdayResults.unitsWon}</p>
            </div>
            <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Win %</p>
              <p className="text-3xl font-black">{yesterdayResults.winPercentage}</p>
            </div>
            <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><Banknote className="w-3 h-3"/> ROI Calc</p>
              <p className="text-xl font-bold text-muted-foreground line-through decoration-red-500">{yesterdayResults.totalRisked}</p>
              <p className="text-xl font-black text-foreground">{yesterdayResults.totalReturned}</p>
            </div>
          </div>

          {/* OVERALL NIGHT RECAP */}
          <div className={`p-6 rounded-xl border mt-2 flex flex-col gap-2 ${yesterdayResults.winPercentage === "80%" ? "bg-green-500/10 border-green-500/40" : "bg-card border-border"}`}>
            <span className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 animate-spin-slow" /> ALGORITHMIC NIGHTLY DEBRIEF
            </span>
            <p className="text-sm md:text-base font-bold italic leading-relaxed text-foreground">
              "{yesterdayResults.overallRecap}"
            </p>
          </div>

          {/* Detailed Pick Breakdown */}
          <div className="bg-card border border-border rounded-xl overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-bold">Package</th>
                    <th className="px-6 py-4 font-bold">Pick</th>
                    <th className="px-6 py-4 font-bold">Odds</th>
                    <th className="px-6 py-4 font-bold text-right">Final Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {yesterdayResults.picks.map((pick, i) => (
                    <tr key={i} className="hover:bg-secondary/10 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          {pick.package}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        <div className="flex flex-col gap-2">
                          <div>
                            <span className="text-muted-foreground text-xs mr-2">{pick.sport}</span>
                            {pick.selection}
                          </div>
                          <div className={`text-xs font-medium pl-3 border-l-2 leading-relaxed flex flex-col gap-1 ${pick.status === "WIN" ? "text-green-400 border-green-500/30" : "text-muted-foreground border-border"}`}>
                            <span className="font-black text-[10px] uppercase opacity-70 tracking-wider">SYSTEM RECAP:</span>
                            <span>{pick.recap}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {pick.odds}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-medium text-muted-foreground">{pick.result}</span>
                          {pick.status === "WIN" ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : pick.status === "LOSS" ? (
                            <XOctagon className="w-5 h-5 text-red-500" />
                          ) : (
                            <MinusCircle className="w-5 h-5 text-yellow-500" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
