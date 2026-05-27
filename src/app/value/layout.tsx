import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Value Plays — Picks With Real Edge vs True Line",
  description: "Today's moneyline picks where our best price beats the consensus true line. Real positive expected value, sorted by edge size. The honest math.",
  path: "/value",
  keywords: [
    "value picks today", "positive ev picks", "line shopping", "best sportsbook price",
    "true line picks", "edge betting", "sharp value picks", "ev plus picks",
  ],
});

export default function ValueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
