import { useCallback, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { batchGeocodeCountries, getCachedCountry } from '../lib/geocode';

const SCAN_STATE_KEY = (userId: string) => `@photo_scan_last_at_${userId}`;

export interface GeoPhoto {
  id: string;
  uri: string;
  latitude: number;
  longitude: number;
  creationTime: number;
  year: number;
  country?: string;
}

interface ScanState {
  photos: GeoPhoto[];
  noGpsPhotos: GeoPhoto[];
  scanned: number;
  total: number;
  scanning: boolean;
  geocoding: boolean;
  geocodeProgress: number;
  permissionDenied: boolean;
}

const MAX_PHOTOS = 1000;
const PAGE_SIZE = 100;
const PARALLEL_INFO = 5;

export function usePhotoScanner() {
  const [state, setState] = useState<ScanState>({
    photos: [],
    noGpsPhotos: [],
    scanned: 0,
    total: 0,
    scanning: false,
    geocoding: false,
    geocodeProgress: 0,
    permissionDenied: false,
  });
  const abortRef = useRef(false);

  const scan = useCallback(async (userId?: string, fullRescan = false) => {
    abortRef.current = false;

    // ── Permission: best-effort request, do NOT gate on result ────────────
    // Expo Go on Android 13+ has unreliable permission APIs — we trigger the
    // OS dialog here but decide access based on whether getAssetsAsync works.
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch {}

    if (Platform.OS === 'android') {
      const isAndroid13Plus = Number(Platform.Version) >= 33;
      const imagePermission = isAndroid13Plus
        ? ('android.permission.READ_MEDIA_IMAGES' as any)
        : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      try { await PermissionsAndroid.request(imagePermission); } catch {}
      try { await PermissionsAndroid.request('android.permission.ACCESS_MEDIA_LOCATION' as any); } catch {}
    }

    // Proof of access: try reading any asset. If it throws, permission is truly denied.
    try {
      await MediaLibrary.getAssetsAsync({ first: 1 });
    } catch {
      setState((s) => ({ ...s, permissionDenied: true }));
      return;
    }

    // Read last scan timestamp for delta scanning
    let createdAfter: number | undefined;
    if (userId && !fullRescan) {
      try {
        const raw = await AsyncStorage.getItem(SCAN_STATE_KEY(userId));
        if (raw) createdAfter = Number(raw);
      } catch {}
    }

    setState({
      photos: [],
      noGpsPhotos: [],
      scanned: 0,
      total: 0,
      scanning: true,
      geocoding: false,
      geocodeProgress: 0,
      permissionDenied: false,
    });

    const geoPhotos: GeoPhoto[] = [];
    const noGpsPhotos: GeoPhoto[] = [];
    let hasMore = true;
    let endCursor: string | undefined;
    let totalScanned = 0;
    const scanStartTime = Date.now();

    while (hasMore && totalScanned < MAX_PHOTOS) {
      if (abortRef.current) break;

      const page = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: PAGE_SIZE,
        after: endCursor,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        ...(createdAfter ? { createdAfter } : {}),
      });

      hasMore = page.hasNextPage;
      endCursor = page.endCursor;

      // Process assets in parallel batches for speed
      const assets = page.assets.slice(0, MAX_PHOTOS - totalScanned);
      for (let i = 0; i < assets.length; i += PARALLEL_INFO) {
        if (abortRef.current) break;

        const chunk = assets.slice(i, i + PARALLEL_INFO);
        const results = await Promise.all(
          chunk.map(async (asset) => {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              // Android: retry once if location is missing (ACCESS_MEDIA_LOCATION may need a moment)
              if (Platform.OS === 'android' && (!info.location || (info.location.latitude === 0 && info.location.longitude === 0))) {
                await new Promise((r) => setTimeout(r, 200));
                const retry = await MediaLibrary.getAssetInfoAsync(asset.id);
                return { asset, info: retry };
              }
              return { asset, info };
            } catch {
              return { asset, info: null };
            }
          }),
        );

        for (const { asset, info } of results) {
          if (!info) continue;
          const loc = info.location;
          const hasGps = loc != null &&
            loc.latitude != null && loc.longitude != null &&
            (loc.latitude !== 0 || loc.longitude !== 0);
          const date = new Date(asset.creationTime);
          if (hasGps) {
            geoPhotos.push({
              id: asset.id,
              uri: info.localUri ?? asset.uri,
              latitude: Number(loc!.latitude),
              longitude: Number(loc!.longitude),
              creationTime: asset.creationTime,
              year: date.getFullYear(),
            });
          } else {
            // Collect photos without GPS for manual location assignment
            noGpsPhotos.push({
              id: asset.id,
              uri: info.localUri ?? asset.uri,
              latitude: 0,
              longitude: 0,
              creationTime: asset.creationTime,
              year: date.getFullYear(),
            });
          }
        }

        totalScanned += chunk.length;
      }

      setState((s) => ({
        ...s,
        photos: [...geoPhotos],
        noGpsPhotos: [...noGpsPhotos],
        scanned: totalScanned,
        total: Math.max(totalScanned, page.totalCount),
      }));
    }

    setState((s) => ({
      ...s,
      photos: [...geoPhotos],
      scanned: totalScanned,
      scanning: false,
      geocoding: true,
    }));

    // Phase 2: reverse geocode countries
    const coords = geoPhotos.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    await batchGeocodeCountries(coords, (done, total) => {
      setState((s) => ({ ...s, geocodeProgress: Math.round((done / total) * 100) }));
    });

    // Assign countries from cache
    for (const photo of geoPhotos) {
      photo.country = getCachedCountry(photo.latitude, photo.longitude) ?? 'Unknown';
    }

    // Persist last scan timestamp so next scan is delta-only
    if (userId && !abortRef.current) {
      try {
        await AsyncStorage.setItem(SCAN_STATE_KEY(userId), String(scanStartTime));
      } catch {}
    }

    console.log('[Scanner] Done. Total scanned:', totalScanned, 'With GPS:', geoPhotos.length, 'No GPS:', noGpsPhotos.length);
    setState((s) => ({
      ...s,
      photos: [...geoPhotos],
      noGpsPhotos: [...noGpsPhotos],
      geocoding: false,
      geocodeProgress: 100,
    }));
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { ...state, scan, abort };
}
