import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts';
import {
  fetchPhotoPins,
  persistPhotoPins,
  type PhotoPin,
} from '../services/photoPins';
import type { GeoPhoto } from './usePhotoScanner';

interface PhotoPinsState {
  /** Saved pins from Supabase, mapped to GeoPhoto shape for rendering */
  savedPhotos: GeoPhoto[];
  /** Raw pin rows from Supabase */
  pins: PhotoPin[];
  loading: boolean;
  persisting: boolean;
  persistProgress: number;
  persistTotal: number;
}

export function usePhotoPins() {
  const { user } = useAuth();
  const [state, setState] = useState<PhotoPinsState>({
    savedPhotos: [],
    pins: [],
    loading: false,
    persisting: false,
    persistProgress: 0,
    persistTotal: 0,
  });

  /** Fetch saved pins from Supabase and convert to GeoPhoto[] for the map */
  const load = useCallback(async () => {
    if (!user) return;

    setState((s) => ({ ...s, loading: true }));

    try {
      const pins = await fetchPhotoPins(user.id);

      const geoPhotos: GeoPhoto[] = pins
        .filter((p) => p.thumbnailUrl)
        .map((p) => ({
          id: `pin_${p.id}`,
          uri: p.thumbnailUrl!,
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          creationTime: new Date(p.taken_at).getTime(),
          year: new Date(p.taken_at).getFullYear(),
          country: p.country ?? undefined,
        }));

      setState((s) => ({
        ...s,
        savedPhotos: geoPhotos,
        pins,
        loading: false,
      }));
    } catch (err) {
      console.error('[usePhotoPins] Load error:', err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, [user]);

  /** Persist scanned GeoPhotos to Supabase (compress + upload + insert) */
  const persist = useCallback(
    async (photos: GeoPhoto[]) => {
      if (!user || photos.length === 0) return;

      setState((s) => ({
        ...s,
        persisting: true,
        persistProgress: 0,
        persistTotal: photos.length,
      }));

      try {
        await persistPhotoPins(user.id, photos, (done, total) => {
          setState((s) => ({ ...s, persistProgress: done, persistTotal: total }));
        });

        // Reload from Supabase to get signed URLs
        await load();
      } catch (err) {
        console.error('[usePhotoPins] Persist error:', err);
      }

      setState((s) => ({ ...s, persisting: false }));
    },
    [user, load],
  );

  // Auto-load when user logs in
  useEffect(() => {
    if (user) {
      load();
    } else {
      setState({
        savedPhotos: [],
        pins: [],
        loading: false,
        persisting: false,
        persistProgress: 0,
        persistTotal: 0,
      });
    }
  }, [user, load]);

  return { ...state, load, persist };
}
