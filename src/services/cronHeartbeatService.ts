// CRON HEARTBEAT MONITORING
//
// Every scheduled cron route should call recordHeartbeat() at the top of its
// handler. We persist the timestamp + expected interval, so a separate watch
// cron (/api/cron/heartbeat-watch) can flag any cron that hasn't checked in
// within its expected window — and email the owner.
//
// Without this, silent cron failures rot the site (the snapshot-closing /
// daily-email / record-board crons have all failed silently before). With it,
// you get an email the moment a job stops running.

import { prisma } from '@/lib/prisma';
import { hasDatabase } from '@/lib/hasDatabase';

const OWNER_EMAIL = 'rentalsgradea@gmail.com';

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady || !hasDatabase()) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS himothy_cron_heartbeat (
        name TEXT PRIMARY KEY,
        last_seen TIMESTAMPTZ NOT NULL,
        expected_interval_minutes INTEGER NOT NULL,
        last_status TEXT,
        last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        alerted_at TIMESTAMPTZ
      )
    `);
    _schemaReady = true;
  } catch (err) {
    console.error('[cronHeartbeat] schema bootstrap failed', err);
  }
}

export async function recordHeartbeat(name: string, expectedIntervalMinutes: number, opts: { ok: boolean; error?: string } = { ok: true }): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO himothy_cron_heartbeat (name, last_seen, expected_interval_minutes, last_status, last_error, consecutive_failures, alerted_at)
       VALUES ($1, NOW(), $2, $3, $4,
               CASE WHEN $5 THEN 0 ELSE 1 END,
               NULL)
       ON CONFLICT (name) DO UPDATE SET
         last_seen = NOW(),
         expected_interval_minutes = EXCLUDED.expected_interval_minutes,
         last_status = EXCLUDED.last_status,
         last_error = EXCLUDED.last_error,
         consecutive_failures = CASE
           WHEN $5 THEN 0
           ELSE himothy_cron_heartbeat.consecutive_failures + 1
         END,
         alerted_at = CASE
           WHEN $5 THEN NULL
           ELSE himothy_cron_heartbeat.alerted_at
         END`,
      name, expectedIntervalMinutes, opts.ok ? 'ok' : 'error', opts.error || null, opts.ok,
    );
  } catch (err) {
    console.error('[cronHeartbeat] record failed', err);
  }
}

export interface HeartbeatStatus {
  name: string;
  lastSeen: string;
  expectedIntervalMinutes: number;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  alertedAt: string | null;
  // Computed
  minutesSinceLastSeen: number;
  health: 'healthy' | 'stale' | 'failed';
}

export async function getAllHeartbeats(): Promise<HeartbeatStatus[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      name: string; last_seen: Date; expected_interval_minutes: number;
      last_status: string | null; last_error: string | null;
      consecutive_failures: number; alerted_at: Date | null;
    }>>(`SELECT * FROM himothy_cron_heartbeat ORDER BY name ASC`);
    return rows.map((r) => {
      const minutesSinceLastSeen = (Date.now() - new Date(r.last_seen).getTime()) / 60_000;
      // 2x grace: cron isn't stale until it's missed 2 full intervals.
      const isStale = minutesSinceLastSeen > r.expected_interval_minutes * 2;
      const isFailed = r.consecutive_failures >= 3 || isStale;
      return {
        name: r.name,
        lastSeen: r.last_seen.toISOString(),
        expectedIntervalMinutes: r.expected_interval_minutes,
        lastStatus: r.last_status,
        lastError: r.last_error,
        consecutiveFailures: r.consecutive_failures,
        alertedAt: r.alerted_at ? r.alerted_at.toISOString() : null,
        minutesSinceLastSeen: Number(minutesSinceLastSeen.toFixed(1)),
        health: isFailed ? 'failed' : isStale ? 'stale' : 'healthy',
      };
    });
  } catch (err) {
    console.error('[cronHeartbeat] read failed', err);
    return [];
  }
}

// Scan for stale/failed crons and email the owner. Dedupes within a 6-hour
// window per cron so we don't spam during a long outage.
export async function alertOnFailures(): Promise<{ alerted: number; checked: number }> {
  if (!hasDatabase()) return { alerted: 0, checked: 0 };
  const heartbeats = await getAllHeartbeats();
  let alerted = 0;
  const ALERT_DEDUPE_HOURS = 6;
  const dedupeMs = ALERT_DEDUPE_HOURS * 60 * 60 * 1000;

  for (const hb of heartbeats) {
    if (hb.health === 'healthy') continue;
    const lastAlertMs = hb.alertedAt ? new Date(hb.alertedAt).getTime() : 0;
    if (Date.now() - lastAlertMs < dedupeMs) continue;
    try {
      const { sendEmail } = await import('@/lib/email');
      const subject = `[HIMOTHY · CRON ${hb.health.toUpperCase()}] ${hb.name}`;
      const html = renderAlertHtml(hb);
      await sendEmail({ to: [OWNER_EMAIL], subject, html, replyTo: OWNER_EMAIL });
      // Mark alerted so we don't spam.
      await prisma.$executeRawUnsafe(
        `UPDATE himothy_cron_heartbeat SET alerted_at = NOW() WHERE name = $1`,
        hb.name,
      );
      alerted++;
    } catch (err) {
      console.error('[cronHeartbeat] alert send failed for', hb.name, err);
    }
  }
  return { alerted, checked: heartbeats.length };
}

function renderAlertHtml(hb: HeartbeatStatus): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#e5e7eb;padding:24px;border-radius:16px">
  <h2 style="margin:0 0 6px 0;font-size:18px;font-weight:900">⚠ Cron ${hb.health}: ${hb.name}</h2>
  <p style="margin:0 0 16px 0;color:#9ca3af;font-size:13px">${hb.health === 'failed' ? 'This scheduled job has failed multiple times in a row or stopped checking in.' : 'This job hasn\'t pinged in longer than expected.'}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e5e7eb">
    <tr><td style="padding:6px 0;color:#9ca3af">Name</td><td style="padding:6px 0;text-align:right;font-family:monospace">${hb.name}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af">Last seen</td><td style="padding:6px 0;text-align:right">${hb.minutesSinceLastSeen.toFixed(0)} min ago</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af">Expected every</td><td style="padding:6px 0;text-align:right">${hb.expectedIntervalMinutes} min</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af">Consecutive failures</td><td style="padding:6px 0;text-align:right">${hb.consecutiveFailures}</td></tr>
    <tr><td style="padding:6px 0;color:#9ca3af">Last status</td><td style="padding:6px 0;text-align:right">${hb.lastStatus || '—'}</td></tr>
    ${hb.lastError ? `<tr><td style="padding:6px 0;color:#9ca3af">Last error</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:11px;word-break:break-all">${hb.lastError.slice(0, 200)}</td></tr>` : ''}
  </table>
  <p style="margin:18px 0 0 0;color:#6b7280;font-size:11px">View all heartbeats: himothypicks.com/admin/cron-health</p>
</div>`.trim();
}
