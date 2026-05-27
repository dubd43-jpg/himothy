import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Tonight's Edges — Top Picks With Real Value",
  description: "Every signal on tonight's board: positive-EV plays vs true line, hot historical buckets, team trends, and sharp money alignment, ranked.",
  path: "/edges",
  keywords: [
    "best picks tonight", "value picks today", "positive ev sports picks",
    "sharp money picks", "ats picks today", "best sports bets", "betting edge",
  ],
});

export default function EdgesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
