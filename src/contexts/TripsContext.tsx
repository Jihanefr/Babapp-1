import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

/**
 * Standalone paginated trips fetch — used by the trips list screen.
 * Does NOT touch the TripsContext state.
 */
export async function fetchTripsPaged(
  userId: string,
  cursor: string | null,
  limit = 20,
): Promise<{ items: Trip[]; nextCursor: string | null; hasMore: boolean }> {
  let query = supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error || !data) return { items: [], nextCursor: null, hasMore: false };

  const hasMore = data.length > limit;
  const items = (hasMore ? data.slice(0, limit) : data) as Trip[];
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;
  return { items, nextCursor, hasMore };
}

const TRIPS_CACHE_KEY = (uid: string) => `@trips_${uid}`;
const TRIPS_CACHE_TTL_MS = 5 * 60 * 1000;

export type TripType = 'planning' | 'sharing';

export interface Trip {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  photo_urls: string[];
  budget: string | null;
  trip_type: TripType;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const MAX_TRIP_PHOTOS = 10;

interface TripsContextType {
  trips: Trip[];
  loading: boolean;
  fetchTrips: (force?: boolean) => Promise<void>;
  createTrip: (trip: Omit<Trip, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<{ data: Trip | null; error: Error | null }>;
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<{ error: Error | null }>;
  deleteTrip: (id: string) => Promise<{ error: Error | null }>;
  uploadTripImage: (tripId: string, uri: string) => Promise<{ url: string | null; error: Error | null }>;
  uploadTripPhotos: (tripId: string, uris: string[]) => Promise<{ urls: string[]; error: Error | null }>;
  removeTripPhoto: (tripId: string, urlToRemove: string) => Promise<{ error: Error | null }>;
}

const TripsContext = createContext<TripsContextType | undefined>(undefined);

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const hasDataRef = useRef(false);
  const lastFetchRef = useRef(0);

  const fetchTrips = useCallback(async (force = false) => {
    if (!user) return;
    const now = Date.now();
    if (!force && lastFetchRef.current > 0 && now - lastFetchRef.current < TRIPS_CACHE_TTL_MS) return;

    // Show cache immediately on first load
    if (!hasDataRef.current) {
      try {
        const raw = await AsyncStorage.getItem(TRIPS_CACHE_KEY(user.id));
        if (raw) {
          const cached: Trip[] = JSON.parse(raw);
          if (cached.length > 0) {
            setTrips(cached);
            hasDataRef.current = true;
          }
        }
      } catch {}
    }

    if (!hasDataRef.current) setLoading(true);
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data && !error) {
      setTrips(data);
      hasDataRef.current = true;
      lastFetchRef.current = Date.now();
      try { await AsyncStorage.setItem(TRIPS_CACHE_KEY(user.id), JSON.stringify(data)); } catch {}
    }
    setLoading(false);
  }, [user]);

  const createTrip = async (trip: Omit<Trip, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return { data: null, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('trips')
      .insert({
        ...trip,
        user_id: user.id,
      })
      .select()
      .single();

    if (!error && data) {
      setTrips((prev) => [data, ...prev]);
    }
    return { data: data ?? null, error: error as Error | null };
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    const { error } = await supabase
      .from('trips')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      await fetchTrips();
    }
    return { error: error as Error | null };
  };

  const deleteTrip = async (id: string) => {
    const { error } = await supabase.from('trips').delete().eq('id', id);

    if (!error) {
      setTrips((prev) => prev.filter((t) => t.id !== id));
    }
    return { error: error as Error | null };
  };

  const uploadTripPhotos = async (tripId: string, uris: string[]) => {
    if (!user) return { urls: [], error: new Error('Not authenticated') };
    const currentTrip = trips.find((t) => t.id === tripId);
    const existingUrls = currentTrip?.photo_urls ?? [];
    const remainingSlots = MAX_TRIP_PHOTOS - existingUrls.length;
    if (remainingSlots <= 0) return { urls: [], error: null };
    const urisToUpload = uris.slice(0, remainingSlots);
    const urls: string[] = [];
    for (const uri of urisToUpload) {
      try {
        const compressed = await manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.85, format: SaveFormat.JPEG },
        );
        const fileName = `${tripId}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const filePath = `${user.id}/${fileName}`;
        const response = await fetch(compressed.uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('trip-images')
          .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
        if (!uploadError) {
          const { data } = supabase.storage.from('trip-images').getPublicUrl(filePath);
          urls.push(data.publicUrl);
        }
      } catch {
        // skip failed photo silently
      }
    }
    if (urls.length > 0) {
      const newPhotoUrls = [...existingUrls, ...urls];
      const updates: Partial<Trip> = { photo_urls: newPhotoUrls };
      if (!currentTrip?.cover_image_url) {
        updates.cover_image_url = newPhotoUrls[0];
      }
      await updateTrip(tripId, updates);
    }
    return { urls, error: null };
  };

  const removeTripPhoto = async (tripId: string, urlToRemove: string) => {
    const currentTrip = trips.find((t) => t.id === tripId);
    if (!currentTrip) return { error: new Error('Trip not found') };
    const newUrls = currentTrip.photo_urls.filter((u) => u !== urlToRemove);
    const updates: Partial<Trip> = { photo_urls: newUrls };
    if (currentTrip.cover_image_url === urlToRemove) {
      updates.cover_image_url = newUrls[0] ?? null;
    }
    return updateTrip(tripId, updates);
  };

  const uploadTripImage = async (tripId: string, uri: string) => {
    if (!user) return { url: null, error: new Error('Not authenticated') };

    try {
      const fileExt = uri.split('.').pop() ?? 'jpg';
      const fileName = `${tripId}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('trip-images')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        return { url: null, error: uploadError as unknown as Error };
      }

      const { data } = supabase.storage.from('trip-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      await updateTrip(tripId, { cover_image_url: imageUrl });
      return { url: imageUrl, error: null };
    } catch (err) {
      return { url: null, error: err as Error };
    }
  };

  useEffect(() => {
    if (user) {
      fetchTrips();
    } else {
      setTrips([]);
    }
  }, [user, fetchTrips]);

  return (
    <TripsContext.Provider
      value={{ trips, loading, fetchTrips, createTrip, updateTrip, deleteTrip, uploadTripImage, uploadTripPhotos, removeTripPhoto }}
    >
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const context = useContext(TripsContext);
  if (context === undefined) {
    throw new Error('useTrips must be used within a TripsProvider');
  }
  return context;
}
