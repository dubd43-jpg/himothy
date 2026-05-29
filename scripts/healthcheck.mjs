#!/usr/bin/env node
// Post-deploy health gate. Hits /api/system/health on the live site and exits non-zero if
// any critical invariant is broken (empty board, missing pick times, premium ML steeper than
// -145, thin parlay, stale ET date, dead live feed). Run this after EVERY deploy:
//
//   node scripts/healthcheck.mjs                         # checks himothypicks.com
//   node scripts/healthcheck.mjs https://preview-url      # checks a specific deploy
//   ADMIN_SECRET=xxx node scripts/healthcheck.mjs         # include detailed failure messages
//
// Never report a deploy as "done" until this prints HEALTHY.

const base = (process.argv[2] || process.env.HEALTHCHECK_URL || 'https://himothypicks.com').replace(/\/$/, '');
const url = `${base}/api/system/health`;
const headers = { accept: 'application/json' };
if (process.env.ADMIN_SECRET) headers['x-admin-secret'] = process.env.ADMIN_SECRET;

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 45000);

try {
  const res = await fetch(url, { headers, signal: controller.signal });
  clearTimeout(timeout);
  const data = await res.json();

  console.log(`\n  ${data.ok ? '✓' : '✗'} ${data.summary}`);
  console.log(`    ET date: ${data.etDate}  |  HTTP ${res.status}\n`);

  const fails = data.failures || [];
  const warns = data.warnings || [];
  if (fails.length) {
    console.log('  CRITICAL FAILURES:');
    for (const f of fails) console.log(`    ✗ ${typeof f === 'string' ? f : JSON.stringify(f)}`);
    console.log('');
  }
  if (warns.length) {
    console.log('  warnings:');
    for (const w of warns) console.log(`    • ${typeof w === 'string' ? w : JSON.stringify(w)}`);
    console.log('');
  }

  process.exit(data.ok ? 0 : 1);
} catch (err) {
  clearTimeout(timeout);
  console.error(`\n  ✗ Health check could not reach ${url}: ${err?.message || err}\n`);
  process.exit(2);
}
