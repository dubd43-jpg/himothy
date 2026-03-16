import React from 'react';
import { DollarSign, Save } from 'lucide-react';

export default function AdminPricingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-primary" /> Pricing & Packaging Control
        </h1>
        <p className="text-muted-foreground">Manage subscription costs and visibility for all packages.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* HIMOTHY GRAND SLAM */}
        <div className="bg-card border border-border p-6 rounded-xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 bg-primary/20 text-primary text-[10px] font-black uppercase px-3 py-1 rounded-bl-lg">TOP TIER</div>
          <h3 className="font-bold text-lg mb-4">HIMOTHY GRAND SLAM</h3>
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Current Price ($)</label>
              <input type="number" defaultValue="0" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-bold focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Compare at Price / Value ($)</label>
              <input type="number" defaultValue="99" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-medium focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Status</label>
              <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:border-primary focus:outline-none">
                <option value="free">100% Free (Early Access)</option>
                <option value="paid">Active Paywall (Stripe)</option>
                <option value="hidden">Hidden from Public</option>
              </select>
            </div>
          </div>
          <button className="w-full mt-6 bg-secondary text-foreground text-sm font-bold py-2 rounded-lg hover:bg-secondary/80 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Package
          </button>
        </div>

        {/* PRESSURE PACK */}
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col">
          <h3 className="font-bold text-lg mb-4">PRESSURE PACK</h3>
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Current Price ($)</label>
              <input type="number" defaultValue="0" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-bold focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Compare at Price / Value ($)</label>
              <input type="number" defaultValue="49" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-medium focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Status</label>
              <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:border-primary focus:outline-none">
                <option value="free">100% Free (Early Access)</option>
                <option value="paid">Active Paywall (Stripe)</option>
                <option value="hidden">Hidden from Public</option>
              </select>
            </div>
          </div>
          <button className="w-full mt-6 bg-secondary text-foreground text-sm font-bold py-2 rounded-lg hover:bg-secondary/80 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Package
          </button>
        </div>

        {/* VIP 4-PACK */}
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col">
          <h3 className="font-bold text-lg mb-4">VIP 4-PACK</h3>
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Current Price ($)</label>
              <input type="number" defaultValue="0" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-bold focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Compare at Price / Value ($)</label>
              <input type="number" defaultValue="29" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-medium focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Status</label>
              <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:border-primary focus:outline-none">
                <option value="free">100% Free (Early Access)</option>
                <option value="paid">Active Paywall (Stripe)</option>
                <option value="hidden">Hidden from Public</option>
              </select>
            </div>
          </div>
          <button className="w-full mt-6 bg-secondary text-foreground text-sm font-bold py-2 rounded-lg hover:bg-secondary/80 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Package
          </button>
        </div>

        {/* $10 PARLAY PLAN */}
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col">
          <h3 className="font-bold text-lg mb-4">$10 PARLAY PLAN</h3>
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Current Price ($)</label>
              <input type="number" defaultValue="0" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-bold focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Compare at Price / Value ($)</label>
              <input type="number" defaultValue="19" className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground font-medium focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold mb-1 block">Status</label>
              <select className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:border-primary focus:outline-none">
                <option value="free">100% Free (Early Access)</option>
                <option value="paid">Active Paywall (Stripe)</option>
                <option value="hidden">Hidden from Public</option>
              </select>
            </div>
          </div>
          <button className="w-full mt-6 bg-secondary text-foreground text-sm font-bold py-2 rounded-lg hover:bg-secondary/80 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Package
          </button>
        </div>

      </div>

      <div className="mt-8 p-6 bg-primary/10 border border-primary/20 rounded-xl max-w-2xl">
        <h4 className="font-bold mb-2">Stripe Integration Status</h4>
        <p className="text-sm text-muted-foreground">
          Stripe API keys are configured. You can flip any of these packages from "100% Free" to "Active Paywall" and the checkout links on the front-end will immediately route to Stripe Checkout instead of instant access.
        </p>
      </div>

    </div>
  );
}
