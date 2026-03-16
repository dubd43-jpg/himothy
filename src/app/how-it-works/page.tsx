import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Activity, Database, RefreshCw, Code } from 'lucide-react';

export const metadata: Metadata = {
  title: "How The Model Works | HIMOTHY Analytics",
  description: "Explore the technology behind the HIMOTHY Continuous Decision Engine. From roster verification to odds aggregation.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">How The <span className="text-primary italic">Model Works</span></h1>
          <p className="text-xl text-muted-foreground mt-4 leading-relaxed">
            The HIMOTHY engine uses a three-tier validation process to authorize picks for the public board.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div className="bg-card border border-border p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <Database className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black uppercase">1. Data Aggregation</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We ingest live feeds from ESPN, major sportsbooks, and private roster databases. This data is cleaned and normalized in real-time to prevent "stale info" errors.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black uppercase">2. Roster Verification</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              No pick is authorized until the roster status is verified. If a key player is late-scratched or a coaching change is detected, the engine suppresses the edge immediately.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                <Code className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black uppercase">3. Edge Calculation</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Our proprietary weighting algorithm compares the current line against our "fair value" model. Only plays with a statistically significant positive expected value (+EV) make it to the board.
            </p>
          </div>
        </div>

        <div className="p-6 bg-secondary/20 rounded-2xl border border-dashed border-border mt-8 flex items-center gap-4">
          <Activity className="w-6 h-6 text-primary animate-pulse" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Model Refresh Frequency: Every 300 Seconds
          </p>
        </div>
      </div>
    </div>
  );
}

import { ShieldCheck } from 'lucide-react';
