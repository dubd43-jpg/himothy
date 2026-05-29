// Verified record begins the day real auto-tracking went live. Every pick from this date
// forward is recorded before its game and graded against the real final — 100% honest,
// with no backfilled or fabricated history.
// Official record starts when the upgraded engine went live (tendencies, multi-market hunt,
// 80 floor). Pre-27 picks were the old engine and were cleared — we start fresh here.
export const OFFICIAL_TRACKING_START_DATE = '2026-05-27';
export const OFFICIAL_TRACKING_TIMEZONE = 'America/New_York';

// Human-readable label for the start date — derived from the canonical date so UI copy can
// never drift to a wrong/fabricated start (e.g. a stale "April 20" that implies history we
// don't actually have). Use this everywhere instead of hardcoding a date string.
export const OFFICIAL_TRACKING_START_LABEL = new Date(`${OFFICIAL_TRACKING_START_DATE}T12:00:00Z`)
  .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: OFFICIAL_TRACKING_TIMEZONE });

function toParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICIAL_TRACKING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return { year, month, day };
}

export function getEtDateKey(date = new Date()) {
  const { year, month, day } = toParts(date);
  return `${year}-${month}-${day}`;
}

export function getOfficialBoardDate(input?: string) {
  const key = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? input
    : getEtDateKey();
  return key < OFFICIAL_TRACKING_START_DATE ? OFFICIAL_TRACKING_START_DATE : key;
}

export function clampToOfficialStartDate(input?: string) {
  if (!input) return OFFICIAL_TRACKING_START_DATE;
  return input < OFFICIAL_TRACKING_START_DATE ? OFFICIAL_TRACKING_START_DATE : input;
}

export function isOfficialTrackingDate(input: string) {
  return input >= OFFICIAL_TRACKING_START_DATE;
}

export function getOfficialTrackingLabel() {
  return `Official Record Since ${OFFICIAL_TRACKING_START_DATE}`;
}
