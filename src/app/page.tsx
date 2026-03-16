import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Trophy, Target, Zap, ShieldAlert, BarChart3, Activity, Globe, ShieldCheck, TrendingUp } from "lucide-react";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";
import { RecordDashboard } from "@/components/RecordDashboard";

export default function Home() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* 1. Header */}
      <header className="px-6 lg:px-10 py-4 border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.jpg" alt="HIMOTHY Plays and Parlays" width={48} height={48} className="rounded-full border-2 border-primary/40" />
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tight text-foreground uppercase">HIMOTHY <span className="text-primary italic">P&P</span></span>
            <div className="flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
               <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">BOARD LIVE</span>
            </div>
          </div>
        </div>
        
        <nav className="hidden lg:flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
          <Link href="/picks" className="hover:text-primary transition-colors text-foreground">Today's Picks</Link>
          <Link href="/results" className="hover:text-primary transition-colors">Record & Results</Link>
          <Link href="/live-sports-board" className="hover:text-primary transition-colors">Live Board</Link>
          <Link href="/monitoring" className="hover:text-primary transition-colors opacity-60">System Monitoring</Link>
        </nav>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end">
             <span className="text-[10px] font-black text-foreground uppercase tracking-wider">{today}</span>
             <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">32 Markets Scanning</span>
          </div>
          <Link href="/pricing" className="bg-primary text-primary-foreground px-5 py-2 rounded font-black text-[11px] uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(212,168,67,0.3)]">
            Get Access
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col pt-8">
        {/* 2. Main Picks Section (TOP PRIORITY) */}
        <section className="px-6 lg:px-10 pb-16">
           <div className="max-w-7xl mx-auto flex flex-col gap-8">
              <div className="flex items-center justify-between">
                 <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-primary" /> Today's Primary Edge Board
                 </h2>
                 <Link href="/picks" className="text-[10px] font-black text-primary uppercase flex items-center gap-1 border-b border-primary/20 hover:border-primary transition-colors">
                    View Complete Hub <ArrowRight className="w-3 h-3" />
                 </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Featured/VIP */}
                  <Link href="/grand-slam" className="group bg-card border-2 border-border/60 rounded-2xl p-8 hover:border-primary/50 transition-all">
                    <div className="flex items-start justify-between mb-6">
                       <Trophy className="w-12 h-12 text-primary" />
                       <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">VIP Selection</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase mb-3">HIMOTHY Grand Slam</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                       Our absolute highest confidence play. Filtered through 12 variables for maximum measurable edge. Zero fluff.
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-6 border-t border-border/50">
                       <span className="text-[10px] font-black text-primary uppercase">Edge Level: 4</span>
                       <span className="text-xs font-black group-hover:gap-2 flex items-center gap-1 transition-all">View Pick <ArrowRight className="w-4 h-4" /></span>
                    </div>
                 </Link>

                 {/* Parlay Ticket */}
                 <Link href="/parlay-plan" className="group bg-card border-2 border-border/60 rounded-2xl p-8 hover:border-emerald-500/50 transition-all">
                    <div className="flex items-start justify-between mb-6">
                       <BarChart3 className="w-12 h-12 text-emerald-500" />
                       <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20">The Daily Plan</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase mb-3">$10 Parlay Ticket</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                       Strategic multi-leg tickets built on cumulative edge advantage. Turning small stakes into serious moves.
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-6 border-t border-border/50">
                       <span className="text-[10px] font-black text-emerald-500 uppercase">3 Legs Analyzed</span>
                       <span className="text-xs font-black group-hover:gap-2 flex items-center gap-1 transition-all">View Ticket <ArrowRight className="w-4 h-4" /></span>
                    </div>
                 </Link>

                 {/* Hailmary */}
                 <Link href="/hailmary" className="group bg-card border-2 border-border/60 rounded-2xl p-8 hover:border-red-500/50 transition-all">
                    <div className="flex items-start justify-between mb-6">
                       <Zap className="w-12 h-12 text-red-500" />
                       <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20">High Variance</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase mb-3 text-red-400">Maximum Edge Lotto</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                       Calculated lottery tickets. Maximum variance, maximum transparency. Shown only if real deep value exists.
                    </p>
                    <div className="flex items-center justify-between mt-auto pt-6 border-t border-border/50">
                       <span className="text-[10px] font-black text-red-500 uppercase">+1200 Avg Prob</span>
                       <span className="text-xs font-black group-hover:gap-2 flex items-center gap-1 transition-all">View Picks <ArrowRight className="w-4 h-4" /></span>
                    </div>
                 </Link>
              </div>
           </div>
        </section>

        {/* 3. Supporting Picks Sections */}
        <section className="px-6 lg:px-10 py-16 bg-secondary/10 border-y border-border">
           <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                   { label: "VIP 4-Pack", icon: Target, color: "text-blue-500", desc: "Structured daily foundation. 4 picks cross-checked every 5 mins.", href: "/vip-picks" },
                   { label: "Pressure Pack", icon: Activity, color: "text-orange-500", desc: "Short term volatility trades. Identifying market inefficiency.", href: "/pressure-pack" },
                   { label: "Overnight & Global", icon: TrendingUp, color: "text-purple-500", desc: "Soccer and Tennis markets monitored 24/7 globally.", href: "/overnight" },
                   { label: "Overseas Audited", icon: Globe, color: "text-yellow-500", desc: "International leagues audited locally. Depth of the board.", href: "/overseas" }
                 ].map((pkg, i) => (
                    <div key={i} className="bg-card border border-border p-6 rounded-xl flex flex-col gap-3">
                       <pkg.icon className={`w-8 h-8 ${pkg.color}`} />
                       <h4 className="font-black uppercase text-sm">{pkg.label}</h4>
                       <p className="text-xs text-muted-foreground leading-relaxed">{pkg.desc}</p>
                       <Link href={pkg.href} className="mt-auto text-[10px] font-black text-primary uppercase flex items-center gap-1">Open Section <ArrowRight className="w-3 h-3" /></Link>
                    </div>
                 ))}
              </div>
           </div>
        </section>

        {/* SEO Landing Access */}
        <section className="px-6 lg:px-10 py-12 border-b border-border">
           <div className="max-w-7xl mx-auto">
             <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-6">Explore Markets</h5>
             <div className="flex flex-wrap gap-2">
                {[
                  { label: "NBA Picks", href: "/nba-picks-today" },
                  { label: "NCAA Basketball", href: "/ncaa-basketball-picks" },
                  { label: "MLB Picks", href: "/mlb-picks" },
                  { label: "Best Parlays", href: "/best-parlay-picks" },
                  { label: "Sports Picks Today", href: "/sports-picks-today" },
                  { label: "Live Board", href: "/live-sports-board" },
                  { label: "History", href: "/results-history" },
                ].map((item) => (
                  <Link key={item.href} href={item.href} className="px-4 py-2 bg-secondary/50 border border-border rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-secondary transition-all">
                    {item.label}
                  </Link>
                ))}
             </div>
           </div>
        </section>

        {/* 4. Results Summary (LOWER ON PAGE) */}
        <section className="px-6 lg:px-10 py-16">
           <div className="max-w-7xl mx-auto flex flex-col gap-8">
              <div className="flex items-center justify-between">
                 <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Official Performance Record</h2>
                 <Link href="/results" className="text-[10px] font-black text-primary uppercase flex items-center gap-1">Complete History <ArrowRight className="w-3 h-3" /></Link>
              </div>
              <RecordDashboard />
           </div>
        </section>

        {/* 5. Live Game Boards (BOTTOM SECTION) */}
        <section className="px-6 lg:px-10 py-16 border-t border-border">
           <div className="max-w-7xl mx-auto flex flex-col gap-8">
              <div className="flex items-center justify-between">
                 <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-500 animate-pulse" /> Live Scoreboard & Market Status
                 </h2>
              </div>
              <LiveScoreBoard />
           </div>
        </section>
      </main>

      {/* 6. Footer */}
      <footer className="px-6 lg:px-10 py-12 border-t border-border bg-card">
         <div className="max-max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
            <div className="col-span-1 lg:col-span-2">
               <div className="flex items-center gap-3 mb-6">
                  <Image src="/logo.jpg" alt="HIMOTHY P&P" width={40} height={40} className="rounded-full grayscale" />
                  <span className="text-lg font-black italic uppercase tracking-tighter">HIMOTHY <span className="text-primary not-italic">P&P</span></span>
               </div>
               <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                  We bet everything for everyone. Our Continuous Decision Engine re-evaluates the board every 5 minutes to ensure no stale action is presented as current. 
                  Accuracy over volume. Honesty over hype.
               </p>
               <div className="mt-8 flex gap-4">
                  <Link href="/monitoring" className="text-[10px] font-bold text-muted-foreground hover:text-primary uppercase tracking-widest">Engine Status</Link>
                  <Link href="/audit" className="text-[10px] font-bold text-muted-foreground hover:text-primary uppercase tracking-widest">Audit Logs</Link>
                  <Link href="/system-health" className="text-[10px] font-bold text-muted-foreground hover:text-primary uppercase tracking-widest">Health</Link>
               </div>
            </div>
            
            <div className="flex flex-col gap-4">
               <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground">Intelligence</h5>
               <div className="flex flex-col gap-2 text-[11px] font-bold text-muted-foreground">
                  <Link href="/picks" className="hover:text-primary transition-colors">Today's Picks</Link>
                  <Link href="/results" className="hover:text-primary transition-colors">Latest Results</Link>
                  <Link href="/vip-picks" className="hover:text-primary transition-colors">VIP 4-Pack</Link>
                  <Link href="/parlay-plan" className="hover:text-primary transition-colors">$10 Parlay Plan</Link>
                  <Link href="/live-sports-board" className="hover:text-primary transition-colors">Live Board</Link>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground">The Station</h5>
               <div className="flex flex-col gap-2 text-[11px] font-bold text-muted-foreground">
                  <Link href="/about" className="hover:text-foreground transition-colors">About HIMOTHY</Link>
                  <Link href="/how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
                  <Link href="/results-archive" className="hover:text-foreground transition-colors">Results Archive</Link>
                  <Link href="/transparency" className="hover:text-foreground transition-colors">Transparency Policy</Link>
                  <Link href="/contact" className="hover:text-foreground transition-colors">Contact Support</Link>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground">Legal</h5>
               <div className="flex flex-col gap-2 text-[11px] font-bold text-muted-foreground">
                  <Link href="/terms" className="hover:text-foreground">Terms & Conditions</Link>
                  <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
                  <Link href="/admin" className="hover:text-primary">Admin Gateway</Link>
               </div>
            </div>
         </div>
         <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-border text-center">
            <p className="text-[10px] text-muted-foreground font-medium italic">
               Must be 21+. Gambling problem? Call 1-800-GAMBLER. HIMOTHY is an informational tool. We do not accept bets.
            </p>
         </div>
      </footer>
    </div>
  );
}
