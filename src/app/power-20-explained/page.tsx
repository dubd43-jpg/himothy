import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { pageMeta, articleJsonLd, jsonLdString, breadcrumbsJsonLd, AUTHOR_NAME } from '@/lib/seo';

const PUBLISHED = '2026-06-04';

export const metadata: Metadata = pageMeta({
  title: 'Power 20 & Power 10 Explained: HIMOTHY\'s Hail Mary Mega-Parlays',
  description: 'Power 20 and Power 10 are two North American moneyline Hail Mary parlays. 20 legs and 10 legs respectively, sized to turn $1 into $1,000+ on a hit. Here\'s how they\'re built.',
  path: '/power-20-explained',
  keywords: [
    'Power 20', 'Power 10', 'Hail Mary parlay',
    'biggest parlay payout', 'dollar parlay', 'mega parlay',
    'moneyline parlay', 'best parlay picks', 'longshot parlay',
    'HIMOTHY Power 20', 'HIMOTHY Power 10',
  ],
});

export default function Power20ExplainedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(articleJsonLd({
            headline: 'Power 20 & Power 10 Explained: HIMOTHY\'s Hail Mary Mega-Parlays',
            description: 'Power 20 and Power 10 are two North American moneyline Hail Mary parlays. 20 legs and 10 legs respectively, sized to turn $1 into $1,000+ on a hit.',
            path: '/power-20-explained',
            datePublished: PUBLISHED,
            dateModified: PUBLISHED,
            articleSection: 'Strategy',
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(breadcrumbsJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Strategy', path: '/how-it-works' },
            { name: 'Power 20 Explained', path: '/power-20-explained' },
          ])),
        }}
      />

      <article className="px-6 lg:px-10 py-10 max-w-3xl mx-auto flex flex-col gap-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <header className="border-b border-border pb-8 space-y-4">
          <div className="text-xs font-black uppercase tracking-widest text-primary">HIMOTHY Strategy</div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight leading-tight">
            Power 20 &amp; Power 10 Explained: The Hail Mary Mega-Parlays
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-bold uppercase tracking-wider">
            <span>By {AUTHOR_NAME}</span>
            <span>Published {new Date(PUBLISHED).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>6 min read</span>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Power 20 and Power 10 are two single, North American moneyline parlay tickets. They&apos;re Hail Marys — long-odds tickets where one win pays for a month of losses. Power 20 stacks 20 legs targeting $1 → $1,000+. Power 10 stacks 10 legs as the smaller version. Both are pure moneyline, NA leagues only, hard-capped at -450 per leg.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">What They Are</h2>
          <p className="text-muted-foreground leading-relaxed">
            One Hail Mary parlay per ticket. Not a menu, not a list of suggestions — a single combined wager that wins only when every leg wins. Power 20 = 20 legs (when the slate is full enough to fill it). Power 10 = 10 legs. You play $1 on either; on a hit, Power 20 typically pays $1,000+, Power 10 typically pays $20-$200 depending on the price mix.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            They&apos;re not designed to win often. They&apos;re designed to win occasionally and pay enormous. One Power 20 cash a month at $1 → $2,500 buys back a lot of dead tickets.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">How HIMOTHY Builds Them</h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li>
              <strong className="text-foreground">North American leagues only.</strong> MLB, NBA, NFL, NHL, WNBA, NCAA basketball and baseball, college football, UFL. No tennis, soccer, MMA, golf, or overseas — those have their own boards.
            </li>
            <li>
              <strong className="text-foreground">Moneyline only.</strong> No run lines, no spreads, no totals, no props. Just &quot;who wins.&quot;
            </li>
            <li>
              <strong className="text-foreground">Max -450 per leg.</strong> Anything steeper than -450 is excluded. The whole point is the payout math — one -800 leg drags a 15-leg parlay from +50,000 down to +1,200.
            </li>
            <li>
              <strong className="text-foreground">Dogs and favorites both eligible.</strong> The engine scans every NA game, scores each side, and picks whichever side it leans on — regardless of which side the book has favored. A +135 dog we like is the same kind of leg as a -200 favorite we like.
            </li>
            <li>
              <strong className="text-foreground">No overlap with the regular cards.</strong> A pick on the Grand Slam, Pressure Pack, or VIP 4-Pack will not also appear on a Power parlay. Same game is OK (different angle); the exact same selection is not.
            </li>
            <li>
              <strong className="text-foreground">Thin-slate behavior.</strong> If the slate can&apos;t produce 10 qualifying NA legs inside the -450 cap, Power 10 doesn&apos;t publish. Same for Power 20 at 11. We don&apos;t backfill with steeper chalk to force the ticket out.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">The Math: Why $1 Can Win $1,000+</h2>
          <p className="text-muted-foreground leading-relaxed">
            Parlays multiply. Each leg&apos;s decimal odds get multiplied together — and the product grows fast. A 20-leg parlay at an average price of -180 prices around +9,000 to +15,000. The same 20 legs with even a handful of plus-money dogs sprinkled in can blow past +100,000. That&apos;s what &quot;Hail Mary&quot; means here: small ticket, gigantic payout.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            On a typical NA slate Power 20 prices anywhere from $1 → $1,500 to $1 → $50,000+ depending on the leg mix. Power 10 prices smaller — usually $1 → $30 to $1 → $500. Both numbers are listed in real time on the picks board.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">How To Play Them</h2>
          <p className="text-muted-foreground leading-relaxed">
            Honest expectations matter. Power 20 with a -450-cap pool still has a true hit probability somewhere between 0.5% and 5% depending on slate quality — better than the implied price (that&apos;s the edge), but it&apos;s still a long-tail outcome. Power 10 is meaningfully more likely to cash but pays a smaller multiple.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            How we&apos;d play them ourselves:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li>
              <strong className="text-foreground">$1 to $5 max per ticket.</strong> This is lottery money, not bankroll. Don&apos;t size up because &quot;the math says edge.&quot; Variance dwarfs the edge on tickets this long.
            </li>
            <li>
              <strong className="text-foreground">Play both, every day.</strong> The point is sample size — one Power 20 cash a quarter is a great year. To get it you need to be in seat consistently.
            </li>
            <li>
              <strong className="text-foreground">Don&apos;t parlay them with other plays.</strong> Power 20 is already a Hail Mary; adding another leg crushes win probability without meaningfully changing payout.
            </li>
            <li>
              <strong className="text-foreground">Use the bigger products for real bankroll.</strong> If you want a unit play with a real win rate, use <Link href="/grand-slam" className="text-primary underline">Grand Slam</Link>, <Link href="/pressure-pack" className="text-primary underline">Pressure Pack</Link>, or <Link href="/vip-picks" className="text-primary underline">VIP 4-Pack</Link>. Power 20 is the side dish, not the main course.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Why Not 30 Legs? Why Not -700?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Both could mathematically pay more. We don&apos;t do them because:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li>
              <strong className="text-foreground">More legs = lower hit rate.</strong> Past 20 legs, the cumulative win probability falls so fast the higher payout doesn&apos;t make up for it. The expected value cliff is real.
            </li>
            <li>
              <strong className="text-foreground">Steeper chalk = juice you can&apos;t beat.</strong> A -700 favorite has a real win probability of ~85% — but the book is charging ~88%. Every -700 leg actually subtracts EV from the ticket while adding maybe 0.05x to the multiplier. Bad trade.
            </li>
            <li>
              <strong className="text-foreground">Slate honesty.</strong> A Power 30 with -800 backfill is a sucker product. Better to publish Power 20 some nights and skip on others.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">The Other Tiers</h2>
          <p className="text-muted-foreground leading-relaxed">
            HIMOTHY has multiple products for different risk profiles. Power 20 / Power 10 are the longshots. For higher hit rate / lower payout per ticket, look at:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><Link href="/grand-slam" className="text-primary underline"><strong className="text-foreground">Grand Slam</strong></Link> — our single highest-conviction play of the day. Confidence 96+. 0 or 1 ships per day.</li>
            <li><Link href="/pressure-pack" className="text-primary underline"><strong className="text-foreground">Pressure Pack</strong></Link> — high-conviction plays, confidence 83+. 2-4 per day typically.</li>
            <li><Link href="/vip-picks" className="text-primary underline"><strong className="text-foreground">VIP 4-Pack</strong></Link> — four daily plays for variety across markets.</li>
            <li><Link href="/parlay-plan" className="text-primary underline"><strong className="text-foreground">$10 Parlay</strong></Link> — small structured parlay with reasonable hit rate (4 legs, capped chalk).</li>
            <li><Link href="/asleep" className="text-primary underline"><strong className="text-foreground">Asleep board</strong></Link> — overnight soft-line markets. Different game, different bankroll.</li>
          </ul>
        </section>

        <div className="bg-card border border-border rounded-2xl p-6 mt-4 flex flex-col gap-3">
          <div className="text-sm font-black uppercase tracking-widest text-primary">See today&apos;s Power tickets</div>
          <p className="text-muted-foreground">
            Tonight&apos;s Power 20 and Power 10 parlays live on the <Link href="/picks?board=power20" className="text-primary underline">Power 20 board</Link>. The toggle at the top switches between the 20-leg and 10-leg versions. Real-time payout shown above each ticket.
          </p>
        </div>

        <p className="text-xs text-muted-foreground/70 leading-relaxed border-t border-border pt-6">
          Must be 21+ to wager. If you or someone you know has a gambling problem, call 1-800-GAMBLER. HIMOTHY content is for entertainment and educational purposes. Past performance does not guarantee future results. Long parlays are high-variance products; never wager more than you can afford to lose.
        </p>
      </article>
    </div>
  );
}
