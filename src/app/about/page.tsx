import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Target, ShieldCheck, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: "About | HIMOTHY PLAYS AND PARLAYS",
  description: "HIMOTHY Plays and Parlays — daily picks and parlays with a clear reason on every play, graded honestly win or lose.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">About <span className="text-primary">HIMOTHY</span></h1>
          <p className="text-xl text-muted-foreground mt-4 leading-relaxed">
            HIMOTHY Plays and Parlays gives you daily picks and parlays with a clear reason on every play — and we grade every one honestly, win or lose.
          </p>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <Target className="w-6 h-6 text-primary" /> Our Mission
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            We strip away the noise and do the homework so you don't have to. We surface only the plays we actually like — and we tell you why on every one.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-primary" /> Truth-First Data
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Every pick is built from real data — odds movement, records, injuries, and recent form — and graded honestly against official results. Win or lose, it goes on the record.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <Zap className="w-6 h-6 text-amber-500" /> Continuous Innovation
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The market never sleeps, and neither does HIMOTHY. Our engine refreshes every 5 minutes, 24/7, to capture timezone-based inefficiencies in global markets.
          </p>
        </section>
      </div>
    </div>
  );
}
