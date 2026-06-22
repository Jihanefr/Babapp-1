import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripNote {
  id: string;
  trip_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch all notes for a trip, newest first.
 */
export async function fetchTripNotes(tripId: string): Promise<TripNote[]> {
  const { data, error } = await supabase
    .from('trip_notes')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[TripNotes] Fetch error:', error?.message);
    return [];
  }
  return data as TripNote[];
}

/**
 * Add a new note to a trip.
 */
export async function addTripNote(params: {
  trip_id: string;
  user_id: string;
  content: string;
}): Promise<{ data: TripNote | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('trip_notes')
    .insert({
      trip_id: params.trip_id,
      user_id: params.user_id,
      content: params.content.trim(),
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error as unknown as Error };
  }
  return { data: data as TripNote, error: null };
}

/**
 * Delete a note by id.
 */
export async function removeTripNote(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('trip_notes')
    .delete()
    .eq('id', id);

  return { error: error as Error | null };
}
