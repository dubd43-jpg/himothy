import Link from "next/link";
import { ArrowRight, Trophy, BarChart3, ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full flex flex-col items-center gap-8">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-primary" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-black uppercase tracking-tight">Page moved or updated</h1>
          <p className="text-muted-foreground font-medium">
            The market you are looking for has been re-indexed or removed to maintain system integrity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 w-full">
          <Link 
            href="/picks"
            className="flex items-center justify-between p-6 bg-primary text-primary-foreground rounded-2xl font-black uppercase text-sm hover:translate-y-[-2px] transition-all shadow-[0_10px_20px_rgba(212,168,67,0.2)] group"
          >
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5" />
              <span>Back to Picks Board</span>
            </div>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link 
            href="/results"
            className="flex items-center justify-between p-6 bg-card border border-border rounded-2xl font-black uppercase text-sm hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span>View Results ledger</span>
            </div>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-8">
          System Status: All Engines Operational
        </p>
      </div>
    </div>
  );
}
