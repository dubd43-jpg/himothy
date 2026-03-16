import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Activity, Zap, TrendingUp, Wallet, ArrowRight, CreditCard, Lock, ArrowLeft } from 'lucide-react';

export default function UserDashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      
      {/* Dashboard Header */}
      <header className="px-6 lg:px-10 py-12 border-b border-border bg-card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground mb-6 transition-colors w-max">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <div className="block">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-black tracking-widest uppercase mb-4 border border-green-500/30">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                FOUNDING MEMBER STATUS: ACTIVE
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">
              Command <span className="text-primary">Center</span>
            </h1>
            <p className="text-muted-foreground mt-2 font-medium">
              Welcome back. The algorithm has finalized today's global slate.
            </p>
          </div>
          
          <div className="flex gap-4">
            <Link href="/picks" className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
               <Zap className="w-5 h-5" /> View Today's Slate
            </Link>
          </div>
        </div>
      </header>

      <main className="px-6 lg:px-10 py-12 max-w-7xl mx-auto flex flex-col gap-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Main Content) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Active Memberships Section */}
            <section>
              <h2 className="text-xl font-bold uppercase flex items-center gap-2 border-b border-border pb-3 mb-6">
                <ShieldCheck className="w-5 h-5 text-primary" /> Active Access Passes
              </h2>
              
              <div className="space-y-4">
                {/* Grand Slam Active */}
                <div className="bg-gradient-to-r from-primary/5 to-background border border-primary/40 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black text-lg text-foreground uppercase tracking-wide">HIMOTHY GRAND SLAM</h3>
                    <p className="text-sm text-muted-foreground">The one pick that should never lose.</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 text-green-500 font-bold px-4 py-2 rounded-lg text-sm text-center flex flex-col">
                    <span>ACTIVE</span>
                    <span className="text-[10px] text-green-500/70 uppercase">$0 / Early Access</span>
                  </div>
                </div>

                {/* VIP 4-Pack Active */}
                <div className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-foreground uppercase tracking-wide">HIMOTHY VIP 4-PACK</h3>
                    <p className="text-sm text-muted-foreground">The daily foundation for volume.</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 text-green-500 font-bold px-4 py-2 rounded-lg text-sm text-center flex flex-col">
                    <span>ACTIVE</span>
                    <span className="text-[10px] text-green-500/70 uppercase">$0 / Early Access</span>
                  </div>
                </div>

                {/* Explore More Packages */}
                <Link href="/pricing" className="block text-center p-4 border border-dashed border-border rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                  + Add More System Packages
                </Link>
              </div>
            </section>

            {/* Recent Action */}
            <section>
              <h2 className="text-xl font-bold uppercase flex items-center gap-2 border-b border-border pb-3 mb-6">
                <Activity className="w-5 h-5 text-primary" /> System Intelligence
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card border border-border p-5 rounded-xl hover:border-primary/50 transition-colors group cursor-pointer relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                   <Zap className="w-8 h-8 text-primary mb-3" />
                   <h3 className="font-bold text-lg mb-1">Today's Slate is LIVE</h3>
                   <p className="text-sm text-muted-foreground mb-4">The algorithm has released 4 Major picks and 2 Overnight value plays.</p>
                   <div className="text-primary text-sm font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                     View Picks <ArrowRight className="w-4 h-4" />
                   </div>
                </div>

                <div className="bg-card border border-border p-5 rounded-xl hover:border-primary/50 transition-colors group cursor-pointer relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                   <TrendingUp className="w-8 h-8 text-primary mb-3" />
                   <h3 className="font-bold text-lg mb-1">Yesterday's Recap</h3>
                   <p className="text-sm text-muted-foreground mb-4">The board hit at a massive 80% clip. Check the public ledger for details.</p>
                   <Link href="/results" className="text-primary text-sm font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                     View Results Ledger <ArrowRight className="w-4 h-4" />
                   </Link>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column (Sidebar) */}
          <div className="space-y-8">
            
            {/* Stripe Billing Box */}
            <section className="bg-card border border-border rounded-xl p-6 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <Wallet className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-bold uppercase tracking-wide">Billing & Wallet</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Current Balance</span>
                  <span className="font-black text-foreground">$0.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Next Billing Date</span>
                  <span className="font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded">Paused</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-background border border-border outline outline-1 outline-border/50 rounded-lg text-xs leading-relaxed text-muted-foreground relative">
                 <Lock className="w-16 h-16 text-primary/5 absolute right-2 top-2 pointer-events-none" />
                 <strong className="text-foreground block mb-1 flex items-center gap-1">
                   <CreditCard className="w-3.5 h-3.5 text-primary" /> SECURE BILLING PENDING
                 </strong>
                 You are currently on a 100% free Founding Member pass. Once the beta phase concludes, this tab will activate to securely manage your payment methods and active subscriptions.
              </div>
              
              <button disabled className="w-full mt-4 bg-secondary text-muted-foreground py-2.5 rounded-lg text-sm font-bold cursor-not-allowed opacity-70 flex items-center justify-center gap-2">
                Manage Billing (Locked)
              </button>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
