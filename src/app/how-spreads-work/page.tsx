import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { pageMeta, articleJsonLd, jsonLdString, breadcrumbsJsonLd, AUTHOR_NAME } from '@/lib/seo';

const PUBLISHED = '2026-06-04';

export const metadata: Metadata = pageMeta({
  title: 'How Sports Spreads Work: A Bettor\'s Guide to Point Spreads, Juice, and Key Numbers',
  description: 'Spread betting explained — what the point spread means, how juice and the vig work, key numbers in NFL and NBA, alt lines, buying half points, and when to take the favorite vs the dog.',
  path: '/how-spreads-work',
  keywords: [
    'how do sports spreads work', 'point spread explained',
    'spread betting guide', 'what is the spread', 'against the spread',
    'ATS picks', 'juice in betting', 'vig explained',
    'key numbers in NFL', 'NBA spread betting',
    'buy points spread', 'alt spread',
  ],
});

export default function HowSpreadsWorkPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(articleJsonLd({
            headline: 'How Sports Spreads Work: A Bettor\'s Guide to Point Spreads, Juice, and Key Numbers',
            description: 'Spread betting explained — what the point spread means, how juice and the vig work, key numbers in NFL and NBA, alt lines, buying half points, and when to take the favorite vs the dog.',
            path: '/how-spreads-work',
            datePublished: PUBLISHED,
            articleSection: 'Education',
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(breadcrumbsJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Education', path: '/how-it-works' },
            { name: 'How Sports Spreads Work', path: '/how-spreads-work' },
          ])),
        }}
      />

      <article className="px-6 lg:px-10 py-10 max-w-3xl mx-auto flex flex-col gap-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <header className="border-b border-border pb-8 space-y-4">
          <div className="text-xs font-black uppercase tracking-widest text-primary">Education</div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight leading-tight">
            How Sports Spreads Work — A Bettor&apos;s Guide
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-bold uppercase tracking-wider">
            <span>By {AUTHOR_NAME}</span>
            <span>Published {new Date(PUBLISHED).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>9 min read</span>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            The point spread is the most-bet market in American sports. It&apos;s also the most misunderstood. This guide breaks down what a spread really is, how the juice works, why key numbers matter, when buying half a point is worth it, and how to spot the line ranges that are actually +EV.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">What Is a Point Spread?</h2>
          <p className="text-muted-foreground leading-relaxed">
            A point spread is the sportsbook&apos;s estimate of the margin of victory — adjusted to make both sides of the bet roughly 50/50. If the Lakers are -6.5 against the Mavericks, the book is saying the Lakers are expected to win by about 6.5 points. To &quot;cover&quot; the spread, the Lakers need to win by 7 or more. To win as the Mavericks, you need them to either win outright OR lose by 6 or fewer.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Half points exist for a reason: they eliminate ties. A spread of -7 (a &quot;flat&quot; or &quot;hooked&quot; line) on an NFL favorite means if they win by exactly 7, the bet pushes — your stake refunds. -7.5 means they need to win by 8. That half point is worth more than people realize, especially on key numbers (more on this below).
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Juice / Vig — Where the Book Makes Its Money</h2>
          <p className="text-muted-foreground leading-relaxed">
            Standard spread pricing is -110 on both sides. That means to win $100, you risk $110. The extra $10 is the &quot;juice,&quot; &quot;vig,&quot; or &quot;hold&quot; — the book&apos;s built-in margin. Over thousands of bets the book wins ~52.4% of the time just by getting balanced action, because of the juice.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            What this means for you: to break even at -110, you have to hit 52.38% against the spread. To beat the book you need somewhere north of 53%. The casual public hits about 49-50% — the vig grinds them out. Sharps hit 53-56% over large samples. The math is brutal but the gap is real.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Look for reduced-juice books or promotions when you can. -105 instead of -110 is a meaningful upgrade in long-term win rate.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Key Numbers in the NFL</h2>
          <p className="text-muted-foreground leading-relaxed">
            NFL games are scored in irregular increments — 3, 6, 7 — which means some margins of victory happen WAY more often than others. The most common margins:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">3 points</strong> — by far the most common margin (a field goal). About 14-15% of all NFL games.</li>
            <li><strong className="text-foreground">7 points</strong> — second most common (a touchdown). About 8-9%.</li>
            <li><strong className="text-foreground">6 points</strong> — about 6%.</li>
            <li><strong className="text-foreground">10 points</strong> — about 6% (field goal + touchdown).</li>
            <li><strong className="text-foreground">14 points</strong> — about 5%.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            These are the &quot;key numbers.&quot; Moving the spread on or off a key number is a much bigger deal than moving between non-key numbers. A spread that closes at -3 vs -3.5 is a roughly 2% swing in cover probability. A spread that closes at -7 vs -7.5 is about a 1-1.5% swing. A spread that closes at -4 vs -4.5 is barely 0.4%.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Practical rule: if the spread is at a key number and the line is moving toward your side, GRAB IT. Don&apos;t wait. If the line is moving away from your side and you&apos;re about to cross a key number, you&apos;ve lost a meaningful chunk of value.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Key Numbers in the NBA</h2>
          <p className="text-muted-foreground leading-relaxed">
            NBA margins are more uniform than NFL because of the higher scoring rate, but there are still mini-key numbers:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">3, 5, 7</strong> — common margins, but no single number dominates the way 3 does in the NFL.</li>
            <li><strong className="text-foreground">9, 12</strong> — slightly elevated frequency due to three-point shooting clusters.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Half-points matter less in the NBA because of the score density. -6.5 vs -7 is a much smaller swing than the same move in the NFL. But the principle still holds: when the line crosses 3 or 7, that&apos;s a more meaningful number to be on the right side of.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">When To Buy Points (and When Not To)</h2>
          <p className="text-muted-foreground leading-relaxed">
            &quot;Buying&quot; a half point means paying extra juice to move the spread in your favor. Standard cost is 10 cents (e.g., -110 becomes -120) for half a point off most numbers. Across the 3 in the NFL, it costs more — usually 25 cents — because the book knows it.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Rules of thumb:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">Buy through 3 in the NFL.</strong> Paying 25 cents to move from -3.5 to -3 underdog (or +2.5 to +3 favorite) is almost always +EV given how often 3 is the final margin.</li>
            <li><strong className="text-foreground">Buy through 7 in the NFL.</strong> Smaller bump, but still worth the 10-15 cents.</li>
            <li><strong className="text-foreground">Don&apos;t buy through non-key numbers.</strong> Paying 10 cents to move from -8.5 to -8 isn&apos;t worth it — the cover probability barely budges.</li>
            <li><strong className="text-foreground">Almost never buy in the NBA.</strong> The score density makes half points cheap moves with weak EV.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Alt lines (buying or selling multiple points) work the same way. The book prices them with a fat margin, but on key-number crossings they&apos;re sometimes the +EV play.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Favorites vs Dogs Against the Spread</h2>
          <p className="text-muted-foreground leading-relaxed">
            Common myth: &quot;dogs cover more often.&quot; The truth: dogs and favorites cover at almost exactly 50/50 over the long run, because the line is set to make it that way. What dogs do more often is COVER WITH ROOM — winning by more than expected — because variance hits them positively (an underdog winning outright covers any spread).
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Where dogs DO have a small structural edge: home dogs in primetime NFL games (Sunday/Monday/Thursday night) and Sunday morning road dogs in the NFL. Both buckets have historically beaten the spread ~52-53% — small edge but real over large samples.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Where favorites have an edge: division road favorites in the NFL (familiarity offsets the typical road penalty), and elite NBA teams as small favorites against bottom-tier opponents (the market underweights talent gaps in low-stakes regular-season games). These edges are small and don&apos;t survive after the market notices them, but they&apos;re real signals while they last.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">The Line-Movement Tell</h2>
          <p className="text-muted-foreground leading-relaxed">
            The most important number you can track on any spread is the move from open to current. If a line opens Lakers -6, closes at -7.5, and you bet -7, you got the side AT a worse price than the market settled on. The market disagreed with your read. Over time, betting against the line move is a losing strategy regardless of how individual tickets play out.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Reverse-line movement is the sharp signal: the line moves opposite to the public bet count. If 70% of bets are on the Lakers but the line drops from -7 to -6.5, that&apos;s a sign sharp money is on the Mavericks. Books move lines to reflect MONEY, not ticket count. When tickets and money diverge, the money side is usually right.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            HIMOTHY publishes our reads with the open/close lines visible on every graded pick on the <Link href="/transparency" className="text-primary underline">transparency page</Link>. If you&apos;re building your own model, track this on every bet — it&apos;s the only metric that tells you long-term if your process is sharp.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Common Mistakes Casual Bettors Make</h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">Betting the spread on a coin-flip game.</strong> A pick-em with elevated juice is the worst bet on the board.</li>
            <li><strong className="text-foreground">Ignoring half points on key numbers.</strong> -3 and -3.5 are completely different bets. The difference matters.</li>
            <li><strong className="text-foreground">Chasing big underdogs ATS.</strong> +14 cover rate is barely above 50% — the variance is brutal and the juice is full.</li>
            <li><strong className="text-foreground">Parlaying spreads with overlapping outcomes.</strong> Lakers -7 and Lakers ML look like separate bets, but they&apos;re correlated. Most books now block these as a same-game parlay anyway.</li>
            <li><strong className="text-foreground">Betting based on TV picks or last week&apos;s talking heads.</strong> By the time a pundit calls a side on TV, the market has already moved on the info.</li>
          </ul>
        </section>

        <div className="bg-card border border-border rounded-2xl p-6 mt-4 flex flex-col gap-3">
          <div className="text-sm font-black uppercase tracking-widest text-primary">See HIMOTHY&apos;s spread picks live</div>
          <p className="text-muted-foreground">
            Today&apos;s spread plays on the <Link href="/picks" className="text-primary underline">main picks board</Link>, and our full graded record on the <Link href="/results" className="text-primary underline">results page</Link>.
          </p>
        </div>

        <p className="text-xs text-muted-foreground/70 leading-relaxed border-t border-border pt-6">
          Must be 21+ to wager. If you or someone you know has a gambling problem, call 1-800-GAMBLER. HIMOTHY content is for entertainment and educational purposes. Lines and odds subject to change.
        </p>
      </article>
    </div>
  );
}
