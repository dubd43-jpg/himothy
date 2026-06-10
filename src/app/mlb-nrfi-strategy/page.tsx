import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { pageMeta, articleJsonLd, jsonLdString, breadcrumbsJsonLd, AUTHOR_NAME } from '@/lib/seo';

const PUBLISHED = '2026-06-04';

export const metadata: Metadata = pageMeta({
  title: 'MLB NRFI Strategy: A Sharp Bettor\'s Guide to the No-Run First Inning Bet',
  description: 'How to bet MLB NRFI (no run, first inning) like a sharp: ERA floors, lineup spots, ump zone, weather, and the line ranges where the bet is actually +EV.',
  path: '/mlb-nrfi-strategy',
  keywords: [
    'MLB NRFI strategy', 'NRFI bet', 'no run first inning',
    'how to bet NRFI', 'NRFI picks', 'NRFI vs YRFI',
    'MLB first inning bet', 'first 5 inning bet', 'first inning total',
    'MLB strategy', 'baseball betting guide',
  ],
});

export default function NrfiStrategyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(articleJsonLd({
            headline: 'MLB NRFI Strategy: A Sharp Bettor\'s Guide to the No-Run First Inning Bet',
            description: 'How to bet MLB NRFI (no run, first inning) like a sharp: ERA floors, lineup spots, ump zone, weather, and the line ranges where the bet is actually +EV.',
            path: '/mlb-nrfi-strategy',
            datePublished: PUBLISHED,
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
            { name: 'MLB NRFI Strategy', path: '/mlb-nrfi-strategy' },
          ])),
        }}
      />

      <article className="px-6 lg:px-10 py-10 max-w-3xl mx-auto flex flex-col gap-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <header className="border-b border-border pb-8 space-y-4">
          <div className="text-xs font-black uppercase tracking-widest text-primary">MLB Strategy</div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight leading-tight">
            MLB NRFI Strategy: How To Actually Win the No-Run First Inning Bet
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-bold uppercase tracking-wider">
            <span>By {AUTHOR_NAME}</span>
            <span>Published {new Date(PUBLISHED).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>10 min read</span>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            NRFI — short for &quot;no run, first inning&quot; — is one of the most over-bet markets in baseball. Public money slams it daily because it feels safe: just need one inning to go scoreless. The reality is the line moves against you constantly, juice is brutal at the top names, and the bet only prints money when you&apos;re strict about which games you take and which you skip.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">What NRFI Actually Is</h2>
          <p className="text-muted-foreground leading-relaxed">
            NRFI pays out if neither team scores in the top OR bottom of the first inning. YRFI (&quot;yes run first inning&quot;) is the opposite. Some books also offer F1 total at 0.5 — that&apos;s the same bet in different clothes. We focus on the standard NRFI market because the price is sharper and the limits are higher.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            One nuance most bettors miss: the bet resolves on the top half AND bottom half. Even if the home starter is elite, if the away starter walks two and gives up a sac fly in the top of the first, your ticket is dead before the home plate ump signals strike one to the home lineup. That asymmetry is why you have to evaluate both starters, not just the headliner.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">The Three Pillars of a Real NRFI Bet</h2>
          <p className="text-muted-foreground leading-relaxed">
            Every NRFI we post on the <Link href="/mlb-picks" className="text-primary underline">HIMOTHY MLB board</Link> clears three filters. If a game fails any one of them, it doesn&apos;t go up — and you shouldn&apos;t play it either.
          </p>

          <h3 className="text-xl font-black uppercase mt-6">1. Both starters with sub-3.50 ERA (and sub-1.25 WHIP)</h3>
          <p className="text-muted-foreground leading-relaxed">
            ERA is a backward-looking, noisy stat — but it&apos;s a useful FLOOR. A starter with a 4.20 ERA giving up two homers per nine has shown the league he gives up first-inning damage. We require both starters to clear 3.50 ERA. Bonus filter: WHIP under 1.25, because walks and singles do as much damage in the first as homers do (more, actually — bunt-down-the-line first-pitch leadoff walks score 35% of the time).
          </p>
          <p className="text-muted-foreground leading-relaxed">
            xERA / SIERA are sharper if you have them. If a starter has a 3.10 ERA but a 4.50 xERA, his luck is about to run out — fade NRFI on that side even if the headline number looks fine.
          </p>

          <h3 className="text-xl font-black uppercase mt-6">2. Both leadoff men below .340 OBP — or hitting lefty/right against a same-handed starter</h3>
          <p className="text-muted-foreground leading-relaxed">
            The first-inning matchup is the LEADOFF hitter vs the starter, and platoon splits matter more here than anywhere else in the game. A .280-hitting lefty leading off against a lefty starter who eats lefties for breakfast is the bet you want. Reverse it — a .380 OBP leadoff guy with the platoon advantage — and you should fade NRFI even if the starter is Cy Young material.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Pay attention to who&apos;s actually leading off TODAY, not season-long. Manager flip the lineup against tonight&apos;s starter? That changes everything. Late scratches happen at 5pm ET when lineups post — never lock NRFI before lineups are public.
          </p>

          <h3 className="text-xl font-black uppercase mt-6">3. A neutral or pitcher-friendly umpire</h3>
          <p className="text-muted-foreground leading-relaxed">
            Home-plate umpire is the most underrated variable in this market. A wide-zone ump turns marginal pitches into called strikes, which turns 2-0 counts into 2-1, which turns walks into ground-outs. A tight-zone ump does the reverse. UmpScorecards and similar sites track per-ump zone size and run-impact — we pull this data into our engine and you should too if you&apos;re betting NRFI more than once a week.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Rule of thumb: ump runs-above-expected greater than +0.4 R/game = fade NRFI. Less than -0.4 = lean NRFI. Between those, ump isn&apos;t the deciding signal.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">The Line Range Where NRFI Is Actually +EV</h2>
          <p className="text-muted-foreground leading-relaxed">
            This is where most public bettors get cooked. NRFI at -180 on a Cole / Wheeler matchup feels like a layup, but the math is brutal: even if the true probability of NRFI is 65%, the break-even at -180 is 64.3%. You&apos;re paying for almost zero edge while taking on full game-script variance (a walk-error-double-steal sequence kills you regardless of how dominant the starters look on paper).
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Our NRFI line targets:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">-110 to -135:</strong> the sweet spot. Most edge per dollar risked.</li>
            <li><strong className="text-foreground">-135 to -160:</strong> playable on premium matchups (ace vs ace, both lineups bottom-third in first-inning OPS).</li>
            <li><strong className="text-foreground">Worse than -160:</strong> almost always a pass. The juice eats your edge.</li>
            <li><strong className="text-foreground">Plus money YRFI:</strong> when a bottom-tier matchup is +130 YRFI, sometimes that&apos;s the bet instead. We post YRFI when the math says so.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">When To Fade NRFI Entirely</h2>
          <p className="text-muted-foreground leading-relaxed">
            Skip the market — bet something else — when any of these hit:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">Coors Field.</strong> Altitude breaks the model. Even Cy Young types give up first-inning runs there.</li>
            <li><strong className="text-foreground">Day game after a night game.</strong> Pitchers warm up slower. Leadoff guys see two fewer pitches per AB on average.</li>
            <li><strong className="text-foreground">Wind blowing out over 12 mph at hitter-friendly parks.</strong> Cincinnati, Wrigley, Yankee Stadium when the jet stream hits — first-inning HR rates jump 30-40%.</li>
            <li><strong className="text-foreground">A bullpen day or opener.</strong> An opener is a different bet — the &quot;starter&quot; is throwing two innings max and pitching backwards. Doesn&apos;t fit the NRFI model at all.</li>
            <li><strong className="text-foreground">Either lineup with a leadoff hitter above .380 OBP on the season.</strong> Acuña, Soto, Henderson — these guys MAKE first-inning runs happen. Pay the price elsewhere.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Bankroll Sizing for NRFI</h2>
          <p className="text-muted-foreground leading-relaxed">
            Treat NRFI as a high-variance, low-stakes play. We size NRFI at 0.5 to 1 unit on standalone tickets, not 2-3 units like a marquee moneyline. Reason: first-inning outcomes are heavily influenced by single events you can&apos;t model (one bad pitch, one ground-ball-with-eyes, one ump call). You want sample size on this market, not big bets on individual tickets.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We do NOT recommend parlaying NRFI legs together. Sportsbooks build a fat margin into 2-leg and 3-leg NRFI parlays because they know the public loves them. A 3-leg NRFI parlay at +400 might cash on ~25% theoretical probability, but the implied probability at that price is 20% — you&apos;re paying full juice for a long-tail outcome where one ump call kills the whole ticket.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Tracking CLV on NRFI</h2>
          <p className="text-muted-foreground leading-relaxed">
            Closing line value is the only metric that tells you long-term whether your NRFI process is sharp. If you consistently bet NRFI -125 and the line closes at -140, you&apos;re beating the market — the wins-and-losses chart will catch up over the next 100 bets. If you bet NRFI -125 and the line closes at -110, the market disagreed with you, and you&apos;re going to lose money long-term even if individual tickets cash.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We publish CLV on every graded pick on our <Link href="/transparency" className="text-primary underline">transparency page</Link>. If you&apos;re building your own model, start logging the opening line and closing line on every NRFI bet you make. After 30 plays you&apos;ll know if your read is signal or noise.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">Where To See Tonight&apos;s NRFI Picks</h2>
          <p className="text-muted-foreground leading-relaxed">
            HIMOTHY runs every MLB game on the slate through the filters above. If a matchup clears all three pillars AND the price is in our +EV range, it shows up on the <Link href="/mlb-picks" className="text-primary underline">MLB picks board</Link> with the full breakdown — both starters&apos; ERA/WHIP/SIERA, both leadoff splits, ump tendency, weather, and the line we&apos;re taking. If a day has zero qualifying matchups, we publish zero NRFI picks. We don&apos;t pad the board.
          </p>
        </section>

        <div className="bg-card border border-border rounded-2xl p-6 mt-4 flex flex-col gap-3">
          <div className="text-sm font-black uppercase tracking-widest text-primary">Today on the board</div>
          <p className="text-muted-foreground">
            See which MLB games made the cut tonight on the <Link href="/mlb-picks" className="text-primary underline">MLB picks board</Link>. NRFI is a market type that competes for slots alongside spreads, totals, and props — the top 7 by confidence show up there.
          </p>
        </div>

        <p className="text-xs text-muted-foreground/70 leading-relaxed border-t border-border pt-6">
          Must be 21+ to wager. If you or someone you know has a gambling problem, call 1-800-GAMBLER. HIMOTHY content is for entertainment and educational purposes. Lines and odds subject to change.
        </p>
      </article>
    </div>
  );
}
