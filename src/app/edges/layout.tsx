import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Tonight's Edges — Top Picks With Real Value",
  description: "Every signal on tonight's board: real-line value plays (positive EV vs true line), hot historical buckets, strong team trends, and sharp money alignment. The four sharpest reads, ranked.",
  path: "/edges",
  keywords: [
    "best picks tonight", "value picks today", "positive ev sports picks",
    "sharp money picks", "ats picks today", "best sports bets", "betting edge",
  ],
});

export default function EdgesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
