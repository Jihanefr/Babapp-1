import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanningItemType =
  | 'flight'
  | 'accommodation'
  | 'activity'
  | 'transport'
  | 'other';

/**
 * Flexible metadata stored as JSON per item type.
 * flight:        { airline, flight_number, from_airport, to_airport }
 * accommodation: { address, check_in, check_out, booking_ref }
 * activity:      { duration_minutes, booking_ref }
 * transport:     { mode, from_location, to_location }
 * other:         any key-value pairs
 */
export type PlanningItemMeta = Record<string, string | number | boolean | null>;

export interface TripPlanningItem {
  id: string;
  trip_id: string;
  user_id: string;
  item_type: PlanningItemType;
  title: string;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  start_datetime: string | null;
  end_datetime: string | null;
  sort_order: number;
  metadata: PlanningItemMeta;
  created_at: string;
  updated_at: string;
}

export type NewTripPlanningItem = Pick<
  TripPlanningItem,
  | 'trip_id'
  | 'user_id'
  | 'item_type'
  | 'title'
> &
  Partial<
    Pick<
      TripPlanningItem,
      | 'description'
      | 'location'
      | 'latitude'
      | 'longitude'
      | 'start_datetime'
      | 'end_datetime'
      | 'sort_order'
      | 'metadata'
    >
  >;

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetch all planning items for a trip, ordered by sort_order then created_at.
 */
export async function fetchTripPlanningItems(
  tripId: string,
): Promise<TripPlanningItem[]> {
  const { data, error } = await supabase
    .from('trip_planning_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.error('[TripPlanningItems] Fetch error:', error?.message);
    return [];
  }
  return data as TripPlanningItem[];
}

/**
 * Add a new planning item to a trip.
 */
export async function addTripPlanningItem(
  item: NewTripPlanningItem,
): Promise<{ data: TripPlanningItem | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('trip_planning_items')
    .insert({
      trip_id: item.trip_id,
      user_id: item.user_id,
      item_type: item.item_type,
      title: item.title,
      description: item.description ?? null,
      location: item.location ?? null,
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      start_datetime: item.start_datetime ?? null,
      end_datetime: item.end_datetime ?? null,
      sort_order: item.sort_order ?? 0,
      metadata: item.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error as unknown as Error };
  }
  return { data: data as TripPlanningItem, error: null };
}

/**
 * Update an existing planning item.
 */
export async function updateTripPlanningItem(
  id: string,
  updates: Partial<
    Pick<
      TripPlanningItem,
      | 'title'
      | 'description'
      | 'location'
      | 'latitude'
      | 'longitude'
      | 'start_datetime'
      | 'end_datetime'
      | 'sort_order'
      | 'metadata'
    >
  >,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('trip_planning_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { error: error as Error | null };
}

/**
 * Remove a planning item by id.
 */
export async function removeTripPlanningItem(
  id: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('trip_planning_items')
    .delete()
    .eq('id', id);

  return { error: error as Error | null };
}
