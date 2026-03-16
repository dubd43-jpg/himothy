import Link from "next/link";
import Image from "next/image";
import { 
  ArrowRight, Trophy, Target, Zap, ShieldAlert, BarChart3, 
  Activity, Globe, ShieldCheck, TrendingUp, Cpu, Timer, LineChart 
} from "lucide-react";
import { LiveScoreBoard } from "@/components/LiveScoreBoard";
import { RecordDashboard } from "@/components/RecordDashboard";

export default function Home() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-24 premium-gradient selection:bg-primary/30">
      {/* 1. Command Header */}
      <header className="px-6 lg:px-12 py-5 border-b border-white/5 bg-black/40 backdrop-blur-2xl sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Image src="/logo.jpg" alt="HIMOTHY" width={52} height={52} className="rounded-2xl border border-primary/40 himo-glow" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-black animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tight leading-none uppercase">
              HIMOTHY <span className="text-primary italic">CORE</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Neural Network v4.2</span>
            </div>
          </div>
        </div>
        
        <nav className="hidden xl:flex items-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
          <Link href="/picks" className="hover:text-primary transition-all flex items-center gap-2 text-white">
            <Target className="w-3.5 h-3.5" /> Market Archive
          </Link>
          <Link href="/results" className="hover:text-primary transition-all flex items-center gap-2">
            <LineChart className="w-3.5 h-3.5" /> Performance
          </Link>
          <Link href="/live-sports-board" className="hover:text-primary transition-all flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Live Engine
          </Link>
        </nav>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex flex-col items-end">
             <span className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">System Status</span>
             <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
               <Cpu className="w-3 h-3" /> Fully Operational
             </span>
          </div>
          <Link href="/pricing" className="bg-primary hover:bg-white text-black px-6 py-2.5 rounded-full font-black text-[11px] uppercase tracking-widest transition-all himo-glow transform hover:scale-105">
            Get Access
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Hero Command Center */}
        <section className="relative px-6 lg:px-12 pt-12 pb-24 overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[150px] -z-10 rounded-full" />
          
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 w-fit">
                <Timer className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Terminal Live Node — {today}</span>
              </div>
              <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9]">
                Elite Sports <br />
                <span className="text-primary italic">Intelligence.</span>
              </h2>
              <p className="text-xl text-white/60 max-w-2xl leading-relaxed font-medium">
                Automated edge detection across 32 global markets. 
                Our neural engine audits every pick against 14 variables before delivery. 
                <span className="text-white"> No fluff. No human bias. Just data.</span>
              </p>
              
              <div className="flex flex-wrap gap-4 mt-4">
                <Link href="/picks" className="px-8 py-4 bg-white text-black font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-primary transition-all flex items-center gap-3 group">
                  Audit Today's Slate <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <div className="px-8 py-4 bg-white/5 border border-white/10 font-black uppercase text-xs tracking-widest rounded-2xl flex items-center gap-3">
                  <Activity className="w-4 h-4 text-emerald-500" /> 
                  Live Heartbeat Active
                </div>
              </div>
            </div>

            <div className="lg:col-span-12 xl:col-span-5 relative">
               <div className="glass-morphism rounded-3xl p-6 border-white/10 relative z-10 himo-glow">
                  <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Real-Time Core Metrics</h3>
                    <span className="text-[9px] font-bold text-emerald-400 px-2 py-0.5 rounded border border-emerald-400/20 bg-emerald-400/5 uppercase">Global Sync</span>
                  </div>
                  <RecordDashboard />
               </div>
               <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 blur-3xl -z-10 rounded-full" />
            </div>
          </div>
        </section>

        {/* 3. The Feed Section (Live Scoreboard) */}
        <section className="px-6 lg:px-12 py-24 bg-white/[0.02] border-y border-white/5">
           <div className="max-w-7xl mx-auto flex flex-col gap-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex flex-col gap-3">
                  <span className="text-primary font-black uppercase text-[10px] tracking-[0.3em]">Live Feed Aggregate</span>
                  <h2 className="text-4xl font-black uppercase tracking-tight">Current Market <span className="text-white/40">Status</span></h2>
                </div>
                <Link href="/live-sports-board" className="text-xs font-black uppercase tracking-widest border-b border-primary/40 pb-1 hover:border-primary transition-all">
                  Open Engine Hub
                </Link>
              </div>

              <LiveScoreBoard />
           </div>
        </section>

        {/* 4. Tiers and Packs */}
        <section className="px-6 lg:px-12 py-32 bg-black">
           <div className="max-w-7xl mx-auto">
              <div className="mb-20 text-center flex flex-col items-center">
                 <Cpu className="w-12 h-12 text-primary mb-6 animate-pulse" />
                 <h2 className="text-5xl font-black uppercase tracking-tight mb-4">Neural <span className="text-primary italic">Audited</span> Packs</h2>
                 <p className="text-white/40 max-w-xl text-lg font-medium">Every category is synchronized with real-time roster, injury, and edge data.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                 {/* Featured/VIP */}
                  <Link href="/grand-slam" className="group glass-morphism rounded-3xl p-10 hover:border-primary transition-all flex flex-col h-full bg-gradient-to-br from-white/[0.05] to-transparent">
                    <div className="flex items-start justify-between mb-8">
                       <Trophy className="w-14 h-14 text-primary group-hover:scale-110 transition-transform" />
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase tracking-widest bg-primary text-black px-4 py-1 rounded-full mb-2">97% Conf</span>
                          <span className="text-[9px] font-bold text-white/40 uppercase">Node Priority: HIGH</span>
                       </div>
                    </div>
                    <h3 className="text-3xl font-black uppercase mb-4 tracking-tight">HIMOTHY Grand Slam</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-10 font-medium">
                       Our absolute highest confidence play. Filtered through 12 specific neural variables for maximum measurable edge. Zero fluff. Zero human bias.
                    </p>
                    <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-primary uppercase mb-1">Audit Score</span>
                          <span className="text-lg font-black tracking-widest">L-V-L 4</span>
                       </div>
                       <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-2 transition-transform" />
                    </div>
                 </Link>

                 {/* Parlay Ticket */}
                 <Link href="/parlay-plan" className="group glass-morphism rounded-3xl p-10 hover:border-emerald-500 transition-all flex flex-col h-full">
                    <div className="flex items-start justify-between mb-8">
                       <BarChart3 className="w-14 h-14 text-emerald-500 group-hover:scale-110 transition-transform" />
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-black px-4 py-1 rounded-full mb-2">Multi-Leg</span>
                          <span className="text-[9px] font-bold text-white/40 uppercase">Efficiency: ELITE</span>
                       </div>
                    </div>
                    <h3 className="text-3xl font-black uppercase mb-4 tracking-tight">$10 Parlay Ticket</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-10 font-medium">
                       Strategic multi-leg tickets built on cumulative edge advantage. Optimized for maximum move-potential while maintaining statistical safety.
                    </p>
                    <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-emerald-500 uppercase mb-1">Active Legs</span>
                          <span className="text-lg font-black tracking-widest">SYNCED</span>
                       </div>
                       <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-2 transition-transform" />
                    </div>
                 </Link>

                 {/* Hailmary */}
                 <Link href="/hailmary" className="group glass-morphism rounded-3xl p-10 hover:border-red-500 transition-all flex flex-col h-full bg-gradient-to-tr from-red-500/5 to-transparent">
                    <div className="flex items-start justify-between mb-8">
                       <Zap className="w-14 h-14 text-red-500 animate-pulse" />
                       <span className="text-[10px] font-black uppercase tracking-widest bg-red-500 text-white px-4 py-1 rounded-full">High Variance</span>
                    </div>
                    <h3 className="text-3xl font-black uppercase mb-4 tracking-tight">Maximum Edge Lotto</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-10 font-medium">
                       Calculated lottery tickets. Maximum variance paired with extreme transparency. Only released when the math forces our hand.
                    </p>
                    <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                       <div className="flex flex-col">
                          <span className="text-[9px] font-black text-red-500 uppercase mb-1">Avg Probability</span>
                          <span className="text-lg font-black tracking-widest">+4500</span>
                       </div>
                       <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-2 transition-transform" />
                    </div>
                 </Link>
              </div>

              {/* Sub Categories GRID */}
              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {[
                   { label: "VIP 4-Pack", icon: Target, color: "text-blue-500", href: "/vip-picks" },
                   { label: "Pressure Pack", icon: Activity, color: "text-orange-500", href: "/pressure-pack" },
                   { label: "Overnight & Global", icon: Globe, color: "text-purple-500", href: "/overnight" },
                   { label: "Overseas Audited", icon: ShieldCheck, color: "text-yellow-500", href: "/overseas" }
                 ].map((pkg, i) => (
                    <Link key={i} href={pkg.href} className="glass-morphism rounded-2xl p-6 border-white/5 hover:border-white/20 transition-all flex items-center justify-between group">
                       <div className="flex items-center gap-4">
                        <pkg.icon className={`w-8 h-8 ${pkg.color}`} />
                        <h4 className="font-black uppercase text-[10px] tracking-widest leading-none">{pkg.label}</h4>
                       </div>
                       <ArrowRight className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-all" />
                    </Link>
                 ))}
              </div>
           </div>
        </section>

        {/* 5. System Footer Disclaimer */}
        <footer className="px-6 lg:px-12 py-12 border-t border-white/5 bg-black/80 flex flex-col md:flex-row justify-between gap-12">
            <div className="flex flex-col gap-4 max-w-sm">
                <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Neural Protocol 44.1</h5>
                <p className="text-[11px] text-white/40 leading-relaxed font-bold">
                   This system is an automated data aggregator. We do not facilitate gambling. All picks are generated through neural network auditing and provided for informational entertainment. Play responsibly.
                </p>
            </div>
            
            <div className="flex flex-wrap gap-8">
               <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Connect Node</span>
                  <div className="flex flex-col gap-2 text-xs font-bold text-white/60">
                     <Link href="/picks" className="hover:text-primary transition-all">Picks Archive</Link>
                     <Link href="/results" className="hover:text-primary transition-all">Grade History</Link>
                     <Link href="/monitoring" className="hover:text-primary transition-all">System Status</Link>
                  </div>
               </div>
               <div className="flex flex-col gap-3">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Legal Node</span>
                  <div className="flex flex-col gap-2 text-xs font-bold text-white/60">
                     <Link href="/privacy" className="hover:text-primary transition-all">Data Privacy</Link>
                     <Link href="/terms" className="hover:text-primary transition-all">System Usage</Link>
                     <Link href="/contact" className="hover:text-primary transition-all">Node Contact</Link>
                  </div>
               </div>
            </div>
        </footer>
      </main>
    </div>
  );
}
