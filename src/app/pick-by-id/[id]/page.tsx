"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

// Registry-id deep-link redirect — the legacy admin board cards (MainPickCard, PickCard,
// CompactPickRow, ParlayCard) carry a registry pick.id (UUID), not a gameId. Direct
// link to /pick/[gameId] doesn't work for those. This page does the lookup + redirect:
// fetches the pick from the registry by id, then router.replace to /pick/[event_id].
export default function PickByIdRedirect() {
  const params = useParams() as { id: string };
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/picks/by-id/${encodeURIComponent(params.id)}`, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) router.replace("/picks");
          return;
        }
        const j = await r.json();
        if (j?.pick?.eventId) {
          if (!cancelled) router.replace(`/pick/${j.pick.eventId}?from=/picks`);
        } else {
          if (!cancelled) router.replace("/picks");
        }
      } catch {
        if (!cancelled) router.replace("/picks");
      }
    })();
    return () => { cancelled = true; };
  }, [params.id, router]);

  return (
    <div className="min-h-screen bg-background text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
        <span className="text-sm text-white/40">Loading pick…</span>
      </div>
    </div>
  );
}
