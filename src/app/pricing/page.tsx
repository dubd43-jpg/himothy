"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Trophy, Flame, CheckCircle2, X } from "lucide-react";
import { PRICING_PRODUCTS, type ProductKey, type PriceInterval } from "@/lib/products";
import { getOrCreateUserId, getStoredEmail, setStoredEmail, isValidEmail } from "@/lib/clientUser";

const INTERVAL_LABELS: Record<PriceInterval, string> = {
  one_day: "1-Day",
  one_week: "7-Day",
  one_month: "Monthly",
  one_year: "Annual",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function perDayRate(amountCents: number, interval: PriceInterval): string {
  const days = interval === "one_day" ? 1 : interval === "one_week" ? 7 : interval === "one_month" ? 30 : 365;
  const perDay = amountCents / days;
  return `~${perDay >= 100 ? `$${(perDay / 100).toFixed(2)}` : `${perDay.toFixed(0)}¢`}/day`;
}

// Sport card accent config keyed by product key
const SPORT_ACCENT: Record<string, { border: string; bg: string; badge: string; emoji: string }> = {
  nba_package:    { border: "border-blue-500/40",    bg: "from-blue-600/15",    badge: "bg-blue-600",    emoji: "🏀" },
  mlb_package:    { border: "border-red-500/40",     bg: "from-red-600/15",     badge: "bg-red-600",     emoji: "⚾" },
  nhl_package:    { border: "border-sky-500/40",     bg: "from-sky-600/15",     badge: "bg-sky-600",     emoji: "🏒" },
  nfl_package:    { border: "border-green-600/40",   bg: "from-green-700/15",   badge: "bg-green-700",   emoji: "🏈" },
  soccer_package: { border: "border-emerald-500/40", bg: "from-emerald-600/15", badge: "bg-emerald-600", emoji: "⚽" },
  tennis_package: { border: "border-lime-500/40",    bg: "from-lime-600/15",    badge: "bg-lime-600",    emoji: "🎾" },
  ufc_package:    { border: "border-orange-500/40",  bg: "from-orange-600/15",  badge: "bg-orange-600",  emoji: "🥊" },
  golf_package:   { border: "border-teal-500/40",    bg: "from-teal-600/15",    badge: "bg-teal-600",    emoji: "⛳" },
  ncaa_package:   { border: "border-purple-500/40",  bg: "from-purple-600/15",  badge: "bg-purple-600",  emoji: "🎓" },
  wnba_package:   { border: "border-orange-400/40",  bg: "from-orange-500/15",  badge: "bg-orange-500",  emoji: "🏀" },
};

export default function PricingPage() {
  const [activeInterval, setActiveInterval] = useState<PriceInterval>("one_month");
  const [pending, setPending] = useState<{ productKey: ProductKey; interval: PriceInterval } | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");

  const launchCheckout = async (productKey: ProductKey, interval: PriceInterval, email: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productKey, interval, userId: getOrCreateUserId(), email }),
      });
      const j = await res.json();
      if (j?.url) { window.location.href = j.url; return; }
      setEmailError(j?.error || "Checkout unavailable — check back shortly.");
    } catch (e: any) {
      setEmailError(e?.message || "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  const startCheckout = (productKey: ProductKey, interval: PriceInterval) => {
    const stored = getStoredEmail();
    if (stored && isValidEmail(stored)) { void launchCheckout(productKey, interval, stored); return; }
    setEmailInput(""); setEmailError(""); setPending({ productKey, interval });
  };

  const confirmEmailAndCheckout = () => {
    const email = emailInput.trim().toLowerCase();
    if (!isValidEmail(email)) { setEmailError("Enter a valid email address."); return; }
    setStoredEmail(email);
    if (pending) void launchCheckout(pending.productKey, pending.interval, email);
  };

  // Visible products only
  const himothy = PRICING_PRODUCTS.find((p) => p.key === "himothy_package");
  const bundle = PRICING_PRODUCTS.find((p) => p.key === "all_sports_bundle");
  const sportPackages = PRICING_PRODUCTS.filter((p) => p.key !== "himothy_package" && p.key !== "all_sports_bundle");

  const getPrice = (productKey: ProductKey) => {
    const product = PRICING_PRODUCTS.find((p) => p.key === productKey);
    return product?.prices.find((p) => p.interval === activeInterval);
  };

  return (
    <div className="min-h-screen bg-background text-white pb-28">
      <div className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-white/35 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back home
        </Link>

        {/* Header */}
        <header className="text-center max-w-3xl mx-auto mb-10">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3">Pricing</div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">Choose Your Package</h1>
          <p className="text-base text-white/55 leading-relaxed">
            HIMOTHY Package for the best picks across every sport. Sport packages for up to 7 picks in your sport. Or get everything with the All-Sports Bundle.
          </p>
        </header>

        {/* Interval selector */}
        <div className="flex items-center justify-center mb-10">
          <div className="inline-flex rounded-full border border-white/12 bg-white/[0.03] p-1 gap-0.5">
            {(["one_day", "one_week", "one_month", "one_year"] as PriceInterval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setActiveInterval(iv)}
                className={`px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeInterval === iv ? "bg-primary text-black" : "text-white/55 hover:text-white"
                }`}
              >
                {INTERVAL_LABELS[iv]}
                {iv === "one_year" && <span className="ml-1.5 text-[9px] text-emerald-400">Save 40%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── HIMOTHY PACKAGE — FEATURED ───────────────────────────────────── */}
        {himothy && (() => {
          const price = getPrice("himothy_package");
          if (!price) return null;
          return (
            <div className="rounded-3xl border-2 border-primary/50 bg-gradient-to-br from-primary/[0.12] via-card/60 to-transparent p-7 md:p-9 mb-8 relative overflow-hidden himo-glow">
              <div className="absolute top-5 right-5 flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest bg-primary text-black px-3 py-1 rounded-full">Flagship</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight text-white">HIMOTHY Package</h2>
                      <p className="text-[11px] text-white/45 font-semibold">Grand Slam · Pressure Pack · 4-Pack · System Parlay</p>
                    </div>
                  </div>

                  <p className="text-white/60 text-sm leading-relaxed mb-5">
                    All our best picks across every sport, ranked #1 → #7. Best pick is always first. Cross-sport — whatever sport has the edge that day, it&apos;s here. System builds a parlay when the edge is real.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {himothy.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs text-white/65 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-6">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-4xl font-black tabular-nums text-white">{formatPrice(price.amountCents)}</span>
                      <span className="text-sm text-white/40">
                        {price.isRecurring ? (activeInterval === "one_month" ? "/mo" : "/yr") : ` · ${activeInterval === "one_day" ? "1-day" : "7-day"} pass`}
                      </span>
                    </div>
                    <div className="text-xs text-white/35 mb-5">{perDayRate(price.amountCents, activeInterval)} effective</div>
                    <button
                      type="button"
                      onClick={() => startCheckout("himothy_package", activeInterval)}
                      className="w-full rounded-2xl bg-primary py-3.5 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition-all"
                    >
                      {price.isRecurring ? "Subscribe Now" : `Get ${activeInterval === "one_day" ? "1-Day" : "7-Day"} Pass`}
                    </button>
                    {price.isRecurring && (
                      <p className="text-center text-[10px] text-white/30 mt-2">14-day free trial · Cancel anytime</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── SPORT PACKAGES GRID ─────────────────────────────────────────── */}
        <div className="mb-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35 mb-6 text-center">Sport Packages — Up to 7 Picks + Optional Parlay</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sportPackages.map((product) => {
              const price = getPrice(product.key as ProductKey);
              if (!price) return null;
              const accent = SPORT_ACCENT[product.key] || { border: "border-white/15", bg: "from-white/5", badge: "bg-white/20", emoji: "🏆" };

              return (
                <article
                  key={product.key}
                  className={`rounded-3xl border-2 ${accent.border} bg-gradient-to-br ${accent.bg} to-transparent p-6 flex flex-col gap-4 transition-all hover:scale-[1.01]`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-4xl leading-none">{accent.emoji}</div>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${accent.badge} text-white px-2.5 py-0.5 rounded-full`}>
                      Up to 7 picks
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">{product.name}</h3>
                    <p className="text-[11px] text-white/50 mt-1 leading-snug">{product.shortDescription}</p>
                  </div>

                  <div className="space-y-1.5">
                    {product.features.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[10px] text-white/50 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" /> {f}
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-3 border-t border-white/8">
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-2xl font-black tabular-nums text-white">{formatPrice(price.amountCents)}</span>
                      <span className="text-xs text-white/35">
                        {price.isRecurring ? (activeInterval === "one_month" ? "/mo" : "/yr") : ` · ${activeInterval === "one_day" ? "1-day" : "7-day"}`}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/30 mb-3">{perDayRate(price.amountCents, activeInterval)} effective</div>
                    <button
                      type="button"
                      onClick={() => startCheckout(product.key as ProductKey, activeInterval)}
                      className="w-full rounded-xl border border-white/15 bg-white/8 py-2.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/16 transition-all"
                    >
                      {price.isRecurring ? "Subscribe" : `Get Pass`}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* ── ALL-SPORTS BUNDLE ────────────────────────────────────────────── */}
        {bundle && (() => {
          const price = getPrice("all_sports_bundle");
          if (!price) return null;
          return (
            <div className="mt-8 rounded-3xl border-2 border-white/20 bg-gradient-to-r from-primary/[0.07] via-transparent to-[hsla(207,100%,38%,0.07)] p-7 md:p-9 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-5">
                <div className="text-5xl">🏆</div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Best Value</div>
                  <h3 className="text-2xl font-black uppercase tracking-tight text-white">All-Sports Bundle</h3>
                  <p className="text-white/50 text-sm leading-relaxed mt-1 max-w-lg">{bundle.longDescription}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {bundle.features.map((f) => (
                      <div key={f} className="flex items-center gap-1 text-[10px] text-white/50 font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 shrink-0 min-w-[180px]">
                <div className="text-center">
                  <div className="text-[10px] text-white/35 uppercase tracking-widest">Everything included</div>
                  <div className="text-4xl font-black tabular-nums text-white mt-1">
                    {formatPrice(price.amountCents)}
                    <span className="text-base text-white/40">{price.isRecurring ? (activeInterval === "one_month" ? "/mo" : "/yr") : ""}</span>
                  </div>
                  <div className="text-xs text-white/30 mt-0.5">{perDayRate(price.amountCents, activeInterval)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => startCheckout("all_sports_bundle", activeInterval)}
                  className="w-full rounded-2xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition-all"
                >
                  Get Everything
                </button>
                {price.isRecurring && (
                  <p className="text-center text-[10px] text-white/30">14-day free trial · Cancel anytime</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Trust badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Cancel anytime</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">Stripe-hosted billing. One click to cancel. No calls.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Secure checkout</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">Powered by Stripe. We never see your card number.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex items-start gap-3">
            <Trophy className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/80">Verified record</div>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">Every pick graded publicly. No fake history.</p>
            </div>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="mt-10 rounded-2xl border border-yellow-500/15 bg-yellow-500/[0.03] p-6 text-xs text-yellow-500/65 leading-relaxed space-y-2">
          <p className="font-black uppercase tracking-widest text-yellow-500">Required Disclosures</p>
          <p>All content is sports analysis and opinion for <strong>entertainment and informational purposes only</strong>. We are not a sportsbook. Past performance does not guarantee future results — no outcome is guaranteed and you may lose money.</p>
          <p>Users must be <strong>21+</strong> and comply with all local laws. Problem gambling? Call <a href="tel:18004262537" className="underline text-yellow-400">1-800-GAMBLER</a>.</p>
          <p>Subscriptions auto-renew. Cancel before next renewal in your account portal. Content is delivered immediately; <strong>no refunds once delivered</strong>. <Link href="/terms" className="underline text-yellow-400">Terms</Link> · <Link href="/privacy" className="underline text-yellow-400">Privacy</Link>.</p>
        </div>
      </div>

      {/* Email modal */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => !submitting && setPending(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border-2 border-primary/30 bg-background p-6 md:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-xl font-black uppercase tracking-tight">Where do we send access?</h3>
              <button type="button" onClick={() => !submitting && setPending(null)} className="text-white/35 hover:text-white" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              We use your email for your receipt and to keep access tied to your account. You&apos;ll finish payment on Stripe.
            </p>
            <input
              type="email"
              inputMode="email"
              autoFocus
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmEmailAndCheckout(); }}
              placeholder="you@email.com"
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-base text-white placeholder:text-white/25 focus:border-primary/60 focus:outline-none"
            />
            {emailError && <p className="mt-2 text-xs font-bold text-red-400">{emailError}</p>}
            <button
              type="button"
              onClick={confirmEmailAndCheckout}
              disabled={submitting}
              className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition disabled:opacity-50"
            >
              {submitting ? "Opening secure checkout…" : "Continue to checkout"}
            </button>
            <p className="mt-3 text-center text-[10px] text-white/25">Payment processed by Stripe · we never see your card.</p>
          </div>
        </div>
      )}
    </div>
  );
}
