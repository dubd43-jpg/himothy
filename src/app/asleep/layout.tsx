import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Sleeper Picks Today — Quiet Markets, Real Edges",
  description: "Tonight's softest-priced sports picks: NCAA Baseball, KBO, UFC, AFL, rugby, smaller soccer leagues. Games sharps watch and the public ignores.",
  path: "/asleep",
  keywords: [
    "asleep picks", "soft picks", "quiet sports markets", "ncaa baseball picks today",
    "kbo picks", "afl picks", "rugby picks today", "lesser leagues betting", "sharp picks",
  ],
});

export default function AsleepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
