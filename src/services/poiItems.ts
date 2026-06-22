import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { CircuitCategory } from '../lib/circuitCategories';

const SIGNED_URL_TTL = 604800; // 7 days — POI thumbnails are immutable
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — background refresh threshold
const MY_POIS_CACHE = (uid: string) => `@pois_${uid}`;
const COMMUNITY_CACHE_KEY = '@community_pois';

interface PoisCache {
  ts: number;
  items: POIItem[];
}

const BUCKET = 'user-photo-pins';

export interface POIItem {
  id: string;
  user_id: string;
  photo_pin_id: string | null;
  title: string;
  type: CircuitCategory;
  latitude: number;
  longitude: number;
  country: string | null;
  address: string | null;
  notes: string | null;
  thumbnail_path: string | null;
  created_at: string;
  is_published: boolean;
  /** Signed URL for the thumbnail (populated after fetch) */
  thumbnailUrl?: string;
  /** Signed URLs for extra photos (populated after fetch) */
  photoUrls?: string[];
  /** Display name of the author (community feed only) */
  author_name?: string;
  /** Date the photo was taken (stored directly on poi_items.taken_at) */
  taken_at?: string | null;
}

/**
 * Compress and upload a thumbnail for a POI, returning the storage path.
 */
async function uploadPOIThumbnail(userId: string, sourceUri: string): Promise<string | null> {
  try {
    const result = await manipulateAsync(
      sourceUri,
      [{ resize: { width: 400 } }],
      { compress: 0.7, format: SaveFormat.JPEG },
    );
    const storagePath = `${userId}/poi_${Date.now()}.jpg`;
    const response = await fetch(result.uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      console.warn('[POI] Thumbnail upload failed:', error.message);
      return null;
    }
    return storagePath;
  } catch (err) {
    console.warn('[POI] Thumbnail compress/upload error:', err);
    return null;
  }
}

/**
 * Insert a new POI item.
 * If sourceUri is provided and no thumbnailPath, compresses + uploads the photo.
 */
export async function createPOI(params: {
  userId: string;
  photoPinId?: string;
  title: string;
  type: CircuitCategory;
  latitude: number;
  longitude: number;
  country?: string | null;
  thumbnailPath?: string | null;
  sourceUri?: string;
  takenAt?: number | null;
}): Promise<{ data: POIItem | null; error: Error | null }> {
  // If no thumbnail path but we have a source URI, compress and upload
  let thumbPath = params.thumbnailPath ?? null;
  if (!thumbPath && params.sourceUri) {
    thumbPath = await uploadPOIThumbnail(params.userId, params.sourceUri);
  }

  const { data, error } = await supabase
    .from('poi_items')
    .insert({
      user_id: params.userId,
      photo_pin_id: params.photoPinId ?? null,
      taken_at: params.takenAt ? new Date(params.takenAt).toISOString() : null,
      title: params.title,
      type: params.type,
      latitude: params.latitude,
      longitude: params.longitude,
      country: params.country ?? null,
      thumbnail_path: thumbPath,
    })
    .select()
    .single();

  if (error) return { data: null, error: error as unknown as Error };
  return { data: data as POIItem, error: null };
}

/**
 * Fetch all POI items for a user, with signed thumbnail URLs.
 * Retries once after 1.5 s on transient network failures.
 */
export async function fetchPOIs(userId: string, _retry = true): Promise<POIItem[]> {
  let data: any[] | null = null;
  let error: any = null;
  try {
    const result = await supabase
      .from('poi_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    data = result.data;
    error = result.error;
  } catch (err: any) {
    if (_retry) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchPOIs(userId, false);
    }
    console.error('[POI] Network error:', err?.message ?? err);
    return [];
  }

  if (error || !data) {
    if (_retry && error?.message?.includes('Network')) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchPOIs(userId, false);
    }
    console.error('[POI] Fetch error:', error?.message);
    return [];
  }

  // Batch-sign all thumbnail paths in a single Storage API call
  const paths = data.filter((r: any) => r.thumbnail_path).map((r: any) => r.thumbnail_path as string);
  const signedMap: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('user-photo-pins')
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (signed) {
      for (const s of signed) {
        if (s.signedUrl && s.path) signedMap[s.path] = s.signedUrl;
      }
    }
  }

  const items: POIItem[] = data.map((row: any) => ({
    ...row,
    thumbnailUrl: row.thumbnail_path ? signedMap[row.thumbnail_path] : undefined,
  } as POIItem));

  // Persist to cache
  try {
    const entry: PoisCache = { ts: Date.now(), items };
    await AsyncStorage.setItem(MY_POIS_CACHE(userId), JSON.stringify(entry));
  } catch {}

  return items;
}

