import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Target, ShieldCheck, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: "About HIMOTHY | The Continuous Decision Engine",
  description: "Learn about HIMOTHY, the leading Continuous Decision Engine for sports analytics and real-time betting edges.",
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
            HIMOTHY is not a "tout" service. We are a decision engine company built on the principle of transparency through technology.
          </p>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <Target className="w-6 h-6 text-primary" /> Our Mission
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            We aim to strip away the noise of the sports betting market. By using real-time data feeds and proprietary roster-verification logic, we provide users with high-confidence edges that are mathematically sound.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-500" /> Truth-First Data
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Every pick on our board is the result of a rigorous consensus mechanism. We track odds movement, injury reports, and localized betting volume to ensure our users are always on the right side of the spread.
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
