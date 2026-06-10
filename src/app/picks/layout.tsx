import { absoluteUrl, pageMeta, collectionPageJsonLd, faqJsonLd } from '@/lib/seo';

const PICKS_FAQS = [
  {
    question: "How does the HIMOTHY Board work?",
    answer: "Every day the engine ranks every pick across every sport and market — spreads, totals, props, NRFI, period plays, anything — by confidence. The top pick becomes the Grand Slam. Picks 2 and 3 are the Pressure Pack. Picks 4 through 7 are the 4-Pack. If a system parlay earns its spot, it shows at the bottom. That's the whole board."
  },
  {
    question: "What's the difference between the Grand Slam, Pressure Pack, and 4-Pack?",
    answer: "It's a confidence ranking, not separate products. Grand Slam is the single highest-confidence play of the day across any sport or market. Pressure Pack is #2 and #3. The 4-Pack is #4 through #7. Some days the Grand Slam doesn't post — that means nothing cleared the bar. We never fill slots just to fill them."
  },
  {
    question: "How often are picks updated?",
    answer: "The board is generated once each morning and stays frozen through the day — so the picks you see at 9am are the same ones at 7pm. No moving picks after they're posted. Once a game goes live, it's graded when it finishes."
  },
  {
    question: "Where can I see the verified win/loss record?",
    answer: "The full record is at /stats — every graded pick since launch, wins, losses, and pushes. Honest record from day one, no backdated wins."
  },
];

export const metadata = pageMeta({
  title: "Today's Sports Picks — HIMOTHY Board",
  description: "The HIMOTHY Board: Grand Slam, Pressure Pack, and 4-Pack — the top 7 picks of the day across every sport and market, ranked by confidence. System parlay when earned.",
  path: '/picks',
  keywords: [
    "sports picks today", "free sports picks", "daily picks", "best picks tonight",
    "grand slam pick", "best pick today", "top sports picks", "free mlb picks today",
    "free nba picks", "free nhl picks", "free ufc picks", "free tennis picks",
    "expert sports picks", "ats picks", "moneyline picks", "over under picks",
  ],
});

export default function PicksLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageJsonLd({
          url: absoluteUrl('/picks'),
          name: "HIMOTHY Board — Today's Top Picks",
          description: "The top 7 picks of the day across every sport and market, ranked by confidence. Grand Slam, Pressure Pack, 4-Pack, system parlay when earned.",
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