/**
 * Return cached user POIs immediately (for instant UI), then the caller can
 * trigger fetchPOIs() in the background for a fresh copy.
 */
export async function getCachedPOIs(userId: string): Promise<POIItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(MY_POIS_CACHE(userId));
    if (!raw) return null;
    const cache: PoisCache = JSON.parse(raw);
    return cache.items;
  } catch {
    return null;
  }
}

/**
 * True if the user POI cache is older than CACHE_TTL_MS (needs background refresh).
 */
export async function isUserPOICacheStale(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(MY_POIS_CACHE(userId));
    if (!raw) return true;
    const cache: PoisCache = JSON.parse(raw);
    return Date.now() - cache.ts > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

/**
 * Fetch all published POIs from all users (community feed).
 */
export async function fetchPublishedPOIs(): Promise<POIItem[]> {
  const { data, error } = await supabase
    .from('poi_items')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[POI] Community fetch error:', error?.message);
    return [];
  }

  // Collect fallback photos for items without a thumbnail_path
  const idsWithoutThumb = data.filter((r) => !r.thumbnail_path).map((r) => r.id);
  const firstPhotoPathByPoiId: Record<string, string> = {};
  if (idsWithoutThumb.length > 0) {
    const { data: photos } = await supabase
      .from('poi_photos')
      .select('poi_id, storage_path')
      .in('poi_id', idsWithoutThumb)
      .order('created_at', { ascending: true });
    if (photos) {
      for (const p of photos) {
        if (!firstPhotoPathByPoiId[p.poi_id]) {
          firstPhotoPathByPoiId[p.poi_id] = p.storage_path;
        }
      }
    }
  }

  // Batch-sign all storage paths in one call (storage SELECT policy allows cross-user access now)
  const allPaths = [
    ...data.filter((r) => r.thumbnail_path).map((r) => r.thumbnail_path as string),
    ...Object.values(firstPhotoPathByPoiId),
  ];
  const signedMap: Record<string, string> = {};
  if (allPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(allPaths, SIGNED_URL_TTL);
    if (signed) {
      for (const s of signed) {
        if (s.signedUrl && s.path) signedMap[s.path] = s.signedUrl;
      }
    }
  }

  // Try to fetch author display names from profiles table (graceful fallback)
  const userIds = [...new Set(data.map((r) => r.user_id))];
  const authorMap: Record<string, string> = {};
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds);
    if (profiles) {
      for (const p of profiles) {
        authorMap[p.id] = p.full_name || p.username || `User·${String(p.id).slice(0, 6)}`;
      }
    }
  } catch {
    // profiles table may not exist yet — silent fallback
  }

  const items = data.map((row) => ({
    ...row,
    thumbnailUrl: row.thumbnail_path
      ? signedMap[row.thumbnail_path]
      : signedMap[firstPhotoPathByPoiId[row.id] ?? ''],
    author_name: authorMap[row.user_id] ?? 'Traveller',
  } as POIItem));

  // Persist to community cache
  try {
    const entry: PoisCache = { ts: Date.now(), items };
    await AsyncStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(entry));
  } catch {}

  return items;
}

/**
 * Return cached community POIs immediately for instant UI.
 */
export async function getCachedPublishedPOIs(): Promise<POIItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_CACHE_KEY);
    if (!raw) return null;
    const cache: PoisCache = JSON.parse(raw);
    return cache.items;
  } catch {
    return null;
  }
}

