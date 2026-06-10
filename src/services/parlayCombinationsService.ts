// OWNER-ONLY PARLAY COMBINATIONS EMAIL
//
// Every day at 8:30 AM ET (and again at 6:00 PM ET to catch late-available games)
// we email rentalsgradea@gmail.com every possible parlay that can be built from
// today's published picks that haven't started yet. Sized 2 through 6 legs.
// Picks already locked or graded are excluded — only live, bettable selections.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';
import { sendEmail } from '@/lib/email';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://himothypicks.com';

const MAX_PICKS = 14;  // 2^14 = 16,384 — combinatorial guardrail.
const DEFAULT_MAX_LEGS = 6;

interface RegistryRow {
  id: string;
  category: string;
  event_name: string;
  selection: string;
  line: string | null;
  odds: string | null;
  lock_time: string | null;
  confidence_tier: string | null;
  edge_score: number | null;
  league: string;
}

interface PickLeg extends RegistryRow {
  decimal: number;
}

function americanToDecimal(odds: string | null): number | null {
  if (!odds) return null;
  const m = String(odds).trim().match(/^([+-]?\d{2,4})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

function decimalToAmerican(d: number): string {
  if (!isFinite(d) || d <= 1) return '+0';
  if (d >= 2) return `+${Math.round((d - 1) * 100).toLocaleString()}`;
  return `${Math.round(-100 / (d - 1))}`;
}

function todayET(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date());
}

async function fetchAvailablePicks(): Promise<PickLeg[]> {
  if (!hasDatabase()) return [];
  const date = todayET();
  const rows = await prisma.$queryRawUnsafe<RegistryRow[]>(
    `SELECT id, category, event_name, selection, line, odds, lock_time, confidence_tier, edge_score, league
       FROM himothy_pick_registry
      WHERE board_date = $1::date
        AND status = 'published'
        AND result = 'pending'
        AND is_public = TRUE
        AND (lock_time IS NULL OR lock_time > NOW())
      ORDER BY edge_score DESC NULLS LAST, created_at ASC`,
    date,
  );
  const legs: PickLeg[] = [];
  for (const r of rows) {
    const dec = americanToDecimal(r.odds);
    if (dec == null) continue;
    legs.push({ ...r, decimal: dec });
  }
  return legs;
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k > n || k <= 0) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

interface ParlayCombo {
  legs: PickLeg[];
  combinedDecimal: number;
  combinedAmerican: string;
  payoutOn10: number;
  payoutOn25: number;
  payoutOn100: number;
}

function buildCombos(picks: PickLeg[], minSize: number, maxSize: number): ParlayCombo[] {
  const out: ParlayCombo[] = [];
  for (let k = minSize; k <= Math.min(maxSize, picks.length); k++) {
    for (const combo of combinations(picks, k)) {
      const dec = combo.reduce((acc, l) => acc * l.decimal, 1);
      out.push({
        legs: combo,
        combinedDecimal: dec,
        combinedAmerican: decimalToAmerican(dec),
        payoutOn10: 10 * dec,
        payoutOn25: 25 * dec,
        payoutOn100: 100 * dec,
      });
    }
  }
  return out;
}

function comboRow(combo: ParlayCombo, idx: number): string {
  const legText = combo.legs.map(l => (
    `<li style="margin:2px 0;font-size:12px;color:#cbd5e1">`
    + `<b style="color:#f1f5f9">${l.selection}${l.line ? ' ' + l.line : ''}</b> `
    + `<span style="color:#10b981;font-weight:700">(${l.odds})</span> `
    + `<span style="color:#64748b">— ${l.event_name}</span>`
    + `</li>`
  )).join('');
  return `
    <tr style="border-top:1px solid #1f2937">
      <td style="padding:10px 8px;vertical-align:top;color:#9ca3af;font-size:11px;font-weight:700">${idx + 1}</td>
      <td style="padding:10px 8px;vertical-align:top;white-space:nowrap">
        <div style="font-size:20px;font-weight:900;color:#10b981">${combo.combinedAmerican}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:4px;line-height:1.4">
          $10 → <b style="color:#f1f5f9">$${combo.payoutOn10.toFixed(2)}</b><br>
          $25 → <b style="color:#f1f5f9">$${combo.payoutOn25.toFixed(2)}</b><br>
          $100 → <b style="color:#f1f5f9">$${combo.payoutOn100.toFixed(2)}</b>
        </div>
      </td>
      <td style="padding:10px 8px;vertical-align:top">
        <ul style="margin:0;padding:0 0 0 16px">${legText}</ul>
      </td>
    </tr>`;
}

function sectionHtml(title: string, combos: ParlayCombo[]): string {
  if (combos.length === 0) return '';
  // Most plus-money first within each leg-count group.
  const sorted = [...combos].sort((a, b) => b.combinedDecimal - a.combinedDecimal);
  const rows = sorted.map((c, i) => comboRow(c, i)).join('');
  return `
    <h3 style="margin:28px 0 10px;font-size:16px;color:#f1f5f9;text-transform:uppercase;letter-spacing:0.08em">
      ${title} <span style="color:#64748b;font-size:12px">(${combos.length.toLocaleString()})</span>
    </h3>
    <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#1e293b">
          <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;width:30px">#</th>
          <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;width:130px">Combined</th>
          <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Legs</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function pickInventoryHtml(picks: PickLeg[]): string {
  const rows = picks.map((p, i) => `
    <tr style="border-top:1px solid #1f2937">
      <td style="padding:6px 8px;color:#9ca3af;font-size:11px">${i + 1}</td>
      <td style="padding:6px 8px;color:#f1f5f9;font-size:12px;font-weight:700">${p.selection}${p.line ? ' ' + p.line : ''}</td>
      <td style="padding:6px 8px;color:#10b981;font-size:12px;font-weight:700">${p.odds}</td>
      <td style="padding:6px 8px;color:#94a3b8;font-size:11px">${p.event_name}</td>
      <td style="padding:6px 8px;color:#64748b;font-size:11px">${(p.category || '').replace(/_/g, ' ')}</td>
    </tr>`).join('');
  return `
    <h3 style="margin:0 0 10px;font-size:16px;color:#f1f5f9;text-transform:uppercase;letter-spacing:0.08em">
      Available picks <span style="color:#64748b;font-size:12px">(${picks.length})</span>
    </h3>
    <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#1e293b">
        <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;width:30px">#</th>
        <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Pick</th>
        <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Odds</th>
        <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Game</th>
        <th style="padding:8px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">Category</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export interface ParlayRunResult {
  ok: boolean;
  picksConsidered: number;
  combosGenerated: number;
  emailed: boolean;
  reason?: string;
}

export async function sendOwnerParlayCombos(opts?: {
  maxLegs?: number;
  maxPicks?: number;
}): Promise<ParlayRunResult> {
  const maxLegs = Math.max(2, Math.min(opts?.maxLegs ?? DEFAULT_MAX_LEGS, 10));
  const maxPicks = Math.max(2, Math.min(opts?.maxPicks ?? MAX_PICKS, MAX_PICKS));

  const all = await fetchAvailablePicks();
  if (all.length < 2) {
    return {
      ok: true,
      picksConsidered: all.length,
      combosGenerated: 0,
      emailed: false,
      reason: 'Need at least 2 available picks to build a parlay.',
    };
  }

  const picks = all.slice(0, maxPicks);
  const skipped = all.length - picks.length;
  const combos = buildCombos(picks, 2, maxLegs);

  const grouped: Record<number, ParlayCombo[]> = {};
  for (const c of combos) {
    const k = c.legs.length;
    (grouped[k] ||= []).push(c);
  }
  const sections = Object.keys(grouped)
    .map(n => Number(n))
    .sort((a, b) => a - b)
    .map(n => sectionHtml(`${n}-Leg Parlays`, grouped[n]))
    .join('');

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date());

  const skippedNote = skipped > 0
    ? `<p style="margin:4px 0 0;color:#f59e0b;font-size:11px">⚠️ ${skipped} additional pick${skipped === 1 ? '' : 's'} excluded — combinatorial cap of ${MAX_PICKS}. Top ${maxPicks} by edge_score kept.</p>`
    : '';

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:920px;margin:0 auto;background:#020617;color:#e5e7eb;padding:28px;border-radius:16px">
  <div style="border-bottom:1px solid #1f2937;padding-bottom:14px;margin-bottom:18px">
    <h2 style="margin:0;font-size:24px;font-weight:900;letter-spacing:-0.02em">🎯 Every Possible Parlay — ${dateLabel}</h2>
    <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">
      Generated ${timeLabel} · <b style="color:#f1f5f9">${picks.length}</b> pick${picks.length === 1 ? '' : 's'} still available ·
      <b style="color:#10b981">${combos.length.toLocaleString()}</b> total combos · ${maxLegs}-leg max
    </p>
    ${skippedNote}
    <p style="margin:8px 0 0;color:#64748b;font-size:11px;font-style:italic">Owner-only. Within each group, sorted by combined American odds (most plus-money first).</p>
  </div>
  ${pickInventoryHtml(picks)}
  ${sections}
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #1f2937;color:#64748b;font-size:11px;line-height:1.6">
    Only published picks for today that haven't locked yet are included. Re-fires automatically each day at 8:30 AM ET and 6:00 PM ET.<br>
    Live dashboard: <a href="${SITE_URL}/admin" style="color:#10b981">${SITE_URL}/admin</a>
  </div>
</div>`.trim();

  const subject = `[HIMOTHY OWNER] ${combos.length.toLocaleString()} parlay combos · ${picks.length} picks open · ${dateLabel}`;
  const res = await sendEmail({ to: OWNER_EMAIL, subject, html });
  return {
    ok: res.ok,
    picksConsidered: picks.length,
    combosGenerated: combos.length,
    emailed: res.ok,
    reason: res.error,
  };
}
