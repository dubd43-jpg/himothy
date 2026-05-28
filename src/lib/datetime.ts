// Single source of truth for rendering game start times. Everything user-facing shows a
// DATE + TIME in Eastern Time so a stale (yesterday's) game is always distinguishable from
// tonight's. Use these everywhere instead of bare toLocaleString — a time with no date or
// no timezone is exactly the ambiguity we're trying to kill.

const ET = "America/New_York";

export const TIME_TBD = "Start time TBD";

// "2026-05-27" for the current moment in Eastern Time. Used to date-key in-process caches
// so a parlay/board computed yesterday is never served after the ET day rolls over.
export function etDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: ET,
  }).format(d);
}

// "Tue, May 27 · 7:10 PM ET" — the canonical game datetime. Returns "" for missing/invalid
// input so callers can decide whether to show TIME_TBD or hide the row.
export function formatGameDateTimeET(iso: string | null | undefined, opts?: { weekday?: boolean }): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const datePart = new Intl.DateTimeFormat("en-US", {
    ...(opts?.weekday === false ? {} : { weekday: "short" }),
    month: "short",
    day: "numeric",
    timeZone: ET,
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET,
  }).format(d);
  return `${datePart} · ${timePart} ET`;
}

// Date only — "Tue, May 27" in ET. For grouping headers / "as of" labels.
export function formatDateET(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: ET,
  }).format(d);
}

// Time only — "7:10 PM ET". Use sparingly; prefer the full datetime so a date is present.
export function formatTimeET(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: ET,
  }).format(d) + " ET";
}

// "Updated 7:10 PM ET · May 27" — for last-updated/freshness stamps.
export function formatUpdatedET(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET }).format(d);
  const dt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ET }).format(d);
  return `${t} ET · ${dt}`;
}
