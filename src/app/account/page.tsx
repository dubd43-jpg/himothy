"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, Lock } from "lucide-react";
import { getOrCreateUserId, getStoredEmail } from "@/lib/clientUser";

const PRODUCT_LABELS: Record<string, { name: string; href: string }> = {
  grand_slam: { name: "HIMOTHY Board Access", href: "/picks" },
  himothy_personal: { name: "HIMOTHY Board Access", href: "/picks" },
  pressure_pack: { name: "HIMOTHY Board Access", href: "/picks" },
  vip_4_pack: { name: "HIMOTHY Board Access", href: "/picks" },
  power_20: { name: "HIMOTHY Board Access", href: "/picks" },
  power_10: { name: "HIMOTHY Board Access", href: "/picks" },
  himothy_package: { name: "HIMOTHY Board Access", href: "/picks" },
  nba_package: { name: "HIMOTHY Board Access", href: "/picks" },
  mlb_package: { name: "HIMOTHY Board Access", href: "/picks" },
};

interface MeResponse {
  authenticated: boolean;
  hasYearlyAccess: boolean;
  productKeys: string[];
  details: Array<{ productKey: string; accessUntil: string; isOneTime: boolean; status: string }>;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York",
  }).format(d);
}

function AccountInner() {
  const params = useSearchParams();
  const justPaid = params.get("checkout") === "success";
  const sessionId = params.get("session_id") || "";

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // On return from Stripe, reconcile the session so access is granted instantly
        // (and the himothy_uid cookie is set) even if the webhook hasn't fired yet.
        if (sessionId) {
          try {
            await fetch("/api/account/confirm", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ session_id: sessionId }),
            });
          } catch {/* fall through to the entitlements read */}
        }
        const userId = getOrCreateUserId();
        const res = await fetch(`/api/account/me?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
        const j = await res.json();
        if (!cancelled) setMe(j);
      } catch {
        if (!cancelled) setMe({ authenticated: false, hasYearlyAccess: false, productKeys: [], details: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: getOrCreateUserId(), email: getStoredEmail() || "" }),
      });
      const j = await res.json();
      if (j?.url) window.location.href = j.url;
      else { alert(j?.error || "Could not open billing portal."); setPortalLoading(false); }
    } catch {
      alert("Could not open billing portal.");
      setPortalLoading(false);
    }
  };

  const hasAccess = (me?.productKeys?.length || 0) > 0;

  return (
    <div className="min-h-screen bg-background text-white pb-24">
      <div className="mx-auto max-w-2xl px-5 py-8 md:px-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/picks" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Picks
          </Link>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/logo-badge.png" alt="HIMOTHY" width={30} height={30} className="rounded-full border border-primary/40" />
            <span className="hidden sm:block text-xs font-black uppercase tracking-tight">HIMOTHY <span className="text-primary italic">Plays &amp; Parlays</span></span>
          </Link>
        </div>

        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Your Account</h1>

        {justPaid && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-black uppercase tracking-widest text-emerald-400">Payment received</div>
              <p className="text-sm text-white/70 mt-1 leading-relaxed">You&apos;re all set. Your picks are unlocked below.</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : hasAccess ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-3">Active access</div>
              <div className="space-y-2">
                {me!.details.map((d, i) => {
                  const label = PRODUCT_LABELS[d.productKey] || { name: d.productKey, href: "/picks" };
                  return (
                    <Link key={`${d.productKey}-${i}`} href={label.href} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 hover:border-primary/40 transition">
                      <div>
                        <div className="text-sm font-bold text-white">{label.name}</div>
                        <div className="text-[11px] text-white/40">
                          {d.status === "trialing" ? "Free trial" : d.isOneTime ? "Pass" : "Subscription"} · access through {fmtDate(d.accessUntil)} ET
                        </div>
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-primary">Open</span>
                    </Link>
                  );
                })}
              </div>
              {me!.hasYearlyAccess && (
                <p className="mt-3 text-[11px] text-emerald-400/80 font-bold uppercase tracking-widest">Yearly member — research tools unlocked</p>
              )}
            </div>

            <button
              type="button"
              onClick={openPortal}
              disabled={portalLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition disabled:opacity-50"
            >
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Manage billing &amp; cancel
            </button>
          </>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] py-12 text-center px-6">
            <Lock className="h-8 w-8 text-white/30 mx-auto mb-3" />
            <h3 className="text-xl font-black uppercase tracking-tight">No active subscription</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/50 leading-relaxed">
              You don&apos;t have an active plan on this device yet. Pick a plan to unlock the picks.
            </p>
            <Link href="/pricing" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-white transition">
              See plans
            </Link>
          </div>
        )}

        <p className="text-[11px] text-white/30 leading-relaxed">
          Access is tied to this browser. If you bought on another device, open this page there, or use the same browser. Need help? <a href="mailto:support@himothypicks.com" className="underline">support@himothypicks.com</a>
        </p>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AccountInner />
    </Suspense>
  );
}
