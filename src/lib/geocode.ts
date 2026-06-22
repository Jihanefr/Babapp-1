import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'geo_country_cache';

let memoryCache: Record<string, string> = {};
let cacheLoaded = false;

function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

async function loadCache(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) memoryCache = JSON.parse(raw);
  } catch {
    memoryCache = {};
  }
  cacheLoaded = true;
}

async function saveCache(): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
  } catch {
    // silent
  }
}

export async function getCountryForCoords(
  lat: number,
  lng: number,
): Promise<string> {
  await loadCache();

  const key = gridKey(lat, lng);
  if (memoryCache[key]) return memoryCache[key];

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    const country = results[0]?.country ?? 'Unknown';
    memoryCache[key] = country;
    return country;
  } catch {
    return 'Unknown';
  }
}

export async function batchGeocodeCountries(
  coords: { latitude: number; longitude: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  await loadCache();

  const results: Record<string, string> = {};
  const toResolve: { key: string; lat: number; lng: number }[] = [];

  for (const c of coords) {
    const key = gridKey(c.latitude, c.longitude);
    if (memoryCache[key]) {
      results[key] = memoryCache[key];
    } else {
      if (!toResolve.some((r) => r.key === key)) {
        toResolve.push({ key, lat: c.latitude, lng: c.longitude });
      }
    }
  }

  let done = coords.length - toResolve.length;
  onProgress?.(done, coords.length);

  for (const item of toResolve) {
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: item.lat,
        longitude: item.lng,
      });
      const country = res[0]?.country ?? 'Unknown';
      memoryCache[item.key] = country;
      results[item.key] = country;
    } catch {
      memoryCache[item.key] = 'Unknown';
      results[item.key] = 'Unknown';
    }
    done++;
    onProgress?.(done, coords.length);
  }

  await saveCache();
  return { ...memoryCache };
}

export function getCachedCountry(lat: number, lng: number): string | undefined {
  const key = gridKey(lat, lng);
  return memoryCache[key];
}

/**
 * Forward geocode a place name to coordinates.
 * Returns lat/lng + resolved label, or null if not found.
 */
export async function forwardGeocode(
  query: string,
): Promise<{ latitude: number; longitude: number; label: string; country: string | null } | null> {
  try {
    const results = await Location.geocodeAsync(query);
    if (!results || results.length === 0) return null;
    const { latitude, longitude } = results[0];
    const rev = await getDetailedAddress(latitude, longitude);
    return { latitude, longitude, label: rev.address, country: rev.country };
  } catch {
    return null;
  }
}

/**
 * Reverse geocode coordinates to get a detailed address string (city, region, country).
 */
export async function getDetailedAddress(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string | null; region: string | null; country: string | null }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results[0];
    if (!r) return { address: 'Unknown location', city: null, region: null, country: null };

    const parts: string[] = [];
    if (r.street) parts.push(r.street);
    if (r.city) parts.push(r.city);
    if (r.region && r.region !== r.city) parts.push(r.region);
    if (r.country) parts.push(r.country);

    return {
      address: parts.length > 0 ? parts.join(', ') : 'Unknown location',
      city: r.city ?? null,
      region: r.region ?? null,
      country: r.country ?? null,
    };
  } catch {
    return { address: 'Unknown location', city: null, region: null, country: null };
  }
}
