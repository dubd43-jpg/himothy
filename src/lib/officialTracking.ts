// Verified record begins the day real auto-tracking went live. Every pick from this date
// forward is recorded before its game and graded against the real final — 100% honest,
// with no backfilled or fabricated history.
export const OFFICIAL_TRACKING_START_DATE = '2026-05-22';
export const OFFICIAL_TRACKING_TIMEZONE = 'America/New_York';

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
