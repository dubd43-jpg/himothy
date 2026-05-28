// Wraps fetch with an AbortController timeout so a hung upstream (ESPN, Odds API, etc.)
// can't stall a route until its maxDuration and 500. Defaults to 8s. On timeout the
// promise rejects with an AbortError — callers already catch fetch failures, so a slow
// upstream degrades to "no data" instead of a hang.
export async function fetchWithTimeout(
  url: string,
  opts: (RequestInit & { timeoutMs?: number }) = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = opts;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
