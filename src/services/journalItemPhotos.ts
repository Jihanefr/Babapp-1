import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

const BUCKET = 'user-photo-pins';
const THUMB_SIZE = 600;
const THUMB_QUALITY = 0.7;

export interface JournalItemPhoto {
  id: string;
  journal_item_id: string;
  photo_pin_id: string | null;
  storage_path: string | null;
  sort_order: number;
  created_at: string;
  /** Signed URL populated after fetch */
  signedUrl?: string;
}

/**
 * Fetch all linked photos for a journal item (poi_items row), with signed URLs.
 */
export async function fetchJournalItemPhotos(journalItemId: string): Promise<JournalItemPhoto[]> {
  const { data, error } = await supabase
    .from('journal_item_photos')
    .select('*')
    .eq('journal_item_id', journalItemId)
    .order('sort_order', { ascending: true });

  if (error || !data) {
    console.error('[JIP] Fetch error:', error?.message);
    return [];
  }

  const paths = (data as JournalItemPhoto[])
    .map((r) => r.storage_path)
    .filter(Boolean) as string[];

  if (paths.length === 0) return data as JournalItemPhoto[];

  const { data: signedUrls } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 3600);

  return (data as JournalItemPhoto[]).map((row, i) => ({
    ...row,
    signedUrl: signedUrls?.[i]?.signedUrl ?? undefined,
  }));
}

/**
 * Link an existing photo pin to a journal item.
 */
export async function linkPhotoPinToJournalItem(
  journalItemId: string,
  photoPinId: string,
  storagePath: string,
  sortOrder = 0,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('journal_item_photos').insert({
    journal_item_id: journalItemId,
    photo_pin_id: photoPinId,
    storage_path: storagePath,
    sort_order: sortOrder,
  });
  return { error: error as unknown as Error | null };
}

/**
 * Upload a new photo from device URI and link it to a journal item.
 */
export async function uploadAndLinkPhoto(
  userId: string,
  journalItemId: string,
  uri: string,
  sortOrder = 0,
): Promise<{ error: Error | null }> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: THUMB_SIZE } }],
      { compress: THUMB_QUALITY, format: SaveFormat.JPEG },
    );

    const storagePath = `${userId}/jip_${journalItemId}_${Date.now()}.jpg`;
    const response = await fetch(result.uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) return { error: uploadError as unknown as Error };

    const { error: insertError } = await supabase.from('journal_item_photos').insert({
      journal_item_id: journalItemId,
      photo_pin_id: null,
      storage_path: storagePath,
      sort_order: sortOrder,
    });

    return { error: insertError as unknown as Error | null };
  } catch (err) {
    return { error: err as Error };
  }
}

/**
 * Remove a linked photo (and delete from storage if owned by this user).
 */
export async function deleteJournalItemPhoto(photo: JournalItemPhoto): Promise<void> {
  if (photo.storage_path) {
    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
  }
  await supabase.from('journal_item_photos').delete().eq('id', photo.id);
}
