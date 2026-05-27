import { absoluteUrl, pageMeta, collectionPageJsonLd, faqJsonLd } from '@/lib/seo';

// FAQs targeted at the picks hub — different angle than the homepage FAQs.
// Surfaced as FAQPage JSON-LD so Google can expand them inline on the SERP.
const PICKS_FAQS = [
  {
    question: "How often are today's picks updated?",
    answer: "The board refreshes automatically every 2 minutes during the live window — so injury news, line moves, and lineup scratches flow through to the picks before tipoff. A cron warmer runs at 8am ET daily so the slate is cached and instant for the first user of the day."
  },
  {
    question: "What's the difference between the Grand Slam, Pressure Pack, and VIP 4-Pack?",
    answer: "Grand Slam is the rare single-game near-lock — only posts when win probability is 66%+ with full signal confluence. Pressure Pack is 2 high-confidence plays per day. VIP 4-Pack is a 4-leg curated set with mixed confidence levels. Parlay Plan is the daily $10 parlay. Most days the Grand Slam is empty — that's the point. We only drop it when we genuinely feel it."
  },
  {
    question: "Why is some Pick saying 'Stay Away' instead of a play?",
    answer: "When two teams' last-10 tendencies cancel out and the math edge vs. the posted line is under 0.7 points (totals) or 1.5 points (spreads), the system flags it as Stay Away — the book has the line priced correctly and there's no real edge. Better to skip than guess. The reasoning shows on every pick's breakdown page."
  },
  {
    question: "Where can I see the verified win/loss record?",
    answer: "The full record lives at /stats. Every pick is graded against the official result the moment the game finishes — wins, losses, and pushes. Broken out by category (Grand Slam, Pressure Pack, etc.), by odds bucket, and by parlay leg count. Honest record from day one. No backdated wins, no fake history."
  },
];

export const metadata = pageMeta({
  title: "Today's Sports Picks — Free Daily Plays & Parlays",
  description: "Tonight's full slate across MLB, NBA, NHL, NFL, UFC, tennis, golf. Grand Slam, Pressure Pack, VIP 4-Pack, $10 Parlay Plan. Real plays, verified record.",
  path: '/picks',
  keywords: [
    "sports picks today", "free sports picks", "daily picks", "best picks tonight",
    "free parlay picks", "free mlb picks today", "free nba picks", "free nhl picks",
    "free wnba picks", "free ufc picks", "free tennis picks", "best parlay today",
    "expert sports picks", "ats picks", "moneyline picks", "over under picks",
    "$10 parlay plan", "free pick of the day",
  ],
});

export default function PicksLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageJsonLd({
          url: absoluteUrl('/picks'),
          name: "Today's Sports Picks",
          description: "Daily curated sports picks across every major league — moneyline, spread, total, props, parlays.",
        })) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(PICKS_FAQS)) }}
      />
      {children}
    </>
  );
}
