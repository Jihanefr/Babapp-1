import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { GeoPhoto } from '../hooks/usePhotoScanner';

const URL_CACHE_KEY = (userId: string) => `@photo_pin_urls_${userId}`;
const URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (Supabase URLs expire after 60 min)

interface UrlCache {
  ts: number;
  urls: Record<string, string>; // storagePath → signedUrl
}

const THUMB_SIZE = 300;
const THUMB_QUALITY = 0.6;
const BUCKET = 'user-photo-pins';

export interface PhotoPin {
  id: string;
  user_id: string;
  local_asset_id: string | null;
  storage_path: string;
  latitude: number;
  longitude: number;
  taken_at: string;
  country: string | null;
  created_at: string;
  /** Signed URL for the thumbnail (populated after fetch) */
  thumbnailUrl?: string;
}

/**
 * Compress a photo to a small JPEG thumbnail.
 */
async function compressToThumbnail(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: THUMB_SIZE } }],
    { compress: THUMB_QUALITY, format: SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Upload a single thumbnail to Supabase Storage.
 * Path: {userId}/{assetId}.jpg
 */
async function uploadThumbnail(
  userId: string,
  assetId: string,
  thumbUri: string,
): Promise<{ path: string; error: Error | null }> {
  const storagePath = `${userId}/${assetId}.jpg`;

  const response = await fetch(thumbUri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    return { path: storagePath, error: error as unknown as Error };
  }
  return { path: storagePath, error: null };
}

/**
 * Persist a batch of scanned GeoPhotos to Supabase.
 * - Compresses each to a thumbnail
 * - Uploads to storage
 * - Inserts row into photo_pins
 * - Skips already-persisted photos (unique constraint)
 *
 * Returns the number of newly persisted pins.
 */
export async function persistPhotoPins(
  userId: string,
  photos: GeoPhoto[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let persisted = 0;

  // First, fetch existing asset IDs so we skip them
  const { data: existing } = await supabase
    .from('photo_pins')
    .select('local_asset_id')
    .eq('user_id', userId);

  const existingIds = new Set(
    (existing ?? []).map((r: { local_asset_id: string | null }) => r.local_asset_id),
  );

  const toPersist = photos.filter((p) => !existingIds.has(p.id));

  for (let i = 0; i < toPersist.length; i++) {
    const photo = toPersist[i];
    try {
      // 1. Compress
      const thumbUri = await compressToThumbnail(photo.uri);

      // 2. Upload
      const { path, error: uploadErr } = await uploadThumbnail(userId, photo.id, thumbUri);
      if (uploadErr) {
        console.warn('[PhotoPins] Upload failed for', photo.id, uploadErr.message);
        continue;
      }

      // 3. Insert row
      const { error: insertErr } = await supabase.from('photo_pins').insert({
        user_id: userId,
        local_asset_id: photo.id,
        storage_path: path,
        latitude: photo.latitude,
        longitude: photo.longitude,
        taken_at: new Date(photo.creationTime).toISOString(),
        country: photo.country ?? null,
      });

      if (insertErr) {
        // Unique constraint = already exists, skip silently
        if (insertErr.code === '23505') continue;
        console.warn('[PhotoPins] Insert failed for', photo.id, insertErr.message);
        continue;
      }

      persisted++;
    } catch (err) {
      console.warn('[PhotoPins] Error persisting', photo.id, err);
    }

    onProgress?.(i + 1, toPersist.length);
  }

  return persisted;
}

/**
 * Fetch all photo_pins for the current user, with signed thumbnail URLs.
 * Signed URLs are cached in AsyncStorage for up to 50 minutes.
 */
export async function fetchPhotoPins(userId: string): Promise<PhotoPin[]> {
  const { data, error } = await supabase
    .from('photo_pins')
    .select('*')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false });

  if (error || !data) {
    console.error('[PhotoPins] Fetch error:', error?.message);
    return [];
  }

  const paths = data.map((row: any) => row.storage_path as string);
  const urlMap: Record<string, string> = {};

  if (paths.length > 0) {
    // Try cache first
    let pathsToFetch = paths;
    try {
      const raw = await AsyncStorage.getItem(URL_CACHE_KEY(userId));
      if (raw) {
        const cache: UrlCache = JSON.parse(raw);
        const age = Date.now() - cache.ts;
        if (age < URL_CACHE_TTL_MS) {
          // Load whatever we have cached
          for (const p of paths) {
            if (cache.urls[p]) urlMap[p] = cache.urls[p];
          }
          // Only fetch paths missing from cache
          pathsToFetch = paths.filter((p) => !urlMap[p]);
        }
      }
    } catch {}

    // Fetch missing URLs from Supabase
    if (pathsToFetch.length > 0) {
      try {
        const { data: signedUrls, error: urlError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(pathsToFetch, 3600);

        if (!urlError && signedUrls) {
          pathsToFetch.forEach((p, i) => {
            if (signedUrls[i]?.signedUrl) urlMap[p] = signedUrls[i].signedUrl;
          });
        }
      } catch {
        console.warn('[PhotoPins] Signed URL exception, skipping missing thumbnails');
      }

      // Update cache
      try {
        const updated: UrlCache = { ts: Date.now(), urls: urlMap };
        await AsyncStorage.setItem(URL_CACHE_KEY(userId), JSON.stringify(updated));
      } catch {}
    }
  }

  const pins: PhotoPin[] = data.map((row: any) => ({
    ...row,
    thumbnailUrl: urlMap[row.storage_path] ?? undefined,
  }));

  return pins;
}

/**
 * Delete a photo pin (row + storage file).
 */
export async function deletePhotoPin(pin: PhotoPin): Promise<void> {
  await supabase.storage.from(BUCKET).remove([pin.storage_path]);
  await supabase.from('photo_pins').delete().eq('id', pin.id);
}
