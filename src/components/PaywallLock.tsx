"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { PRODUCTS, type ProductKey } from "@/lib/products";

interface PaywallLockProps {
  // The ProductKey this page requires. If the user doesn't have it AND doesn't
  // have an active signup trial covering it, the locked view renders.
  productKey: ProductKey;
  // Page subject — used only in the locked-view CTA copy.
  productLabel?: string;
  // Children render only when the user has access. Locked users see the upgrade card.
  children: React.ReactNode;
}

interface MeResponse {
  authenticated: boolean;
  productKeys: string[];
  email: string | null;
  trialUsed: boolean;
  trialActive: boolean;
  trialEndsAt: string | null;
}

// Three customer states the paywall can be in:
//   anonymous       — no cookie / no User row. Show signup CTA + sign-in link.
//   trial_active    — signed up, within their 7-day trial, but THIS product isn't
//                     in today's trial sampler (e.g. Grand Slam on day 3-7).
//                     Show "Subscribe to unlock Grand Slam" + sign-out.
//   trial_expired   — signed in but accessUntil has passed. Show "Trial ended,
//                     pick a plan" + sign-out.
//
// Picks are server-side filtered too; this component is the visible UX layer.
export function PaywallLock({ productKey, productLabel, children }: PaywallLockProps) {
  type ViewerState = 'loading' | 'allowed' | 'anonymous' | 'trial_active' | 'trial_expired';
  const [state, setState] = useState<ViewerState>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [signupShown, setSignupShown] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [stateValue, setStateValue] = useState('');
  const [signinShown, setSigninShown] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        const d = (await res.json()) as MeResponse;
        if (!mounted) return;
        setMe(d);
        const allowed = (d?.productKeys || []).includes(productKey);
        if (allowed) { setState('allowed'); return; }
        if (!d?.authenticated) { setState('anonymous'); return; }
        // Authenticated but no entitlement for this product. Either the trial is
        // active and this product isn't in today's sampler, or the trial expired.
        if (d.trialActive) setState('trial_active');
        else setState('trial_expired');
      } catch {
        if (mounted) setState('anonymous');
      }
    })();
    return () => { mounted = false; };
  }, [productKey]);

  const signOut = async () => {
    try {
      await fetch('/api/account/signout', { method: 'POST' });
      document.cookie = 'himothy_uid=; path=/; max-age=0; SameSite=Lax';
      window.location.reload();
    } catch { /* non-fatal */ }
  };

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 rounded-full border-2 border-white/15 border-t-primary animate-spin" />
      </div>
    );
  }
  if (state === 'allowed') {
    return <>{children}</>;
  }

  const product = PRODUCTS.find((p) => p.key === productKey);
  const monthly = product?.prices.find((p) => p.interval === 'one_month');
  const monthlyPrice = monthly ? `$${(monthly.amountCents / 100).toFixed(monthly.amountCents % 100 === 0 ? 0 : 2)}` : null;

  const submitAuth = async (path: string) => {
    setBusy(true);
    setErrMsg(null);
    try {
      // Signup payload includes age + state (required for signup, ignored on signin).
      const isSignup = path.includes('/signup');
      const payload = isSignup
        ? { email: emailInput.trim(), ageConfirmed, state: stateValue || null }
        : { email: emailInput.trim() };
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        setErrMsg(d?.error || d?.message || 'Failed');
        return;
      }
      if (d.userId) {
        document.cookie = `himothy_uid=${d.userId}; path=/; max-age=${90 * 24 * 60 * 60}; SameSite=Lax`;
      }
      window.location.reload();
    } catch (err: any) {
      setErrMsg(err?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };
  const startSignup = (e: React.FormEvent) => { e.preventDefault(); void submitAuth('/api/account/signup'); };
  const startSignin = (e: React.FormEvent) => { e.preventDefault(); void submitAuth('/api/account/signin'); };

  return (
    <div className="min-h-screen bg-background text-white px-5 py-8 md:px-8">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            ← All Picks
          </Link>
          <Link href="/" className="text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></Link>
        </div>
      <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent p-8 md:p-10 text-center space-y-5">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
          {state === 'trial_expired' ? 'Your free trial ended' : (productLabel || product?.name || 'Locked')}
        </h2>
        <p className="text-white/60 text-sm md:text-base leading-relaxed max-w-md mx-auto">
          {state === 'trial_expired'
            ? `Pick a plan below to unlock ${productLabel || product?.name || 'this product'} again — every category has its own price, or grab a bundle for the best value.`
            : state === 'trial_active'
            ? `${productLabel || product?.name || 'This product'} isn't part of today's trial sampler — subscribe to unlock it now.`
            : product?.shortDescription || 'Unlock this product to see tonight\'s picks and the full breakdown.'}
        </p>

        {/* Signed-in viewers (trial active OR expired) → pricing CTA, no signup form */}
        {(state === 'trial_active' || state === 'trial_expired') ? (
          <div className="space-y-3 pt-2">
            <Link
              href={`/pricing?product=${productKey}`}
              className="block w-full rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-sm py-4 hover:bg-white transition-all"
            >
              See pricing{monthlyPrice ? ` — from ${monthlyPrice}/mo` : ''}
            </Link>
            <Link
              href="/pricing"
              className="block w-full rounded-2xl border border-white/15 bg-white/[0.03] text-white font-black uppercase tracking-widest text-sm py-4 hover:bg-white/[0.06] transition-all"
            >
              View bundles — best value
            </Link>
            <div className="flex items-center justify-center gap-2 text-[11px] text-white/40 pt-2">
              <span>Signed in as {me?.email || 'you'}</span>
              <span>·</span>
              <button type="button" onClick={signOut} className="underline hover:text-white">Sign out</button>
            </div>
          </div>
        ) : !signupShown && !signinShown ? (
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => { setSignupShown(true); setErrMsg(null); }}
              className="block w-full rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-sm py-4 hover:bg-white transition-all"
            >
              Start your 7-day free trial — no card
            </button>
            <Link
              href={`/pricing?product=${productKey}`}
              className="inline-flex items-center justify-center gap-2 w-full rounded-2xl border border-white/15 bg-white/[0.03] text-white font-black uppercase tracking-widest text-sm py-4 hover:bg-white/[0.06] transition-all"
            >
              See pricing{monthlyPrice ? ` — from ${monthlyPrice}/mo` : ''} <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="text-[11px] text-white/40 pt-1">
              Already have an account?{' '}
              <button type="button" onClick={() => { setSigninShown(true); setErrMsg(null); }} className="text-primary underline">Sign in</button>
            </div>
          </div>
        ) : signupShown ? (
          <form onSubmit={startSignup} className="space-y-3 pt-2 text-left">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Email for your free trial</span>
              <input
                type="email" required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl bg-black/30 border border-white/15 px-4 py-3 text-base text-white placeholder-white/30 focus:outline-none focus:border-primary/60"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">State (optional)</span>
              <select
                value={stateValue}
                onChange={(e) => setStateValue(e.target.value)}
                className="mt-1 w-full rounded-xl bg-black/30 border border-white/15 px-4 py-3 text-base text-white focus:outline-none focus:border-primary/60"
              >
                <option value="">Select your state</option>
                {['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 cursor-pointer select-none mt-2">
              <input
                type="checkbox" required
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-1 accent-primary cursor-pointer"
              />
              <span className="text-xs text-white/70 leading-relaxed">
                <strong className="text-white">I confirm I am 21 or older</strong> and I agree to the{' '}
                <a href="/terms" target="_blank" className="text-primary underline">Terms of Service</a> and{' '}
                <a href="/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>.
                I understand HIMOTHY content is for entertainment purposes and that sports betting involves risk.
              </span>
            </label>
            {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
            <button
              type="submit"
              disabled={busy || !ageConfirmed}
              className="block w-full rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-sm py-4 hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Setting up…' : 'Start 7-day free trial'}
            </button>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Grand Slam included for the first 2 days. Every other product free for the full 7. No card required.
              If you or someone you know has a gambling problem, call 1-800-GAMBLER.
            </p>
            <button type="button" onClick={() => setSignupShown(false)} className="text-[11px] text-white/40 underline">← back</button>
          </form>
        ) : (
          <form onSubmit={startSignin} className="space-y-3 pt-2 text-left">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Email used at signup</span>
              <input
                type="email" required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl bg-black/30 border border-white/15 px-4 py-3 text-base text-white placeholder-white/30 focus:outline-none focus:border-primary/60"
              />
            </label>
            {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
            <button
              type="submit"
              disabled={busy}
              className="block w-full rounded-2xl bg-primary text-black font-black uppercase tracking-widest text-sm py-4 hover:bg-white transition-all disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setSigninShown(false)} className="text-[11px] text-white/40 underline">← back</button>
          </form>
        )}

        <p className="text-[11px] text-white/30">21+ only · 1-800-GAMBLER · entertainment only</p>
      </div>
      </div>
    </div>
  );
}
