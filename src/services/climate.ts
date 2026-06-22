import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ClimateResult {
  avgHigh: number;       // °C
  avgLow: number;        // °C
  precipitation: number; // mm total
  rainyDays: number;     // days with >1mm
  windSpeed: number;     // km/h average of daily max
  sunshine: number;      // hours total
  month: number;
  year: number;
  latitude: number;
  longitude: number;
}

interface FetchParams {
  latitude: number;
  longitude: number;
  year: number;
  month: number; // 0-indexed (JS convention)
}

const CACHE_PREFIX = 'climate_';

function cacheKey(p: FetchParams): string {
  const lat = Number(p.latitude).toFixed(2);
  const lng = Number(p.longitude).toFixed(2);
  return `${CACHE_PREFIX}${lat}_${lng}_${p.year}_${p.month}`;
}

function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // last day of month
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

/**
 * Fetch monthly climate data from Open-Meteo Historical Weather API.
 * Uses daily aggregates and computes monthly averages.
 * For future months, we use the previous year's data as a proxy for "typical" conditions.
 */
export async function getMonthlyClimate(params: FetchParams): Promise<ClimateResult> {
  const key = cacheKey(params);

  // Check cache first
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached) as ClimateResult;
  } catch {
    // cache miss, continue
  }

  // For future dates, use last year as proxy
  const now = new Date();
  let queryYear = params.year;
  const targetDate = new Date(params.year, params.month + 1, 0);
  if (targetDate > now) {
    queryYear = params.year - 1;
  }

  const { start, end } = getMonthDateRange(queryYear, params.month);

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${Number(params.latitude).toFixed(4)}` +
    `&longitude=${Number(params.longitude).toFixed(4)}` +
    `&start_date=${start}` +
    `&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunshine_duration` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status}`);
  }

  const data = await res.json();
  const daily = data.daily;

  if (!daily || !daily.temperature_2m_max) {
    throw new Error('No climate data available for this location/period');
  }

  const days = daily.temperature_2m_max.length;

  const avgHigh = average(daily.temperature_2m_max);
  const avgLow = average(daily.temperature_2m_min);
  const precipitation = sum(daily.precipitation_sum);
  const rainyDays = (daily.precipitation_sum as number[]).filter((v) => v != null && v > 1).length;
  const windSpeed = average(daily.wind_speed_10m_max);
  // sunshine_duration comes in seconds, convert to hours
  const sunshine = Math.round(sum(daily.sunshine_duration) / 3600);

  const result: ClimateResult = {
    avgHigh: round1(avgHigh),
    avgLow: round1(avgLow),
    precipitation: Math.round(precipitation),
    rainyDays,
    windSpeed: round1(windSpeed),
    sunshine,
    month: params.month,
    year: params.year,
    latitude: params.latitude,
    longitude: params.longitude,
  };

  // Save to cache
  try {
    await AsyncStorage.setItem(key, JSON.stringify(result));
  } catch {
    // non-critical
  }

  return result;
}

// ── Helpers ──

function average(arr: (number | null)[]): number {
  const valid = arr.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(arr: (number | null)[]): number {
  return arr.filter((v): v is number => v != null).reduce((a, b) => a + b, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
