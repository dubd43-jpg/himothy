import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Trophy, ShieldCheck, TrendingUp,
  Activity, Globe, LineChart, Flame, Target, Dumbbell,
  CheckCircle2,
} from "lucide-react";
import { RecordDashboard } from "@/components/RecordDashboard";
import { organizationJsonLd, websiteJsonLd, faqJsonLd } from "@/lib/seo";

const HOMEPAGE_FAQS = [
  {
    question: "What is the HIMOTHY Package?",
    answer: "The HIMOTHY Package is our flagship cross-sport product — it contains our best pick of the day (Grand Slam), the next two strongest plays (2-Pick Pressure Pack), and four more solid plays (4-Pack). Every pick comes with a clear reason why we like it. When the system builds a parlay, that's included too.",
  },
  {
    question: "How do sport packages work?",
    answer: "Each sport package gives you up to 7 of our best picks for that sport, sorted best to worst. Props, totals, NRFI, spreads — anything we find an edge on for that sport lands in the package. The system includes a parlay when it finds one worth building.",
  },
  {
    question: "What sports does HIMOTHY cover?",
    answer: "NBA, MLB, NHL, NFL, WNBA, NCAA, Soccer (EPL/UCL/MLS/La Liga+), Tennis (ATP/WTA), UFC/Boxing, and Golf. Plus KBO, overseas, and asleep picks in lower-profile markets.",
  },
  {
    question: "For golf and UFC — do you give the full field or card?",
    answer: "No. We give you the pick we like and exactly why. For golf: one player we back to win, with course history, strokes-gained trends, and form. For UFC: the fighter we like in a specific matchup, with style analysis. No full field lists, no full card dumps.",
  },
  {
    question: "What's the verified record?",
    answer: "Every pick is graded against the official result and stored in a public ledger. Wins, losses, pushes — all there. The full record lives at /stats. No fake history, no cherry-picking.",
  },
  {
    question: "Can I parlay picks from my package?",
    answer: "Bet your picks as straights — single bets, one ticket each. That's how each pick is priced to win. The system builds its own parlay inside the package when the edge is there. Don't create your own parlay out of our straights; combining them stacks juice against you.",
  },
];

