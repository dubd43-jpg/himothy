import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Activity, Search, ShieldCheck, Target } from 'lucide-react';

export const metadata: Metadata = {
  title: "How It Works | HIMOTHY PLAYS AND PARLAYS",
  description: "How HIMOTHY works: we do the homework, verify before we post, and only put up plays we believe in — with the reason on every one.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto flex flex-col gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="border-b border-border pb-8">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">How It <span className="text-primary italic">Works</span></h1>
          <p className="text-xl text-muted-foreground mt-4 leading-relaxed">
            We do the work so you don't have to. Here's how every HIMOTHY play makes the board.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-8">
          <div className="bg-card border border-border p-6 md:p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-5">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary"><Search className="w-7 h-7" /></div>
              <h2 className="text-xl md:text-2xl font-black uppercase">1. We Do The Homework</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We track the games, the lines, team form, and the news all day long — so you get the read without the hours of work.
            </p>
          </div>

          <div className="bg-card border border-border p-6 md:p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-5">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary"><ShieldCheck className="w-7 h-7" /></div>
              <h2 className="text-xl md:text-2xl font-black uppercase">2. We Verify Before We Post</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              A play only goes up after we've checked the latest. If a key player is out or the situation changes, we pull it — and picks can update right up to game time.
            </p>
          </div>

          <div className="bg-card border border-border p-6 md:p-8 rounded-3xl">
            <div className="flex items-center gap-4 mb-5">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary"><Target className="w-7 h-7" /></div>
              <h2 className="text-xl md:text-2xl font-black uppercase">3. Only Plays We Like</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We don't post for the sake of posting. A play makes the board only when we genuinely like it — and we give you the reason on every one. Win or lose, it's graded honestly.
            </p>
          </div>
        </div>

        <div className="p-5 md:p-6 bg-secondary/20 rounded-2xl border border-dashed border-border mt-4 flex items-center gap-4">
          <Activity className="w-6 h-6 text-primary animate-pulse shrink-0" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Picks update throughout the day and can change up to ~15 minutes before game time.
          </p>
        </div>
      </div>
    </div>
  );
}
