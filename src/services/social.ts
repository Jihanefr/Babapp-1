import { supabase } from '../lib/supabase';

export interface Comment {
  id: string;
  poi_id: string;
  user_id: string;
  content: string;
  author_name: string | null;
  created_at: string;
}

export interface SocialCounts {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

/**
 * Batch-fetch like counts, comment counts, and whether the current user
 * has liked each POI — all in three parallel queries.
 */
export async function fetchSocialCounts(
  poiIds: string[],
  userId: string,
): Promise<Record<string, SocialCounts>> {
  if (poiIds.length === 0) return {};

  const [likesRes, commentsRes, myLikesRes] = await Promise.all([
    supabase.from('poi_likes').select('poi_id').in('poi_id', poiIds),
    supabase.from('poi_comments').select('poi_id').in('poi_id', poiIds),
    supabase.from('poi_likes').select('poi_id').in('poi_id', poiIds).eq('user_id', userId),
  ]);

  const counts: Record<string, SocialCounts> = {};
  for (const id of poiIds) {
    counts[id] = { likeCount: 0, commentCount: 0, likedByMe: false };
  }

  for (const r of likesRes.data ?? []) {
    if (counts[r.poi_id]) counts[r.poi_id].likeCount++;
  }
  for (const r of commentsRes.data ?? []) {
    if (counts[r.poi_id]) counts[r.poi_id].commentCount++;
  }
  for (const r of myLikesRes.data ?? []) {
    if (counts[r.poi_id]) counts[r.poi_id].likedByMe = true;
  }

  return counts;
}

/**
 * Toggle a like on a POI (optimistic: pass current `likedByMe` state).
 */
export async function toggleLike(
  poiId: string,
  userId: string,
  currentlyLiked: boolean,
): Promise<void> {
  if (currentlyLiked) {
    await supabase.from('poi_likes').delete().eq('poi_id', poiId).eq('user_id', userId);
  } else {
    await supabase.from('poi_likes').insert({ poi_id: poiId, user_id: userId });
  }
}

/**
 * Fetch all comments for a POI, oldest first.
 */
export async function fetchComments(poiId: string): Promise<Comment[]> {
  const { data } = await supabase
    .from('poi_comments')
    .select('*')
    .eq('poi_id', poiId)
    .order('created_at', { ascending: true });
  return (data ?? []) as Comment[];
}

/**
 * Add a comment. Returns the new comment row or null on failure.
 */
export async function addComment(
  poiId: string,
  userId: string,
  content: string,
  authorName: string,
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('poi_comments')
    .insert({ poi_id: poiId, user_id: userId, content: content.trim(), author_name: authorName })
    .select()
    .single();
  if (error) return null;
  return data as Comment;
}

/**
 * Delete a comment by ID (owner only — enforced by RLS).
 */
export async function deleteComment(commentId: string): Promise<void> {
  await supabase.from('poi_comments').delete().eq('id', commentId);
}
