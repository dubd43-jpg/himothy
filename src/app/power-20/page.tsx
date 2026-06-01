"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Power 20 lives inside /picks?board=power20 as a tab. This dedicated route exists
// so /power-20 deep links / SEO / footer-link references resolve cleanly instead
// of 404. Redirects to the canonical tab view.
export default function Power20Landing() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/picks?board=power20");
  }, [router]);
  return (
    <div className="min-h-screen bg-background text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-primary animate-spin" />
        <span className="text-sm text-white/40">Loading Power 20…</span>
      </div>
    </div>
  );
}
