import React from "react";
import Link from "next/link";
import { Check, Zap, Target, Trophy, BarChart3, Lock, CreditCard, ArrowLeft } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Back Button */}
      <div className="px-6 lg:px-10 pt-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
      {/* HEADER SECTION */}
      <header className="px-6 lg:px-10 py-20 border-b border-border bg-card relative overflow-hidden">
        {/* Abstract Background Element */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none"></div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 text-green-500 text-sm font-black tracking-widest uppercase mb-6 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            EARLY ACCESS: 100% FREE RIGHT NOW
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase mb-6 tracking-tight">
            Lock In Your <span className="text-primary">Stripe</span> Account
          </h1>
          <p className="text-muted-foreground text-xl leading-relaxed max-w-2xl mx-auto mb-8 font-medium">
            We are tracking real-world results. We are proving the algorithm works. For a limited time, everything is <span className="text-foreground font-bold">FREE</span>. But soon, the paywall drops. Set up your secure account now before prices are locked.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-bold uppercase tracking-wider mb-2">
            <Lock className="w-4 h-4 text-primary" /> SECURE CHECKOUT WILL BE POWERED BY STRIPE <CreditCard className="w-4 h-4 ml-1" />
          </div>
        </div>
      </header>

      {/* PACKAGES SECTION */}
      <main className="px-6 lg:px-10 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* HIMOTHY GRAND SLAM */}
          <div className="bg-gradient-to-b from-primary/10 to-background border border-primary p-8 rounded-xl flex flex-col relative shadow-[0_0_30px_rgba(234,179,8,0.1)] hover:shadow-[0_0_40px_rgba(234,179,8,0.2)] transition-shadow">
             <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-black uppercase px-3 py-1 rounded-bl-lg">TOP TIER</div>
             <Trophy className="w-10 h-10 text-primary mb-4" />
             <h3 className="text-2xl font-black uppercase mb-1">HIMOTHY GRAND SLAM</h3>
             <div className="flex items-end gap-2 mb-6 border-b border-primary/20 pb-4">
                <span className="text-4xl font-black line-through text-muted-foreground decoration-red-500">$99</span>
                <span className="text-5xl font-black text-foreground">$0</span>
                <span className="text-sm font-bold text-green-500 uppercase pb-1">/ mo (For Now)</span>
             </div>
             
             <ul className="space-y-4 mb-8 flex-1">
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span><strong className="text-foreground italic">Our highest-conviction, research-led daily entry.</strong></span>
               </li>
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Rare, algorithmic perfection play.</span>
               </li>
             </ul>
             <button className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-lg hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)]">
               Activate Free Access
             </button>
          </div>

          {/* HIMOTHY 2-PICK PRESSURE PACK */}
          <div className="bg-background border border-border p-8 rounded-xl flex flex-col hover:border-primary/50 transition-colors relative">
             <div className="absolute top-0 right-0 bg-secondary text-foreground text-[10px] font-black uppercase px-3 py-1 rounded-bl-lg">MOST POPULAR</div>
             <Zap className="w-10 h-10 text-primary mb-4" />
             <h3 className="text-2xl font-black uppercase mb-1">PRESSURE PACK</h3>
             <div className="flex items-end gap-2 mb-6 border-b border-border pb-4">
                <span className="text-4xl font-black line-through text-muted-foreground decoration-red-500">$49</span>
                <span className="text-5xl font-black text-foreground">$0</span>
                <span className="text-sm font-bold text-green-500 uppercase pb-1">/ mo (For Now)</span>
             </div>
             
             <ul className="space-y-4 mb-8 flex-1">
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Our <strong className="text-foreground">2 strongest plays</strong> of the day.</span>
               </li>
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>If we're applying pressure, it's here.</span>
               </li>
             </ul>
             <button className="w-full bg-secondary text-foreground font-bold py-4 rounded-lg hover:bg-secondary/80 transition-all">
               Activate Free Access
             </button>
          </div>

          {/* HIMOTHY VIP 4-PACK */}
          <div className="bg-background border border-border p-8 rounded-xl flex flex-col hover:border-primary/50 transition-colors">
             <Target className="w-10 h-10 text-primary mb-4" />
             <h3 className="text-2xl font-black uppercase mb-1">VIP 4-PACK</h3>
             <div className="flex items-end gap-2 mb-6 border-b border-border pb-4">
                <span className="text-4xl font-black line-through text-muted-foreground decoration-red-500">$29</span>
                <span className="text-5xl font-black text-foreground">$0</span>
                <span className="text-sm font-bold text-green-500 uppercase pb-1">/ mo (For Now)</span>
             </div>
             
             <ul className="space-y-4 mb-8 flex-1">
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Our daily structured 4-play package.</span>
               </li>
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Your foundation for daily volume.</span>
               </li>
             </ul>
             <button className="w-full bg-secondary text-foreground font-bold py-4 rounded-lg hover:bg-secondary/80 transition-all">
               Activate Free Access
             </button>
          </div>

          {/* $10 PARLAY PLAN */}
          <div className="bg-background border border-border p-8 rounded-xl flex flex-col hover:border-primary/50 transition-colors">
             <BarChart3 className="w-10 h-10 text-primary mb-4" />
             <h3 className="text-2xl font-black uppercase mb-1">$10 PARLAY PLAN</h3>
             <div className="flex items-end gap-2 mb-6 border-b border-border pb-4">
                <span className="text-4xl font-black line-through text-muted-foreground decoration-red-500">$19</span>
                <span className="text-5xl font-black text-foreground">$0</span>
                <span className="text-sm font-bold text-green-500 uppercase pb-1">/ mo (For Now)</span>
             </div>
             
             <ul className="space-y-4 mb-8 flex-1">
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Built for the flip chasers.</span>
               </li>
               <li className="flex items-start gap-3 text-sm text-muted-foreground">
                 <Check className="w-5 h-5 text-primary flex-shrink-0" />
                 <span>Strategic, data-backed parlays.</span>
               </li>
             </ul>
             <button className="w-full bg-secondary text-foreground font-bold py-4 rounded-lg hover:bg-secondary/80 transition-all">
               Activate Free Access
             </button>
          </div>

        </div>

        {/* Footer info for Stripe */}
        <div className="mt-16 text-center max-w-2xl mx-auto border border-border bg-card p-6 rounded-xl">
           <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
           <p className="text-muted-foreground text-sm leading-relaxed">
             <strong className="text-foreground">Why do we need an account for free access?</strong><br/>
             We are integrating with <strong className="text-primary italic">Stripe</strong>. While access is absolutely free today as we build our public ledger, having an account ensures your early-adopter status is locked in when the paywall drops. You will not be charged today.
           </p>
        </div>
      </main>
    </div>
  );
}
