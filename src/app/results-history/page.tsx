import { Metadata } from "next";
import Link from "next/link";
import { RecordDashboard } from "@/components/RecordDashboard";
import { History, ArrowLeft, BarChart3, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Results History | Detailed Betting Performance | HIMOTHY",
  description: "View the complete results history and performance metrics for the HIMOTHY decision engine. Absolute transparency on every pick.",
  keywords: ["results history", "betting record", "sports picks history", "HIMOTHY performance", "past betting results"],
};

export default function ResultsHistoryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-7xl mx-auto flex flex-col gap-10">
        <Link href="/picks" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Picks Hub
        </Link>

        <div className="border-b border-border pb-8">
           <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight flex items-center gap-4">
              <History className="w-10 h-10 text-primary" /> Results History
           </h1>
           <p className="text-muted-foreground text-lg mt-2 max-w-2xl">
              Complete historical performance logs. We track every win, loss, and push across every category to ensure maximum accountability.
           </p>
        </div>

        <RecordDashboard />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
           <div className="p-8 bg-card border border-border rounded-2xl flex flex-col gap-4">
              <BarChart3 className="w-12 h-12 text-emerald-500" />
              <h3 className="text-xl font-black uppercase">Transparency First</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                 Unlike other platforms, we do not delete losses. Every pick is recorded in our audit log and finalized at the end of the night.
              </p>
           </div>
           <div className="p-8 bg-card border border-border rounded-2xl flex flex-col gap-4">
              <ShieldCheck className="w-12 h-12 text-primary" />
              <h3 className="text-xl font-black uppercase">Audited Performance</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                 Our system performs unique truth-tie-break audits for every result, ensuring that what you see is what actually happened.
              </p>
           </div>
        </div>

        <div className="flex justify-center mt-12">
            <Link href="/results" className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(212,168,67,0.3)]">
                View The Complete Ledger
            </Link>
        </div>
      </div>
    </div>
  );
}
