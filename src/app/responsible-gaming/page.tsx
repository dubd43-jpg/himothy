import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Phone, ExternalLink } from 'lucide-react';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Responsible Gaming',
  description: "HIMOTHY's responsible gaming policy, state-by-state legal status of sports betting, and the help resources for anyone affected by problem gambling.",
  path: '/responsible-gaming',
});

const STATE_STATUS: Array<{ name: string; abbr: string; status: 'legal' | 'limited' | 'illegal' | 'unclear'; notes?: string }> = [
  { name: 'Alabama', abbr: 'AL', status: 'illegal' },
  { name: 'Alaska', abbr: 'AK', status: 'illegal' },
  { name: 'Arizona', abbr: 'AZ', status: 'legal' },
  { name: 'Arkansas', abbr: 'AR', status: 'legal' },
  { name: 'California', abbr: 'CA', status: 'illegal' },
  { name: 'Colorado', abbr: 'CO', status: 'legal' },
  { name: 'Connecticut', abbr: 'CT', status: 'legal' },
  { name: 'Delaware', abbr: 'DE', status: 'legal' },
  { name: 'District of Columbia', abbr: 'DC', status: 'legal' },
  { name: 'Florida', abbr: 'FL', status: 'limited', notes: 'Tribal-operated only via Hard Rock Bet' },
  { name: 'Georgia', abbr: 'GA', status: 'illegal' },
  { name: 'Hawaii', abbr: 'HI', status: 'illegal' },
  { name: 'Idaho', abbr: 'ID', status: 'illegal' },
  { name: 'Illinois', abbr: 'IL', status: 'legal' },
  { name: 'Indiana', abbr: 'IN', status: 'legal' },
  { name: 'Iowa', abbr: 'IA', status: 'legal' },
  { name: 'Kansas', abbr: 'KS', status: 'legal' },
  { name: 'Kentucky', abbr: 'KY', status: 'legal' },
  { name: 'Louisiana', abbr: 'LA', status: 'legal' },
  { name: 'Maine', abbr: 'ME', status: 'legal' },
  { name: 'Maryland', abbr: 'MD', status: 'legal' },
  { name: 'Massachusetts', abbr: 'MA', status: 'legal' },
  { name: 'Michigan', abbr: 'MI', status: 'legal' },
  { name: 'Minnesota', abbr: 'MN', status: 'illegal' },
  { name: 'Mississippi', abbr: 'MS', status: 'limited', notes: 'In-person at casinos only' },
  { name: 'Missouri', abbr: 'MO', status: 'legal', notes: 'Launched December 2025' },
  { name: 'Montana', abbr: 'MT', status: 'legal' },
  { name: 'Nebraska', abbr: 'NE', status: 'limited', notes: 'In-person only' },
  { name: 'Nevada', abbr: 'NV', status: 'legal' },
  { name: 'New Hampshire', abbr: 'NH', status: 'legal' },
  { name: 'New Jersey', abbr: 'NJ', status: 'legal' },
  { name: 'New Mexico', abbr: 'NM', status: 'limited', notes: 'Tribal only' },
  { name: 'New York', abbr: 'NY', status: 'legal' },
  { name: 'North Carolina', abbr: 'NC', status: 'legal' },
  { name: 'North Dakota', abbr: 'ND', status: 'limited', notes: 'Tribal only' },
  { name: 'Ohio', abbr: 'OH', status: 'legal' },
  { name: 'Oklahoma', abbr: 'OK', status: 'illegal' },
  { name: 'Oregon', abbr: 'OR', status: 'legal' },
  { name: 'Pennsylvania', abbr: 'PA', status: 'legal' },
  { name: 'Rhode Island', abbr: 'RI', status: 'legal' },
  { name: 'South Carolina', abbr: 'SC', status: 'illegal' },
  { name: 'South Dakota', abbr: 'SD', status: 'limited', notes: 'In-person at Deadwood only' },
  { name: 'Tennessee', abbr: 'TN', status: 'legal' },
  { name: 'Texas', abbr: 'TX', status: 'illegal' },
  { name: 'Utah', abbr: 'UT', status: 'illegal' },
  { name: 'Vermont', abbr: 'VT', status: 'legal' },
  { name: 'Virginia', abbr: 'VA', status: 'legal' },
  { name: 'Washington', abbr: 'WA', status: 'limited', notes: 'Tribal-operated retail only' },
  { name: 'West Virginia', abbr: 'WV', status: 'legal' },
  { name: 'Wisconsin', abbr: 'WI', status: 'limited', notes: 'Tribal only' },
  { name: 'Wyoming', abbr: 'WY', status: 'legal' },
];

