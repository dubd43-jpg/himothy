"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

// Gated content wrapper — shows children only to yearly subscribers. Everyone else sees
// a teaser explaining what's behind the gate + a CTA to the pricing page. SEO content
// outside this wrapper (the evergreen prose) stays indexable for Google.
//
// Yearly status is fetched client-side from /api/account/me which reads the userId from
// localStorage (will swap to auth session when auth is wired).
export function YearlyMemberGate({
  toolName,
  toolDescription,
  children,
}: {
  toolName: string;
  toolDescription: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<'loading' | 'yearly' | 'locked'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = (typeof window !== 'undefined' && localStorage.getItem('userId')) || '';
        if (!userId) {
          if (!cancelled) setStatus('locked');
          return;
        }
        const res = await fetch(`/api/account/me?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
        const j = await res.json();
        if (!cancelled) setStatus(j?.hasYearlyAccess ? 'yearly' : 'locked');
      } catch {
        if (!cancelled) setStatus('locked');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (status === 'yearly') return <>{children}</>;

  // Locked view — premium paywall
  return (
    <section className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.08] to-transparent p-8 md:p-10 text-center max-w-2xl mx-auto">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary mb-5">
        <Lock className="h-3.5 w-3.5" /> Yearly Members Only
      </div>
      <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-3">{toolName}</h2>
      <p className="text-sm md:text-base text-white/60 leading-relaxed mb-6 max-w-md mx-auto">{toolDescription}</p>
      <p className="text-xs text-white/40 leading-relaxed mb-7">
        This research data is exclusive to annual subscribers. Pick any annual plan to unlock {toolName} + every other research tool on the site.
      </p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 rounded-xl bg-primary text-black px-6 py-3 text-sm font-black uppercase tracking-widest hover:bg-white transition"
      >
        <Sparkles className="h-4 w-4" /> Unlock with Annual
      </Link>
      <div className="mt-5 text-[11px] text-white/30">
        14-day free trial · cancel anytime · <Link href="/pricing" className="underline">see all plans</Link>
      </div>
    </section>
  );
}
