import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripRating {
  id: string;
  trip_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  /** Populated via profile join */
  author_name?: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch all ratings for a trip, newest first, with author names.
 */
export async function fetchTripRatings(tripId: string): Promise<TripRating[]> {
  const { data, error } = await supabase
    .from('trip_ratings')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[TripRatings] Fetch error:', error?.message);
    return [];
  }

  // Fetch author names from profiles
  const userIds = [...new Set(data.map((r) => r.user_id))];
  const authorMap: Record<string, string> = {};
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds);
    if (profiles) {
      for (const p of profiles) {
        authorMap[p.id] = p.full_name || p.username || 'Traveller';
      }
    }
  } catch {
    // graceful fallback
  }

  return data.map((r) => ({
    ...r,
    author_name: authorMap[r.user_id] ?? 'Traveller',
  } as TripRating));
}

/**
 * Fetch the current user's rating for a trip (null if not rated yet).
 */
export async function fetchUserRating(tripId: string, userId: string): Promise<TripRating | null> {
  const { data, error } = await supabase
    .from('trip_ratings')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as TripRating;
}

/**
 * Submit or update a rating (upsert by trip_id + user_id).
 */
export async function submitTripRating(params: {
  trip_id: string;
  user_id: string;
  rating: number;
  comment?: string | null;
}): Promise<{ data: TripRating | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('trip_ratings')
    .upsert(
      {
        trip_id: params.trip_id,
        user_id: params.user_id,
        rating: params.rating,
        comment: params.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trip_id,user_id' },
    )
    .select()
    .single();

  if (error) return { data: null, error: error as unknown as Error };
  return { data: data as TripRating, error: null };
}

/**
 * Delete the current user's rating.
 */
export async function removeTripRating(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('trip_ratings')
    .delete()
    .eq('id', id);
  return { error: error as Error | null };
}

/**
 * Compute average rating and count from a list of ratings.
 */
export function computeRatingSummary(ratings: TripRating[]): { average: number; count: number } {
  if (ratings.length === 0) return { average: 0, count: 0 };
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  return { average: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}