function StatusPill({ status, notes }: { status: 'legal' | 'limited' | 'illegal' | 'unclear'; notes?: string }) {
  const cls = status === 'legal' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : status === 'limited' ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
    : status === 'illegal' ? 'bg-red-500/10 text-red-400 border-red-500/30'
    : 'bg-white/10 text-white/60 border-white/30';
  const label = status === 'legal' ? 'Legal'
    : status === 'limited' ? 'Limited'
    : status === 'illegal' ? 'Not legal'
    : 'Unclear';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase border ${cls}`} title={notes}>
      {label}
    </span>
  );
}

export default function ResponsibleGamingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto space-y-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <div className="border-b border-border pb-8 space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Responsible Gaming</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            HIMOTHY is for adults 21 and older. Sports betting is a high-variance activity that involves real risk of financial loss. Treat it like any other entertainment expense and never bet money you can't afford to lose.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <Phone className="w-6 h-6 text-primary" /> Help is available
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            If you or someone you know has a problem with gambling, free and confidential help is available 24/7.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a href="tel:18004262537" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors block">
              <div className="text-3xl font-black tracking-tight">1-800-GAMBLER</div>
              <div className="text-xs text-muted-foreground mt-1">National Problem Gambling Helpline · 24/7</div>
            </a>
            <a href="https://www.ncpgambling.org/" target="_blank" rel="noopener" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors block">
              <div className="font-black flex items-center gap-2">National Council on Problem Gambling <ExternalLink className="w-4 h-4" /></div>
              <div className="text-xs text-muted-foreground mt-1">ncpgambling.org — resources, counseling locator, family support</div>
            </a>
            <a href="https://www.gamblersanonymous.org/" target="_blank" rel="noopener" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors block">
              <div className="font-black flex items-center gap-2">Gamblers Anonymous <ExternalLink className="w-4 h-4" /></div>
              <div className="text-xs text-muted-foreground mt-1">gamblersanonymous.org — local meetings + 12-step program</div>
            </a>
            <a href="https://www.gam-anon.org/" target="_blank" rel="noopener" className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition-colors block">
              <div className="font-black flex items-center gap-2">Gam-Anon (for families) <ExternalLink className="w-4 h-4" /></div>
              <div className="text-xs text-muted-foreground mt-1">gam-anon.org — support for spouses, family members, and friends</div>
            </a>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-primary" /> Healthy betting practices
          </h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc pl-6">
            <li><strong className="text-foreground">Set a budget for the day, week, and month.</strong> Stick to it. If you hit your loss limit, walk away.</li>
            <li><strong className="text-foreground">Never chase losses.</strong> Trying to "win it back" is how small losses become big ones.</li>
            <li><strong className="text-foreground">Bet with money you have allocated for entertainment.</strong> Not rent. Not bills. Not money you'd miss.</li>
            <li><strong className="text-foreground">Don't bet drunk or impaired.</strong> Sober judgment matters here.</li>
            <li><strong className="text-foreground">Take regular breaks.</strong> Skip a day. Skip a week. The market will still be here.</li>
            <li><strong className="text-foreground">Track your results honestly.</strong> If you can't explain why you placed a bet, don't place it.</li>
            <li><strong className="text-foreground">Self-exclude if you need to.</strong> Every legal US sportsbook offers self-exclusion programs that block you from betting for a set period.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black uppercase">State-by-state legal status</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Online sports betting legality varies by state. HIMOTHY publishes pick analysis as editorial content and does not accept wagers ourselves — but the laws governing whether you can place bets in your state still apply. Below is the current status as of early 2026. We are not lawyers; verify your state's current rules before placing wagers.
          </p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left p-3">State</th>
                    <th className="text-left">Code</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {STATE_STATUS.map((s) => (
                    <tr key={s.abbr} className="border-t border-border/40">
                      <td className="p-3 font-bold">{s.name}</td>
                      <td className="text-muted-foreground font-mono">{s.abbr}</td>
                      <td><StatusPill status={s.status} notes={s.notes} /></td>
                      <td className="text-xs text-muted-foreground">{s.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/70 italic">Status guide: <strong>Legal</strong> = online sports betting widely available · <strong>Limited</strong> = in-person, tribal-operated only, or restricted offerings · <strong>Not legal</strong> = no legal sports wagering at this time. Laws change — verify with your state regulator.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-black uppercase">If you've already crossed a line</h2>
          <p className="text-muted-foreground leading-relaxed">
            It's not a moral failure. It's a behavior pattern that responds to help. The earlier you reach out, the easier it is. Call <a href="tel:18004262537" className="text-primary underline font-bold">1-800-GAMBLER</a> right now — there's a human on the other end and they don't judge.
          </p>
        </section>

        <p className="text-xs text-muted-foreground/70 leading-relaxed border-t border-border pt-6">
          HIMOTHY Plays and Parlays is for entertainment and educational purposes. We publish editorial analysis of sports betting markets — we don't take bets or operate a sportsbook. Past performance does not guarantee future results.
        </p>
      </div>
    </div>
  );
}
