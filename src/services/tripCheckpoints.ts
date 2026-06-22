import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckpointSource = 'manual' | 'auto';

export interface TripCheckpoint {
  id: string;
  trip_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  label: string | null;
  source: CheckpointSource;
  recorded_at: string;
  created_at: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch all checkpoints for a trip, ordered by recorded time.
 */
export async function fetchTripCheckpoints(tripId: string): Promise<TripCheckpoint[]> {
  const { data, error } = await supabase
    .from('trip_checkpoints')
    .select('*')
    .eq('trip_id', tripId)
    .order('recorded_at', { ascending: true });

  if (error || !data) {
    console.error('[TripCheckpoints] Fetch error:', error?.message);
    return [];
  }
  return data as TripCheckpoint[];
}

/**
 * Add a new checkpoint for a trip.
 */
export async function addTripCheckpoint(params: {
  trip_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  label?: string | null;
  source?: CheckpointSource;
  recorded_at?: string;
}): Promise<{ data: TripCheckpoint | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('trip_checkpoints')
    .insert({
      trip_id: params.trip_id,
      user_id: params.user_id,
      latitude: params.latitude,
      longitude: params.longitude,
      label: params.label ?? null,
      source: params.source ?? 'manual',
      recorded_at: params.recorded_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error as unknown as Error };
  }
  return { data: data as TripCheckpoint, error: null };
}

/**
 * Remove a checkpoint by id.
 */
export async function removeTripCheckpoint(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('trip_checkpoints')
    .delete()
    .eq('id', id);

  return { error: error as Error | null };
}
