import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';
import {
  CATEGORY_CONFIG,
  type CircuitCategory,
} from '../../src/lib/circuitCategories';
import { fetchPublishedPOIsPaged, type POIItem } from '../../src/services/poiItems';
import { usePaginated } from '../../src/hooks/usePaginated';
import {
  fetchSocialCounts,
  toggleLike,
  fetchComments,
  addComment,
  deleteComment,
  type Comment,
  type SocialCounts,
} from '../../src/services/social';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/contexts';
import { getOrCreateConversation } from '../../src/services/chat';
import { TripPickerModal } from '../../src/components';

interface PublicTrip {
  id: string;
  user_id: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

type FilterOption = 'all' | CircuitCategory;

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'All' },
  ...(['see', 'stay', 'eat', 'do'] as CircuitCategory[]).map((key) => ({
    key,
    label: CATEGORY_CONFIG[key].label,
  })),
];

export default function CommunityScreen() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<'places' | 'trips'>('places');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [filterCountry, setFilterCountry] = useState<string | null>(null);
  const [tripRatingSummaries, setTripRatingSummaries] = useState<Record<string, { average: number; count: number }>>({});

  // Social
  const [socialCounts, setSocialCounts] = useState<Record<string, SocialCounts>>({});
  const [commentsPoiId, setCommentsPoiId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const commentInputRef = useRef<TextInput>(null);
  // Trip picker
  const [tripPickerPoi, setTripPickerPoi] = useState<POIItem | null>(null);
  const [contactingUserId, setContactingUserId] = useState<string | null>(null);

  const poiFetcher = useCallback(
    (cursor: string | null, limit: number) => fetchPublishedPOIsPaged(cursor, limit),
    [],
  );

  const {
    items,
    loading,
    refreshing,
    loadNext: loadMorePOIs,
    refresh: refreshPOIs,
  } = usePaginated<POIItem>(poiFetcher, 20);

  // Fetch social counts whenever new items are loaded
  const prevItemsLenRef = useRef(0);
  useEffect(() => {
    if (!user || items.length === 0) return;
    if (items.length === prevItemsLenRef.current) return;
    const newIds = items.slice(prevItemsLenRef.current).map((p) => p.id);
    prevItemsLenRef.current = items.length;
    fetchSocialCounts(newIds, user.id)
      .then((counts) => setSocialCounts((prev) => ({ ...prev, ...counts })))
      .catch(() => {});
  }, [items, user]);

  const handleContactTraveler = async (otherUserId: string) => {
    if (!user || user.id === otherUserId) return;
    setContactingUserId(otherUserId);
    const convId = await getOrCreateConversation(user.id, otherUserId);
    setContactingUserId(null);
    if (convId) {
      router.push(`/chat/${convId}?otherUserId=${otherUserId}` as any);
    } else {
      Alert.alert('Error', 'Could not open conversation. Please try again.');
    }
  };

  const tripFetcher = useCallback(async (cursor: string | null, limit: number) => {
    let query = supabase
      .from('trips')
      .select('*')
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt('updated_at', cursor);
    const { data } = await query;
    if (!data) return { items: [] as PublicTrip[], nextCursor: null, hasMore: false };
    const hasMore = data.length > limit;
    const trips = (hasMore ? data.slice(0, limit) : data) as PublicTrip[];
    const nextCursor = hasMore ? trips[trips.length - 1].updated_at : null;
    // Fetch ratings for this page
    if (trips.length > 0) {
      const ids = trips.map((t) => t.id);
      const { data: ratingsData } = await supabase
        .from('trip_ratings').select('trip_id, rating').in('trip_id', ids);
      if (ratingsData) {
        const summaryMap: Record<string, { average: number; count: number }> = {};
        for (const id of ids) {
          const r = (ratingsData as { trip_id: string; rating: number }[]).filter((r) => r.trip_id === id);
          summaryMap[id] = r.length > 0
            ? { average: Math.round(r.reduce((s, x) => s + x.rating, 0) / r.length * 10) / 10, count: r.length }
            : { average: 0, count: 0 };
        }
        setTripRatingSummaries((prev) => ({ ...prev, ...summaryMap }));
      }
    }
    return { items: trips, nextCursor, hasMore };
  }, []);

  const {
    items: publicTrips,
    loading: loadingTrips,
    refreshing: refreshingTrips,
    loadNext: loadMoreTrips,
    refresh: refreshTrips,
  } = usePaginated<PublicTrip>(tripFetcher, 20);

  useEffect(() => {
    refreshPOIs();
    refreshTrips();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    prevItemsLenRef.current = 0;
    setSocialCounts({});
    setTripRatingSummaries({});
    await Promise.all([refreshPOIs(), refreshTrips()]);
  };

  const handleToggleLike = useCallback(async (poiId: string) => {
    if (!user) return;
    const current = socialCounts[poiId] ?? { likeCount: 0, commentCount: 0, likedByMe: false };
    // Optimistic update
    setSocialCounts((prev) => ({
      ...prev,
      [poiId]: {
        ...current,
        likedByMe: !current.likedByMe,
        likeCount: current.likedByMe ? current.likeCount - 1 : current.likeCount + 1,
      },
    }));
    await toggleLike(poiId, user.id, current.likedByMe);
  }, [user, socialCounts]);

  const openComments = useCallback(async (poiId: string) => {
    setCommentsPoiId(poiId);
    setLoadingComments(true);
    const data = await fetchComments(poiId);
    setComments(data);
    setLoadingComments(false);
  }, []);

  const handleAddComment = useCallback(async () => {
    if (!user || !commentsPoiId || !commentText.trim()) return;
    setSubmitting(true);
    const authorName = user.email?.split('@')[0] ?? 'Traveller';
    const newComment = await addComment(commentsPoiId, user.id, commentText, authorName);
    if (newComment) {
      setComments((prev) => [...prev, newComment]);
      setSocialCounts((prev) => ({
        ...prev,
        [commentsPoiId]: {
          ...(prev[commentsPoiId] ?? { likeCount: 0, commentCount: 0, likedByMe: false }),
          commentCount: (prev[commentsPoiId]?.commentCount ?? 0) + 1,
        },
      }));
      setCommentText('');
    }
    setSubmitting(false);
  }, [user, commentsPoiId, commentText]);

  const handleDeleteComment = useCallback(async (comment: Comment) => {
    if (!user || comment.user_id !== user.id) return;
    Alert.alert('Delete comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteComment(comment.id);
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          if (commentsPoiId) {
            setSocialCounts((prev) => ({
              ...prev,
              [commentsPoiId]: {
                ...(prev[commentsPoiId] ?? { likeCount: 0, commentCount: 0, likedByMe: false }),
                commentCount: Math.max(0, (prev[commentsPoiId]?.commentCount ?? 1) - 1),
              },
            }));
          }
        },
      },
    ]);
  }, [user, commentsPoiId]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      const c = p.country ?? p.address?.split(',').pop()?.trim();
      if (c) set.add(c);
    }
    return ([...set] as string[]).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let result = filter === 'all' ? items : items.filter((p) => p.type === filter);
    if (filterCountry) {
      result = result.filter((p) => {
        const c = p.country ?? p.address?.split(',').pop()?.trim();
        return c === filterCountry;
      });
    }
    return result;
  }, [items, filter, filterCountry]);

  const isOwnItem = (item: POIItem) => item.user_id === user?.id;

  const renderTripCard = ({ item }: { item: PublicTrip }) => {
    const summary = tripRatingSummaries[item.id] ?? { average: 0, count: 0 };
    return (
      <Pressable
        style={styles.tripCard}
        onPress={() => router.push(`/trip/shared/${item.id}` as any)}
      >
        {item.cover_image_url ? (
          <Image source={{ uri: item.cover_image_url }} style={styles.tripCover} resizeMode="cover" />
        ) : (
          <View style={[styles.tripCover, styles.tripCoverPlaceholder]}>
            <Ionicons name="map-outline" size={28} color={Colors.textLight} />
          </View>
        )}
        <View style={styles.tripCardBody}>
          <Text style={styles.tripCardTitle} numberOfLines={1}>{item.title}</Text>
          {item.location ? (
            <View style={styles.tripCardMeta}>
              <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.tripCardLocation} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
          {item.start_date ? (
            <Text style={styles.tripCardDate}>
              {new Date(item.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
          {summary.count > 0 ? (
            <View style={styles.tripCardRating}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.tripCardRatingText}>
                {summary.average.toFixed(1)} · {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
              </Text>
            </View>
          ) : (
            <Text style={styles.tripCardNoRating}>No reviews yet</Text>
          )}
          {user && user.id !== item.user_id ? (
            <Pressable
              style={styles.contactTravelerBtn}
              onPress={(e) => { e.stopPropagation?.(); handleContactTraveler(item.user_id); }}
              disabled={contactingUserId === item.user_id}
              hitSlop={4}
            >
              {contactingUserId === item.user_id
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.primary} />}
              <Text style={styles.contactTravelerBtnText}>Contact Traveler</Text>
            </Pressable>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
      </Pressable>
    );
  };

  const renderCard = ({ item }: { item: POIItem }) => {
    const cat = CATEGORY_CONFIG[item.type];
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/poi/${item.id}?from=community`)}
      >
        <View style={[styles.categoryAccent, { backgroundColor: cat.color }]} />
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name={cat.icon as any} size={36} color={cat.color} />
          </View>
        )}

        {/* Category badge */}
        <View style={[styles.catBadge, { backgroundColor: cat.color }]}>
          <Ionicons name={cat.icon as any} size={11} color={Colors.white} />
          <Text style={styles.catBadgeText}>{cat.label.split(' ').pop()}</Text>
        </View>

        {/* Own item indicator */}
        {isOwnItem(item) && (
          <View style={styles.ownBadge}>
            <Ionicons name="person" size={10} color={Colors.white} />
            <Text style={styles.ownBadgeText}>You</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {(item.country || item.address) ? (
            <View style={styles.cardRow}>
              <Ionicons name="location-outline" size={13} color={Colors.primary} />
              <Text style={styles.cardLocation} numberOfLines={1}>
                {item.address ?? item.country}
              </Text>
            </View>
          ) : null}
          {item.taken_at ? (
            <View style={styles.cardRow}>
              <Ionicons name="calendar-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.cardAuthor}>
                {new Date(item.taken_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
          <View style={styles.cardRow}>
            <Ionicons name="person-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.cardAuthor} numberOfLines={1}>
              {isOwnItem(item) ? 'You' : (item.author_name ?? 'Traveller')}
            </Text>
          </View>
        </View>

        {/* Like / Comment bar */}
        <View style={styles.socialBar}>
          <Pressable
            style={styles.socialBtn}
            onPress={(e) => { e.stopPropagation?.(); handleToggleLike(item.id); }}
            hitSlop={8}
          >
            <Ionicons
              name={socialCounts[item.id]?.likedByMe ? 'heart' : 'heart-outline'}
              size={18}
              color={socialCounts[item.id]?.likedByMe ? '#EF4444' : Colors.textSecondary}
            />
            {(socialCounts[item.id]?.likeCount ?? 0) > 0 && (
              <Text style={[
                styles.socialCount,
                socialCounts[item.id]?.likedByMe && { color: '#EF4444' },
              ]}>
                {socialCounts[item.id]?.likeCount}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.socialBtn}
            onPress={(e) => { e.stopPropagation?.(); openComments(item.id); }}
            hitSlop={8}
          >
            <Ionicons name="chatbubble-outline" size={17} color={Colors.textSecondary} />
            {(socialCounts[item.id]?.commentCount ?? 0) > 0 && (
              <Text style={styles.socialCount}>{socialCounts[item.id]?.commentCount}</Text>
            )}
          </Pressable>

          {user && !isOwnItem(item) && (
            <Pressable
              style={[styles.socialBtn]}
              onPress={(e) => { e.stopPropagation?.(); handleContactTraveler(item.user_id); }}
              hitSlop={8}
              disabled={contactingUserId === item.user_id}
            >
              {contactingUserId === item.user_id
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Ionicons name="chatbubble-ellipses-outline" size={17} color={Colors.primary} />}
            </Pressable>
          )}
          {user && (
            <Pressable
              style={[styles.socialBtn, styles.socialBtnRight]}
              onPress={(e) => { e.stopPropagation?.(); setTripPickerPoi(item); }}
              hitSlop={8}
            >
              <Ionicons name="bookmark-outline" size={17} color={Colors.primary} />
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🌍</Text>
        <Text style={styles.emptyTitle}>No shared places yet</Text>
        <Text style={styles.emptyText}>
          Be the first to publish a place from your Journal.
        </Text>
      </View>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
        <Text style={styles.headerDesc}>
          {activeSection === 'places' ? 'Places shared by travellers' : 'Trips shared by travellers'}
        </Text>
        <Text style={styles.subtitle}>
          {activeSection === 'places'
            ? `${filtered.length} place${filtered.length !== 1 ? 's' : ''}`
            : `${publicTrips.length} trip${publicTrips.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* ── Section toggle ── */}
      <View style={styles.sectionToggle}>
        <Pressable
          style={[styles.sectionTab, activeSection === 'places' && styles.sectionTabActive]}
          onPress={() => setActiveSection('places')}
        >
          <Ionicons name="compass-outline" size={15} color={activeSection === 'places' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.sectionTabText, activeSection === 'places' && styles.sectionTabTextActive]}>Places</Text>
        </Pressable>
        <Pressable
          style={[styles.sectionTab, activeSection === 'trips' && styles.sectionTabActive]}
          onPress={() => setActiveSection('trips')}
        >
          <Ionicons name="map-outline" size={15} color={activeSection === 'trips' ? Colors.text : Colors.textSecondary} />
          <Text style={[styles.sectionTabText, activeSection === 'trips' && styles.sectionTabTextActive]}>Trips</Text>
        </Pressable>
      </View>

      {/* Category filter pills — places only */}
      {activeSection === 'places' && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[
                styles.filterPillText,
                active && styles.filterPillTextActive,
              ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      )}

      {/* Location filter pills — places only */}
      {activeSection === 'places' && countries.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}
        >
          <Pressable
            style={[styles.locationPill, filterCountry === null && styles.locationPillActive]}
            onPress={() => setFilterCountry(null)}
          >
            <Ionicons
              name="globe-outline"
              size={13}
              color={filterCountry === null ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.locationPillText, filterCountry === null && styles.locationPillTextActive]}>
              All Countries
            </Text>
          </Pressable>
          {countries.map((country) => {
            const active = filterCountry === country;
            return (
              <Pressable
                key={country}
                style={[styles.locationPill, active && styles.locationPillActive]}
                onPress={() => setFilterCountry(active ? null : country)}
              >
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={active ? Colors.white : Colors.textSecondary}
                />
                <Text style={[styles.locationPillText, active && styles.locationPillTextActive]}>
                  {country}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Places feed ── */}
      {activeSection === 'places' && (
        loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Loading community places…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMorePOIs}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
            ListFooterComponent={
              loading && items.length > 0
                ? () => <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 16 }} />
                : null
            }
          />
        )
      )}

      {/* ── Trips feed ── */}
      {activeSection === 'trips' && (
        loadingTrips && publicTrips.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Loading shared trips…</Text>
          </View>
        ) : (
          <FlatList
            data={publicTrips}
            keyExtractor={(item) => item.id}
            renderItem={renderTripCard}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMoreTrips}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl refreshing={refreshingTrips} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
            ListFooterComponent={
              loadingTrips && publicTrips.length > 0
                ? () => <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 16 }} />
                : null
            }
            ListEmptyComponent={
              <View style={styles.tripsEmpty}>
                <Text style={styles.tripsEmptyEmoji}>🗺️</Text>
                <Text style={styles.tripsEmptyTitle}>No shared trips yet</Text>
                <Text style={styles.tripsEmptyText}>
                  Be the first to share a trip from your Trips tab.
                </Text>
              </View>
            }
          />
        )
      )}

      {/* ── Comments modal ── */}
      <Modal
        visible={commentsPoiId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsPoiId(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCommentsPoiId(null)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalSheet}
        >
          {/* Handle */}
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <Pressable onPress={() => setCommentsPoiId(null)} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Comment list */}
          {loadingComments ? (
            <View style={styles.commentsLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.commentsList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.noComments}>No comments yet. Be the first!</Text>
              }
              renderItem={({ item: c }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {(c.author_name ?? 'T')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentAuthor}>{c.author_name ?? 'Traveller'}</Text>
                    <Text style={styles.commentContent}>{c.content}</Text>
                  </View>
                  {user?.id === c.user_id && (
                    <Pressable onPress={() => handleDeleteComment(c)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={15} color={Colors.textLight} />
                    </Pressable>
                  )}
                </View>
              )}
            />
          )}

          {/* Input row */}
          <View style={styles.commentInputRow}>
            <TextInput
              ref={commentInputRef}
              style={styles.commentInput}
              placeholder="Write a comment…"
              placeholderTextColor={Colors.textLight}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={300}
            />
            <Pressable
              style={[styles.sendBtn, (!commentText.trim() || submitting) && { opacity: 0.4 }]}
              onPress={handleAddComment}
              disabled={!commentText.trim() || submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="send" size={16} color={Colors.white} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {tripPickerPoi && (
        <TripPickerModal
          visible={!!tripPickerPoi}
          onClose={() => setTripPickerPoi(null)}
          poiId={tripPickerPoi.id}
          poiCategory={tripPickerPoi.type}
          sourceType="community"
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  headerDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.text,
    marginTop: 4,
  },

  /* ── Filter pills ── */
  filterBar: {
    marginBottom: Spacing.sm,
    minHeight: 48,
  },
  filterBarContent: {
    alignItems: 'center' as const,
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingRight: Spacing.md,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F3F4F6',
    flexShrink: 0,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: '#374151',
  },
  filterPillTextActive: {
    color: Colors.white,
  },

  /* ── List ── */
  list: {
    paddingBottom: 24,
    gap: Spacing.md,
  },

  /* ── Card ── */
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadow.card,
  },
  categoryAccent: {
    height: 4,
    width: '100%',
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardImage: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.border,
  },
  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  catBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  catBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: FontWeight.bold,
  },
  ownBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  ownBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  cardBody: {
    padding: Spacing.md,
    gap: 4,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLocation: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  cardPublished: {
    fontSize: 11,
    color: '#4BAF79',
    fontWeight: FontWeight.semibold,
  },
  cardAuthor: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginLeft: 4,
    flex: 1,
  },

  /* ── States ── */
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loaderText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },

  /* ── Social bar (likes + comments) ── */
  socialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  socialBtnRight: {
    marginLeft: 'auto',
  },

  /* ── Location filter pills ── */
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F3F4F6',
    flexShrink: 0,
  },
  locationPillActive: {
    backgroundColor: '#3B82F6',
  },
  locationPillText: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  locationPillTextActive: {
    color: Colors.white,
  },
  socialCount: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },

  /* ── Comments modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  commentsLoader: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  commentsList: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  noComments: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    paddingVertical: Spacing.xl,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '22',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  commentAvatarText: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    padding: 10,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  commentContent: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    maxHeight: 90,
    backgroundColor: '#FAFBFC',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  /* ── Section toggle (Places / Trips) ── */
  sectionToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.full,
    padding: 3,
    marginBottom: Spacing.md,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  sectionTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  sectionTabTextActive: {
    color: Colors.text,
  },

  /* ── Trip card ── */
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    ...Shadow.card,
  },
  tripCover: {
    width: 80,
    height: 80,
  },
  tripCoverPlaceholder: {
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripCardBody: {
    flex: 1,
    padding: Spacing.sm,
    gap: 3,
  },
  tripCardTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  tripCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tripCardLocation: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    flex: 1,
  },
  tripCardDate: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
  },
  tripCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tripCardRatingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  tripCardNoRating: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  tripsEmpty: {
    paddingTop: 60,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripsEmptyEmoji: {
    fontSize: 48,
  },
  tripsEmptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  tripsEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  contactTravelerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  contactTravelerBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
});
