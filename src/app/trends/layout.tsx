import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: "Hot Tendencies — ATS & O/U Trends For Tonight's Games",
  description: "Teams on tonight's board with a 70%+ ATS or Over/Under hit rate over the last 10 games. Real closing-line data, multi-book consensus.",
  path: "/trends",
  keywords: [
    "ats trends today", "over under trends", "team ats records", "hot teams against the spread",
    "mlb ats trends", "nba ats trends", "hottest betting trends", "ats picks today",
  ],
});

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
