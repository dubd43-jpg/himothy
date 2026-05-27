import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Asleep Picks Today — Quiet Markets, Real Edges",
  description: "Tonight's softest-priced sports picks: NCAA Baseball, KBO, UFC, AFL, rugby, lesser soccer leagues. The games sharps watch and the public ignores — where the line inefficiencies live.",
  path: "/asleep",
  keywords: [
    "asleep picks", "soft picks", "quiet sports markets", "ncaa baseball picks today",
    "kbo picks", "afl picks", "rugby picks today", "lesser leagues betting", "sharp picks",
  ],
});

export default function AsleepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
