import { supabase } from '../lib/supabase';

export type TripItemCategory = 'see' | 'eat' | 'stay' | 'do';
export type TripItemSourceType = 'journal' | 'community';

export interface TripItem {
  id: string;
  trip_id: string;
  added_by_user_id: string;
  source_type: TripItemSourceType;
  source_item_id: string;
  category: TripItemCategory;
  notes: string | null;
  created_at: string;
}

/**
 * Fetch all items for a trip.
 */
export async function fetchTripItems(tripId: string): Promise<TripItem[]> {
  const { data, error } = await supabase
    .from('trip_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.error('[TripItems] Fetch error:', error?.message);
    return [];
  }
  return data as TripItem[];
}

/**
 * Add an item to a trip. Returns null if already added (duplicate).
 */
export async function addTripItem(params: {
  tripId: string;
  userId: string;
  sourceType: TripItemSourceType;
  sourceItemId: string;
  category: TripItemCategory;
  notes?: string;
}): Promise<{ data: TripItem | null; error: Error | null; duplicate: boolean }> {
  const { data, error } = await supabase
    .from('trip_items')
    .insert({
      trip_id: params.tripId,
      added_by_user_id: params.userId,
      source_type: params.sourceType,
      source_item_id: params.sourceItemId,
      category: params.category,
      notes: params.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    const isDuplicate = error.code === '23505';
    return { data: null, error: isDuplicate ? null : (error as unknown as Error), duplicate: isDuplicate };
  }
  return { data: data as TripItem, error: null, duplicate: false };
}

/**
 * Remove an item from a trip.
 */
export async function removeTripItem(tripItemId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('trip_items').delete().eq('id', tripItemId);
  if (error) return { error: error as unknown as Error };
  return { error: null };
}

/**
 * Count how many items a trip has.
 */
export async function countTripItems(tripId: string): Promise<number> {
  const { count, error } = await supabase
    .from('trip_items')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId);
  if (error) return 0;
  return count ?? 0;
}
