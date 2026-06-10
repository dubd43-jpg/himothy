// Weather service via api.weather.gov (NWS) — free, no API key.
//
// Used for OUTDOOR MLB and NFL stadiums. Wind direction/speed matters for totals
// (wind out at Wrigley = HR-friendly = Over; wind in at Yankee Stadium = pitcher
// edge = Under). Temperature matters for ball flight.
//
// MLB stadiums (lat/lon) — outdoor parks only; domed parks return null.
// Coordinates from public sources.

const TTL_MS = 30 * 60 * 1000;
const _cache: Map<string, { data: WeatherForecast; at: number }> = new Map();

export interface WeatherForecast {
  tempF: number | null;
  windMph: number | null;
  windDirection: string | null;   // e.g. "NW", "S"
  shortForecast: string | null;
  precipProb: number | null;       // 0-100
  isOutdoor: boolean;
}

const MLB_STADIUMS: Record<string, { lat: number; lon: number; outdoor: boolean }> = {
  'angels':       { lat: 33.8003, lon: -117.8827, outdoor: true },
  'astros':       { lat: 29.7572, lon: -95.3553, outdoor: false }, // retractable
  'athletics':    { lat: 37.7516, lon: -122.2005, outdoor: true },
  'blue jays':    { lat: 43.6414, lon: -79.3894, outdoor: false }, // retractable
  'braves':       { lat: 33.8908, lon: -84.4677, outdoor: true },
  'brewers':      { lat: 43.0280, lon: -87.9712, outdoor: false }, // retractable
  'cardinals':    { lat: 38.6226, lon: -90.1928, outdoor: true },
  'cubs':         { lat: 41.9484, lon: -87.6553, outdoor: true },
  'diamondbacks': { lat: 33.4453, lon: -112.0667, outdoor: false }, // retractable
  'dodgers':      { lat: 34.0739, lon: -118.2400, outdoor: true },
  'giants':       { lat: 37.7786, lon: -122.3893, outdoor: true },
  'guardians':    { lat: 41.4962, lon: -81.6852, outdoor: true },
  'mariners':     { lat: 47.5914, lon: -122.3322, outdoor: false }, // retractable
  'marlins':      { lat: 25.7781, lon: -80.2197, outdoor: false }, // retractable
  'mets':         { lat: 40.7571, lon: -73.8458, outdoor: true },
  'nationals':    { lat: 38.8730, lon: -77.0074, outdoor: true },
  'orioles':      { lat: 39.2839, lon: -76.6217, outdoor: true },
  'padres':       { lat: 32.7073, lon: -117.1573, outdoor: true },
  'phillies':     { lat: 39.9061, lon: -75.1665, outdoor: true },
  'pirates':      { lat: 40.4469, lon: -80.0058, outdoor: true },
  'rangers':      { lat: 32.7473, lon: -97.0817, outdoor: false }, // retractable
  'rays':         { lat: 27.7682, lon: -82.6534, outdoor: false }, // dome
  'red sox':      { lat: 42.3467, lon: -71.0972, outdoor: true },
  'reds':         { lat: 39.0975, lon: -84.5067, outdoor: true },
  'rockies':      { lat: 39.7559, lon: -104.9942, outdoor: true },
  'royals':       { lat: 39.0517, lon: -94.4803, outdoor: true },
  'tigers':       { lat: 42.3390, lon: -83.0485, outdoor: true },
  'twins':        { lat: 44.9817, lon: -93.2776, outdoor: true },
  'white sox':    { lat: 41.8300, lon: -87.6338, outdoor: true },
  'yankees':      { lat: 40.8296, lon: -73.9262, outdoor: true },
};

function teamKey(homeTeamName: string): string | null {
  const lower = homeTeamName.toLowerCase();
  for (const k of Object.keys(MLB_STADIUMS)) {
    if (lower.includes(k)) return k;
  }
  return null;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'himothypicks.com (rentalsgradea@gmail.com)' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function getStadiumForecast(homeTeamName: string, gameTime: Date | string): Promise<WeatherForecast | null> {
  const key = teamKey(homeTeamName);
  if (!key) return null;
  const stadium = MLB_STADIUMS[key];
  if (!stadium.outdoor) return { tempF: null, windMph: null, windDirection: null, shortForecast: 'Dome/Retractable — no weather impact', precipProb: null, isOutdoor: false };

  const cacheKey = `${key}|${String(gameTime).slice(0, 13)}`; // bucket to the hour
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // NWS API requires two-hop: lat/lon → forecast office grid → hourly forecast
  const pointMeta = await fetchJson(`https://api.weather.gov/points/${stadium.lat},${stadium.lon}`);
  const hourlyUrl = pointMeta?.properties?.forecastHourly;
  if (!hourlyUrl) return null;

  const hourly = await fetchJson(hourlyUrl);
  const periods = hourly?.properties?.periods || [];
  if (!periods.length) return null;

  // Find the period closest to game time
  const target = (gameTime instanceof Date ? gameTime : new Date(gameTime)).getTime();
  let best: any = null;
  let bestDelta = Infinity;
  for (const p of periods) {
    const start = new Date(p.startTime).getTime();
    const delta = Math.abs(start - target);
    if (delta < bestDelta) { bestDelta = delta; best = p; }
  }
  if (!best) return null;

  const data: WeatherForecast = {
    tempF: best.temperature != null ? Number(best.temperature) : null,
    windMph: (() => {
      // "12 mph" or "8 to 12 mph" — take the higher
      const s = String(best.windSpeed || '');
      const ms = s.match(/(\d+)(?:\s*to\s*(\d+))?\s*mph/i);
      if (!ms) return null;
      return ms[2] ? Number(ms[2]) : Number(ms[1]);
    })(),
    windDirection: best.windDirection || null,
    shortForecast: best.shortForecast || null,
    precipProb: best.probabilityOfPrecipitation?.value ?? null,
    isOutdoor: true,
  };
  _cache.set(cacheKey, { data, at: Date.now() });
  return data;
}

// Translate wind into totals-direction nudge using ballpark orientation.
// Most MLB parks face roughly NORTHEAST. A south/southwest wind blows OUT
// (HR-friendly = Over). North/northeast wind blows IN (Under).
// Returns:  positive = Over leans,  negative = Under leans,  null = no signal.
export function windTotalsNudge(forecast: WeatherForecast | null, homeTeamName: string): { nudge: number; label: string } | null {
  if (!forecast?.isOutdoor || !forecast.windMph || forecast.windMph < 8) return null;
  const dir = (forecast.windDirection || '').toUpperCase();
  if (!dir) return null;
  // Heuristic: S/SW/SSW/W winds blow OUT in most parks → Over
  //           N/NE/NNE/E winds blow IN → Under
  const outDirs = ['S', 'SSW', 'SW', 'SSE', 'WSW'];
  const inDirs  = ['N', 'NNE', 'NE', 'ENE', 'NNW'];
  if (outDirs.includes(dir) && forecast.windMph >= 10) {
    return { nudge: +0.5, label: `Wind ${dir} at ${forecast.windMph}mph blowing OUT — HR-friendly` };
  }
  if (inDirs.includes(dir) && forecast.windMph >= 10) {
    return { nudge: -0.5, label: `Wind ${dir} at ${forecast.windMph}mph blowing IN — pitcher's wind` };
  }
  return null;
}
