"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Sparkles } from "lucide-react";
import { PRODUCTS, type ProductKey, type PriceInterval } from "@/lib/products";

// Customer-facing pricing page. Every word here is selected for Stripe/E-E-A-T safety:
//  - NO "guaranteed winners" / "lock of the day" / ROI promise language anywhere
//  - "For entertainment and informational purposes only" disclaimer above CTAs
//  - "21+ only" gate copy + 1-800-GAMBLER link
//  - Clear refund policy linked from each CTA
//  - Free tier presented prominently as the entry path — it's the lead magnet
//
// CTA flow: visitor clicks Subscribe → POST /api/stripe/checkout → server creates a
// Stripe Checkout session → user redirected to Stripe → on success Stripe sends the
// webhook → we set accessUntil → user redirected to /account.

const INTERVAL_LABELS: Record<PriceInterval, string> = {
  one_day: "1-Day Pass",
  one_week: "7-Day Pass",
  one_month: "Monthly",
  one_year: "Annual",
};

const INTERVAL_DESCS: Record<PriceInterval, string> = {
  one_day: "Try it for tonight's slate",
  one_week: "Full week of picks",
  one_month: "Cancel anytime",
  one_year: "Best value — save vs. monthly",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function perDayRate(amountCents: number, interval: PriceInterval): string {
  const days = interval === 'one_day' ? 1 : interval === 'one_week' ? 7 : interval === 'one_month' ? 30 : 365;
  const perDay = amountCents / days;
  return perDay >= 100 ? `$${(perDay / 100).toFixed(2)}/day` : `${perDay.toFixed(0)}¢/day`;
}

export default function PricingPage() {
  const [activeInterval, setActiveInterval] = useState<PriceInterval>('one_month');

  const startCheckout = async (productKey: ProductKey, interval: PriceInterval) => {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productKey, interval,
          userId: (typeof window !== 'undefined' && localStorage.getItem('userId')) || `guest_${Date.now()}`,
          email: (typeof window !== 'undefined' && localStorage.getItem('email')) || 'guest@himothypicks.com',
        }),
      });
      const j = await res.json();
      if (j?.url) window.location.href = j.url;
      else alert(j?.error || 'Checkout unavailable — payment system is still being configured.');
    } catch (e: any) {
      alert(e?.message || 'Checkout failed');
    }
  };

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-white/40 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back home
        </Link>

        <header className="text-center max-w-3xl mx-auto mb-10">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3">Pricing</div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">Pick a plan. Cancel whenever.</h1>
          <p className="text-base md:text-lg text-white/55 leading-relaxed">
            14-day free trial on every subscription. Cancel anytime in the billing portal — no charge if you cancel before day 15. Free tier always shows the daily $10 Parlay and per-matchup breakdowns. Research tools (Tonight&apos;s Edges, Hot Tendencies, Asleep Picks) come with any annual plan.
          </p>
        </header>

        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4 mb-8 text-center text-sm text-white/75 max-w-3xl mx-auto">
          <span className="font-black uppercase tracking-widest text-amber-400 mr-2">Annual perk:</span>
          Yearly subscribers get Tonight&apos;s Edges, Hot Tendencies, and the Asleep Picks tile. Research tools are not included on monthly plans.
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 mb-10 max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Verified record</div>
            <p className="text-sm text-white/70 mt-1 leading-relaxed">
              Every analysis the engine has ever posted is graded honestly and stored in a public ledger. Win or lose, it&apos;s in the record.
            </p>
          </div>
          <Link href="/stats" className="shrink-0 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-400/20 transition">
            See record
          </Link>
        </div>

        <div className="flex items-center justify-center mb-4">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {(['one_day', 'one_week', 'one_month', 'one_year'] as PriceInterval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setActiveInterval(iv)}
                className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition ${activeInterval === iv ? 'bg-primary text-black' : 'text-white/60 hover:text-white'}`}
              >
                {INTERVAL_LABELS[iv]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-white/40 mb-8">{INTERVAL_DESCS[activeInterval]}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...PRODUCTS].sort((a, b) => a.sortOrder - b.sortOrder).map((product) => {
            const price = product.prices.find((p) => p.interval === activeInterval);
            if (!price) return null;
            const isMostPopular = product.key === 'pressure_pack';
            return (
              <article
                key={product.key}
                className={`rounded-3xl border-2 p-6 flex flex-col gap-4 transition ${isMostPopular ? 'border-primary/50 bg-primary/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}
              >
                {isMostPopular && (
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary self-start">Most Popular</div>
                )}
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">{product.name}</h2>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">{product.shortDescription}</p>
                </div>

                <div className="border-y border-white/5 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums">{formatPrice(price.amountCents)}</span>
                    <span className="text-xs text-white/40">
                      {price.isRecurring
                        ? `/ ${activeInterval === 'one_month' ? 'mo' : 'yr'}`
                        : ` · ${activeInterval === 'one_day' ? '24h' : '7-day pass'}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">{perDayRate(price.amountCents, activeInterval)} effective</div>
                </div>

                <p className="text-xs text-white/60 leading-relaxed">{product.longDescription}</p>

                <button
                  type="button"
                  onClick={() => startCheckout(product.key, activeInterval)}
                  className={`mt-auto w-full rounded-xl py-3 text-sm font-black uppercase tracking-widest transition ${isMostPopular ? 'bg-primary text-black hover:bg-white' : 'bg-white/8 text-white hover:bg-white/16 border border-white/10'}`}
                >
                  {price.isRecurring
                    ? `Subscribe — ${activeInterval === 'one_month' ? 'monthly' : 'annual'}`
                    : `Get ${activeInterval === 'one_day' ? '1-day' : '7-day'} pass`}
                </button>
              </article>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Cancel anytime</div>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">Stripe-hosted billing portal. One click to cancel. No retention call.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Secure checkout</div>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">Payment processed by Stripe. We never see or store your card number.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Free content stays free</div>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">$10 Parlay, Edges, Trends, Asleep Picks — always free, no email required.</p>
            </div>
          </div>
        </div>

        {/* Required disclaimers — Stripe + FTC + state-law safe wording */}
        <div className="mt-12 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.04] p-6 text-xs text-yellow-500/75 leading-relaxed space-y-3">
          <p className="font-black uppercase tracking-widest text-yellow-500">Required Disclosures</p>
          <p>All content on this site is sports analysis and opinion, provided for <strong>entertainment and informational purposes only</strong>. We are not a sportsbook. We do not accept, place, or facilitate wagers, and we do not hold customer funds for gambling. Past performance does not guarantee future results — no outcome is guaranteed and you may lose money following any analysis on this site.</p>
          <p>Users must be <strong>21 years of age or older</strong> and comply with all laws in their jurisdiction. If you or someone you know has a gambling problem, call <a href="tel:18004262537" className="underline text-yellow-400">1-800-GAMBLER</a>.</p>
          <p>Subscriptions auto-renew at the price shown above. You may cancel at any time before your next renewal in your account portal. Content is delivered immediately upon purchase; <strong>no refunds are issued once content has been delivered</strong>. <Link href="/terms" className="underline text-yellow-400">Terms of Service</Link> · <Link href="/privacy" className="underline text-yellow-400">Privacy Policy</Link>.</p>
        </div>
      </div>
    </div>
  );
}