export async function isCommunityPOICacheStale(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_CACHE_KEY);
    if (!raw) return true;
    const cache: PoisCache = JSON.parse(raw);
    return Date.now() - cache.ts > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

/**
 * Toggle the published state of a POI.
 */
export async function publishPOI(
  poiId: string,
  publish: boolean,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('poi_items')
    .update({ is_published: publish })
    .eq('id', poiId);
  if (error) return { error: error as unknown as Error };
  return { error: null };
}

/**
 * Update a POI item (title, type, or both).
 */
export async function updatePOI(
  poiId: string,
  updates: { title?: string; type?: CircuitCategory; notes?: string | null; address?: string | null; thumbnail_path?: string | null },
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('poi_items')
    .update(updates)
    .eq('id', poiId);
  if (error) return { error: error as unknown as Error };
  return { error: null };
}

/**
 * Upload an extra photo for a POI and return the storage path.
 */
export async function uploadPOIPhoto(
  userId: string,
  poiId: string,
  sourceUri: string,
): Promise<{ path: string | null; url: string | null; error: Error | null }> {
  try {
    const result = await manipulateAsync(
      sourceUri,
      [{ resize: { width: 800 } }],
      { compress: 0.8, format: SaveFormat.JPEG },
    );
    const storagePath = `${userId}/poi_${poiId}_${Date.now()}.jpg`;
    const response = await fetch(result.uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) return { path: null, url: null, error: error as unknown as Error };

    // Insert into poi_photos table
    await supabase.from('poi_photos').insert({
      poi_id: poiId,
      storage_path: storagePath,
    });

    const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
    return { path: storagePath, url: urlData?.signedUrl ?? null, error: null };
  } catch (err) {
    return { path: null, url: null, error: err as Error };
  }
}

/**
 * Fetch extra photos for a POI (signed URLs).
 */
export async function fetchPOIPhotos(poiId: string): Promise<string[]> {
  const result = await fetchPOIPhotosWithPaths(poiId);
  return result.map((r) => r.url);
}

/**
 * Fetch extra photos for a POI with both signed URL and storage path.
 */
export async function fetchPOIPhotosWithPaths(
  poiId: string,
): Promise<{ url: string; path: string }[]> {
  const { data, error } = await supabase
    .from('poi_photos')
    .select('storage_path')
    .eq('poi_id', poiId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  const paths = data.map((r) => r.storage_path as string);
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 3600);

  if (!signed) return [];
  const results: { url: string; path: string }[] = [];
  for (const s of signed) {
    if (s.signedUrl && s.path) results.push({ url: s.signedUrl, path: s.path });
  }
  return results;
}

/**
 * Fetch a single POI by ID with signed thumbnail URL.
 */
export async function fetchPOI(poiId: string): Promise<POIItem | null> {
  const { data, error } = await supabase
    .from('poi_items')
    .select('*')
    .eq('id', poiId)
    .single();

  if (error || !data) return null;

  let thumbnailUrl: string | undefined;
  if (data.thumbnail_path) {
    const { data: urlData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.thumbnail_path, 3600);
    thumbnailUrl = urlData?.signedUrl ?? undefined;
  }

  return { ...data, thumbnailUrl } as POIItem;
}

/**
 * Delete a POI item.
 */
export async function deletePOI(poiId: string): Promise<void> {
  await supabase.from('poi_items').delete().eq('id', poiId);
}

/**
 * Delete an extra photo from storage and the poi_photos table.
 * Pass isCover=true to instead clear the thumbnail_path on the POI.
 */
export async function deletePOIPhoto(
  storagePath: string,
  poiId: string,
  isCover: boolean,
): Promise<{ error: Error | null }> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  if (isCover) {
    const { error } = await supabase
      .from('poi_items')
      .update({ thumbnail_path: null })
      .eq('id', poiId);
    return { error: error as Error | null };
  }
  const { error } = await supabase
    .from('poi_photos')
    .delete()
    .eq('storage_path', storagePath);
  return { error: error as Error | null };
}