// Sport package cards displayed on the homepage
const SPORT_PACKAGES = [
  {
    key: "nba",
    name: "NBA",
    emoji: "🏀",
    tagline: "Up to 7 picks — spreads, totals, props",
    href: "/pricing?sport=nba",
    picksHref: "/nba-picks-today",
    color: "from-blue-600/20 to-blue-900/10",
    border: "border-blue-500/30 hover:border-blue-400/60",
    badge: "bg-blue-600",
  },
  {
    key: "mlb",
    name: "MLB",
    emoji: "⚾",
    tagline: "Run lines · Totals · F5 · NRFI · Props",
    href: "/pricing?sport=mlb",
    picksHref: "/mlb-picks",
    color: "from-red-600/20 to-red-900/10",
    border: "border-red-500/30 hover:border-red-400/60",
    badge: "bg-red-600",
  },
  {
    key: "nhl",
    name: "NHL",
    emoji: "🏒",
    tagline: "Puck lines · Totals · Periods · Props",
    href: "/pricing?sport=nhl",
    picksHref: "/picks?board=north-american",
    color: "from-sky-600/20 to-sky-900/10",
    border: "border-sky-500/30 hover:border-sky-400/60",
    badge: "bg-sky-600",
  },
  {
    key: "nfl",
    name: "NFL",
    emoji: "🏈",
    tagline: "Spreads · Totals · Player props",
    href: "/pricing?sport=nfl",
    picksHref: "/picks?board=north-american",
    color: "from-green-700/20 to-green-900/10",
    border: "border-green-600/30 hover:border-green-500/60",
    badge: "bg-green-700",
  },
  {
    key: "soccer",
    name: "Soccer",
    emoji: "⚽",
    tagline: "EPL · UCL · MLS · La Liga · More",
    href: "/pricing?sport=soccer",
    picksHref: "/soccer-picks",
    color: "from-emerald-600/20 to-emerald-900/10",
    border: "border-emerald-500/30 hover:border-emerald-400/60",
    badge: "bg-emerald-600",
  },
  {
    key: "tennis",
    name: "Tennis",
    emoji: "🎾",
    tagline: "ATP · WTA · Surface splits · H2H",
    href: "/pricing?sport=tennis",
    picksHref: "/tennis-picks",
    color: "from-lime-600/20 to-lime-900/10",
    border: "border-lime-500/30 hover:border-lime-400/60",
    badge: "bg-lime-600",
  },
  {
    key: "ufc",
    name: "UFC / Boxing",
    emoji: "🥊",
    tagline: "Fighter analysis — not the full card",
    href: "/pricing?sport=ufc",
    picksHref: "/ufc-picks",
    color: "from-orange-600/20 to-orange-900/10",
    border: "border-orange-500/30 hover:border-orange-400/60",
    badge: "bg-orange-600",
  },
  {
    key: "golf",
    name: "Golf",
    emoji: "⛳",
    tagline: "Pick to win — not a full field list",
    href: "/pricing?sport=golf",
    picksHref: "/golf-picks",
    color: "from-teal-600/20 to-teal-900/10",
    border: "border-teal-500/30 hover:border-teal-400/60",
    badge: "bg-teal-600",
  },
  {
    key: "ncaa",
    name: "NCAA",
    emoji: "🎓",
    tagline: "Basketball + Football · Spreads · Totals",
    href: "/pricing?sport=ncaa",
    picksHref: "/ncaa-basketball-picks",
    color: "from-purple-600/20 to-purple-900/10",
    border: "border-purple-500/30 hover:border-purple-400/60",
    badge: "bg-purple-600",
  },
  {
    key: "wnba",
    name: "WNBA",
    emoji: "🏀",
    tagline: "Spreads · Totals · Player props",
    href: "/pricing?sport=wnba",
    picksHref: "/wnba-player-props",
    color: "from-orange-500/20 to-orange-900/10",
    border: "border-orange-400/30 hover:border-orange-300/60",
    badge: "bg-orange-500",
  },
];

export default function Home() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-background text-white pb-24 selection:bg-primary/30">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(HOMEPAGE_FAQS)) }} />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="px-5 lg:px-10 py-4 border-b border-white/8 bg-background/80 backdrop-blur-2xl sticky top-0 z-50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo-badge.png" alt="HIMOTHY" width={44} height={44} className="rounded-full border border-primary/40 himo-glow" />
          <div>
            <div className="text-sm font-black tracking-tight uppercase leading-none">
              HIMOTHY <span className="text-primary">PLAYS &amp; PARLAYS</span>
            </div>
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Sports Picks · Daily</div>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-8 text-[11px] font-black uppercase tracking-widest text-white/50">
          <Link href="/picks" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Today&apos;s Picks
          </Link>
          <Link href="/stats" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <LineChart className="w-3.5 h-3.5" /> Record
          </Link>
          <Link href="/pricing" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
            <Activity className="w-3 h-3" /> Live
          </span>
          <Link href="/pricing" className="bg-primary hover:bg-white text-black px-5 py-2 rounded-full font-black text-[11px] uppercase tracking-widest transition-all himo-glow">
            Get Access
          </Link>
        </div>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative px-5 lg:px-10 pt-14 pb-20 overflow-hidden premium-gradient">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/8 blur-[200px] -z-10 rounded-full" />
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/6 border border-white/12 w-fit">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Today&apos;s Board — {today}</span>
              </div>
              <h1 className="text-6xl sm:text-7xl md:text-8xl font-black uppercase tracking-tighter leading-[0.88]">
                HIMOTHY<br />
                <span className="text-primary italic">PICKS.</span>
              </h1>
              <p className="text-lg text-white/65 max-w-xl leading-relaxed font-medium">
                Your sport. Your picks. Best in the game. Choose the HIMOTHY Package for our top plays across every sport, or go deep on your sport with a dedicated package — up to 7 picks, best play first.
              </p>
              <div className="flex flex-wrap gap-3 mt-2">
                <Link href="/pricing" className="px-7 py-3.5 bg-primary text-black font-black uppercase text-[11px] tracking-widest rounded-2xl hover:bg-white transition-all flex items-center gap-2 group himo-glow">
                  See All Packages <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/picks" className="px-7 py-3.5 bg-white/8 border border-white/12 font-black uppercase text-[11px] tracking-widest rounded-2xl hover:bg-white/14 transition-all flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-primary" /> Today&apos;s Picks
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-white/10 bg-card/70 backdrop-blur-xl p-6 himo-glow">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-5">Verified Record</div>
                <RecordDashboard />
              </div>
            </div>
          </div>
        </section>

        {/* ── HIMOTHY PACKAGE — FLAGSHIP ───────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-16 bg-white/[0.02] border-y border-white/6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-[10px] font-black uppercase tracking-widest text-primary mb-4">
                <Trophy className="w-3 h-3" /> Flagship Package
              </div>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight">The HIMOTHY Package</h2>
              <p className="text-white/50 mt-3 max-w-lg mx-auto leading-relaxed">
                Our best picks across every sport — ranked. Grand Slam is the top pick. Pressure Pack is next. 4-Pack rounds it out. System parlay when earned.
              </p>
            </div>

            <Link href="/pricing?package=himothy" className="group relative block rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/[0.08] via-card/80 to-transparent p-8 md:p-10 hover:border-primary/70 transition-all himo-glow overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest bg-primary text-black px-3 py-1 rounded-full">Best Value</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

                {/* Grand Slam */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                      <Trophy className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Grand Slam</span>
                  </div>
                  <p className="text-white/40 text-xs">Highest-confidence pick. Only drops when every signal lines up.</p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-black text-primary/70 w-4 shrink-0">1.</span>
                      <div className="h-px flex-1 border-t border-dashed border-white/10" />
                    </div>
                  </div>
                </div>

                {/* Pressure Pack */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">2-Pick Pressure Pack</span>
                  </div>
                  <p className="text-white/40 text-xs">Right behind the Grand Slam. Strong conviction, clear edge.</p>
                  <div className="space-y-1.5 pt-1">
                    {[2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-2.5">
                        <span className="text-[10px] font-black text-amber-400/60 w-4 shrink-0">{n}.</span>
                        <div className="h-px flex-1 border-t border-dashed border-white/10" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4-Pack */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-400">4-Pack</span>
                  </div>
                  <p className="text-white/40 text-xs">Four more solid plays. Any market — whatever has the edge today.</p>
                  <div className="space-y-1.5 pt-1">
                    {[4, 5, 6, 7].map((n) => (
                      <div key={n} className="flex items-center gap-2.5">
                        <span className="text-[10px] font-black text-sky-400/60 w-4 shrink-0">{n}.</span>
                        <div className="h-px flex-1 border-t border-dashed border-white/10" />
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* System Parlay + CTA row */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-6 border-t border-white/8">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400 mb-1">A Parlay Every Now and Then</div>
                    <p className="text-white/35 text-xs">When the edge is real, a system parlay drops at the bottom. Not every day — only when it earns its spot.</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="text-[10px] text-white/35 uppercase tracking-widest">Starting from</div>
                  <div className="text-3xl font-black text-white">$99.99<span className="text-sm text-white/40">/mo</span></div>
                  <div className="rounded-2xl bg-primary px-8 py-2.5 text-center font-black text-sm uppercase tracking-widest text-black group-hover:bg-white transition-all whitespace-nowrap">
                    Get the Package →
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* ── SPORT PACKAGES ───────────────────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-16">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35 mb-3">Sport Packages</div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Choose Your Sport</h2>
              <p className="text-white/50 mt-3 max-w-xl mx-auto leading-relaxed">
                Each package delivers up to 7 picks for that sport — any market, best pick first. Props, totals, NRFI, spreads — whatever we find an edge on that day.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {SPORT_PACKAGES.map((sport) => (
                <Link
                  key={sport.key}
                  href={sport.href}
                  className={`group relative rounded-3xl border-2 ${sport.border} bg-gradient-to-br ${sport.color} p-6 flex flex-col gap-4 transition-all hover:scale-[1.02] hover:shadow-2xl min-h-[220px]`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-5xl leading-none">{sport.emoji}</div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${sport.badge} text-white px-2 py-0.5 rounded-full`}>
                        Up to 7 picks
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white">{sport.name}</h3>
                    <p className="text-[11px] text-white/55 mt-1 font-semibold leading-snug">{sport.tagline}</p>
                  </div>

                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      Best pick always first
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      System parlay when earned
                    </div>
                    <div className="w-full rounded-xl border border-white/15 bg-white/8 py-2.5 text-center text-[11px] font-black uppercase tracking-widest text-white group-hover:bg-white/15 transition-all mt-1">
                      View Package →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── ALL-SPORTS BUNDLE ────────────────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-12 bg-white/[0.02] border-y border-white/6">
          <div className="max-w-7xl mx-auto">
            <Link href="/pricing?package=bundle" className="group rounded-3xl border-2 border-white/20 bg-gradient-to-r from-primary/[0.08] via-transparent to-[hsla(207,100%,38%,0.08)] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 hover:border-primary/40 transition-all block">
              <div className="flex items-center gap-6">
                <div className="text-6xl">🏆</div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Best Value</div>
                  <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight">All-Sports Bundle</h3>
                  <p className="text-white/55 text-sm leading-relaxed mt-2 max-w-lg">
                    Get everything — HIMOTHY Package + all 10 sport packages. Every pick we produce, every day. One price.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["HIMOTHY Package", "NBA", "MLB", "NHL", "NFL", "Soccer", "Tennis", "UFC", "Golf", "NCAA", "WNBA"].map((tag) => (
                      <span key={tag} className="text-[10px] font-black uppercase tracking-wider border border-white/15 rounded-full px-2.5 py-0.5 text-white/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="text-center">
                  <div className="text-[10px] text-white/35 uppercase tracking-widest">Starting from</div>
                  <div className="text-4xl font-black text-white mt-1">$299.99<span className="text-base text-white/40">/mo</span></div>
                </div>
                <div className="px-8 py-3 bg-primary text-black rounded-2xl font-black text-sm uppercase tracking-widest group-hover:bg-white transition-all whitespace-nowrap">
                  Get Everything →
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-16">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35 mb-3">How It Works</div>
              <h2 className="text-3xl font-black uppercase tracking-tight">Simple. Clear. Honest.</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  title: "Pick your package",
                  body: "Choose the HIMOTHY Package for cross-sport best picks, or a specific sport package for your sport of choice.",
                  icon: ShieldCheck,
                  color: "text-primary",
                },
                {
                  step: "02",
                  title: "See your picks",
                  body: "Best pick is always first. Each pick comes with a clear reason — why we like it, the edge, the angle. No fluff.",
                  icon: Target,
                  color: "text-emerald-400",
                },
                {
                  step: "03",
                  title: "Bet as straights",
                  body: "Place each pick as a single bet at your sportsbook. The system builds a parlay when it finds one — don't create your own out of our straights.",
                  icon: TrendingUp,
                  color: "text-sky-400",
                },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-white/20 tabular-nums">{item.step}</span>
                    <item.icon className={`w-6 h-6 ${item.color}`} />
                  </div>
                  <h3 className="font-black uppercase tracking-tight text-lg text-white">{item.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BAND ─────────────────────────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-16 bg-white/[0.02] border-y border-white/6">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8">
            <Image
              src="/promo-join.png"
              alt="Join HIMOTHY"
              width={280} height={280}
              className="rounded-3xl border border-primary/20 himo-glow w-full max-w-[240px] md:max-w-[260px]"
            />
            <div className="flex flex-col gap-5 text-center md:text-left">
              <h2 className="text-4xl font-black uppercase tracking-tight">
                Get <span className="text-primary italic">Access</span> Today
              </h2>
              <p className="text-white/55 text-base leading-relaxed max-w-md">
                The HIMOTHY Package. Your sport's package. Or everything. All picks come with a clear reason. Bet smart, bet sharp.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/pricing" className="bg-primary hover:bg-white text-black px-7 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all himo-glow flex items-center gap-2 group">
                  See All Packages <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/stats" className="px-7 py-3.5 bg-white/8 border border-white/12 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/14 transition-all flex items-center gap-2">
                  <LineChart className="w-3.5 h-3.5 text-primary" /> Full Record
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="px-5 lg:px-10 py-16 border-t border-white/6">
          <div className="max-w-3xl mx-auto">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">FAQ</div>
            <h2 className="text-3xl font-black uppercase tracking-tight mb-8">Questions Answered Straight</h2>
            <div className="space-y-3">
              {HOMEPAGE_FAQS.map((faq, i) => (
                <details key={i} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 open:bg-white/[0.04] transition">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-black text-white">
                    <span>{faq.question}</span>
                    <span className="text-primary text-xl shrink-0 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-4 text-white/60 leading-relaxed text-sm">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <footer className="px-5 lg:px-10 py-12 border-t border-white/6 bg-background/80 flex flex-col md:flex-row justify-between gap-10">
          <div className="flex flex-col gap-4 max-w-xs">
            <div className="flex items-center gap-3">
              <Image src="/logo-badge.png" alt="HIMOTHY" width={36} height={36} className="rounded-full border border-primary/40" />
              <span className="text-[11px] font-black uppercase tracking-widest text-primary">HIMOTHY Plays &amp; Parlays</span>
            </div>
            <p className="text-[11px] text-white/35 leading-relaxed">
              All picks are provided for informational and entertainment purposes only. We do not facilitate gambling. Must be 21+. Play responsibly. If you have a gambling problem call <a href="tel:18004262537" className="underline text-white/50">1-800-GAMBLER</a>.
            </p>
          </div>

          <div className="flex flex-wrap gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-white/35 uppercase tracking-widest">Picks</span>
              <div className="flex flex-col gap-2 text-xs font-bold text-white/55">
                <Link href="/picks" className="hover:text-primary transition-colors">Today&apos;s Picks</Link>
                <Link href="/stats" className="hover:text-primary transition-colors">Record</Link>
                <Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-white/35 uppercase tracking-widest">Sports</span>
              <div className="flex flex-col gap-2 text-xs font-bold text-white/55">
                <Link href="/nba-picks-today" className="hover:text-primary transition-colors">NBA</Link>
                <Link href="/mlb-picks" className="hover:text-primary transition-colors">MLB</Link>
                <Link href="/soccer-picks" className="hover:text-primary transition-colors">Soccer</Link>
                <Link href="/tennis-picks" className="hover:text-primary transition-colors">Tennis</Link>
                <Link href="/ufc-picks" className="hover:text-primary transition-colors">UFC / Boxing</Link>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-white/35 uppercase tracking-widest">Legal</span>
              <div className="flex flex-col gap-2 text-xs font-bold text-white/55">
                <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
                <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
                <Link href="/responsible-gaming" className="hover:text-primary transition-colors">Responsible Gaming</Link>
              </div>
            </div>
          </div>
        </footer>

        {/* Required legal disclaimers */}
        <div className="px-5 lg:px-10 py-6 border-t border-yellow-500/10 bg-yellow-500/[0.02]">
          <div className="max-w-5xl mx-auto text-xs text-yellow-500/55 leading-relaxed space-y-2">
            <p>All content on this site is sports analysis and opinion for <strong>entertainment and informational purposes only</strong>. We are not a sportsbook. Past performance does not guarantee future results.</p>
            <p>Users must be <strong>21+</strong> and comply with all local laws. Subscriptions auto-renew; cancel anytime in your account portal. <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link>.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
