import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../src/lib/supabase';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../../src/constants';
import { fetchTripItems, type TripItemCategory } from '../../../src/services/tripItems';
import { fetchPOI, type POIItem } from '../../../src/services/poiItems';
import { fetchTripPlanningItems, type TripPlanningItem } from '../../../src/services/tripPlanningItems';
import { CATEGORY_CONFIG } from '../../../src/lib/circuitCategories';
import { PLANNING_TYPE_CONFIG } from '../../../src/components/TripPlanningSection';
import { TripRatingSection, TripPhotoCarousel } from '../../../src/components';
import {
  fetchTripRatings,
  fetchUserRating,
  submitTripRating,
  removeTripRating,
  type TripRating,
} from '../../../src/services/tripRatings';
import { useAuth } from '../../../src/contexts';
import type { Trip } from '../../../src/contexts/TripsContext';
import { getOrCreateConversation } from '../../../src/services/chat';

interface TripItemWithPOI {
  id: string;
  category: TripItemCategory;
  poi?: POIItem;
}

const CATEGORY_ORDER: TripItemCategory[] = ['see', 'eat', 'stay', 'do'];

export default function SharedTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<TripItemWithPOI[]>([]);
  const [planningItems, setPlanningItems] = useState<TripPlanningItem[]>([]);
  const [ratings, setRatings] = useState<TripRating[]>([]);
  const [userRating, setUserRating] = useState<TripRating | null>(null);
  const [savingRating, setSavingRating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [contactingTraveler, setContactingTraveler] = useState(false);

  const handleContactTraveler = async () => {
    if (!user || !trip) return;
    if (user.id === trip.user_id) return;
    setContactingTraveler(true);
    const convId = await getOrCreateConversation(user.id, trip.user_id);
    setContactingTraveler(false);
    if (convId) {
      router.push(`/chat/${convId}?otherUserId=${trip.user_id}` as any);
    } else {
      Alert.alert('Error', 'Could not open conversation. Please try again.');
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fetch trip (public RLS allows is_public = true)
      const { data: tripData, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .eq('is_public', true)
        .single();

      if (error || !tripData) {
        setNotFound(true);
        return;
      }
      setTrip(tripData as Trip);

      // Fetch places
      const rawItems = await fetchTripItems(id);
      const withPOI: TripItemWithPOI[] = await Promise.all(
        rawItems.map(async (item) => {
          try {
            const poi = await fetchPOI(item.source_item_id);
            return { id: item.id, category: item.category, poi: poi ?? undefined };
          } catch {
            return { id: item.id, category: item.category };
          }
        }),
      );
      setItems(withPOI);

      // Fetch planning items
      const plan = await fetchTripPlanningItems(id);
      setPlanningItems(plan);

      // Fetch ratings
      const ratingData = await fetchTripRatings(id);
      setRatings(ratingData);
      if (user) {
        const myRating = await fetchUserRating(id, user.id);
        setUserRating(myRating);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitRating = async (rating: number, comment: string) => {
    if (!user || !id) return;
    setSavingRating(true);
    const { data, error } = await submitTripRating({
      trip_id: id,
      user_id: user.id,
      rating,
      comment: comment.trim() || null,
    });
    if (!error && data) {
      setUserRating(data);
      const updated = await fetchTripRatings(id);
      setRatings(updated);
    }
    setSavingRating(false);
  };

  const handleRemoveRating = async () => {
    if (!userRating) return;
    setSavingRating(true);
    await removeTripRating(userRating.id);
    setUserRating(null);
    const updated = await fetchTripRatings(id!);
    setRatings(updated);
    setSavingRating(false);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (notFound || !trip) {
    return (
      <View style={styles.center}>
        <Ionicons name="map-outline" size={48} color={Colors.textLight} />
        <Text style={styles.notFoundTitle}>Trip not found</Text>
        <Text style={styles.notFoundSub}>This trip is private or no longer available.</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    cfg: CATEGORY_CONFIG[cat],
    places: items.filter((i) => i.category === cat && i.poi),
  })).filter((g) => g.places.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Hero ── */}
      <View style={styles.heroSection}>
        {trip.cover_image_url ? (
          <Image source={{ uri: trip.cover_image_url }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder]}>
            <Ionicons name="map-outline" size={48} color={Colors.textLight} />
          </View>
        )}

        {/* Back button */}
        <Pressable style={styles.heroBackBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>

        {/* Shared badge */}
        <View style={styles.sharedBadge}>
          <Ionicons name="share-social-outline" size={12} color={Colors.primary} />
          <Text style={styles.sharedBadgeText}>Shared Trip</Text>
        </View>
      </View>

      {/* ── Title & meta ── */}
      <View style={styles.body}>
        <Text style={styles.title}>{trip.title}</Text>

        {/* Contact Traveler button (hide for own trips) */}
        {user && user.id !== trip.user_id ? (
          <Pressable
            style={[styles.contactBtn, contactingTraveler && { opacity: 0.6 }]}
            onPress={handleContactTraveler}
            disabled={contactingTraveler}
          >
            {contactingTraveler
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.white} />}
            <Text style={styles.contactBtnText}>Contact Traveler</Text>
          </Pressable>
        ) : null}

        {trip.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={Colors.primary} />
            <Text style={styles.locationText}>{trip.location}</Text>
          </View>
        ) : null}

        {/* Dates */}
        <View style={styles.dateCard}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>Departure</Text>
            <Text style={styles.dateValue}>{formatDate(trip.start_date)}</Text>
          </View>
          <View style={styles.dateDivider} />
          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>Return</Text>
            <Text style={styles.dateValue}>{formatDate(trip.end_date)}</Text>
          </View>
        </View>

        {/* Description */}
        {trip.description ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Story</Text>
            <Text style={styles.storyText}>{trip.description}</Text>
          </View>
        ) : null}

        {/* Photos carousel (read-only) */}
        {trip.photo_urls && trip.photo_urls.length > 0 ? (
          <TripPhotoCarousel photos={trip.photo_urls} />
        ) : null}

        {/* ── Places ── */}
        {grouped.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Places</Text>
            {grouped.map(({ cat, cfg, places }) => (
              <View key={cat} style={styles.categoryGroup}>
                <View style={styles.categoryHeader}>
                  <View style={[styles.categoryDot, { backgroundColor: cfg.color }]} />
                  <Text style={styles.categoryLabel}>{cfg.label}</Text>
                </View>
                {places.map((item) => (
                  <View key={item.id} style={styles.placeRow}>
                    {item.poi?.thumbnailUrl ? (
                      <Image source={{ uri: item.poi.thumbnailUrl }} style={styles.placeThumbnail} />
                    ) : (
                      <View style={[styles.placeThumbnail, styles.placeThumbnailPlaceholder]}>
                        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                    )}
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName} numberOfLines={1}>{item.poi?.title ?? 'Place'}</Text>
                      {item.poi?.address ? (
                        <Text style={styles.placeAddress} numberOfLines={1}>{item.poi.address}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Plan ── */}
        {planningItems.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Plan</Text>
            {planningItems.map((item) => {
              const cfg = PLANNING_TYPE_CONFIG[item.item_type];
              return (
                <View key={item.id} style={styles.planRow}>
                  <View style={[styles.planIconBox, { backgroundColor: cfg.color + '20' }]}>
                    <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.planType}>{cfg.label}</Text>
                    {item.location ? (
                      <Text style={styles.planLocation} numberOfLines={1}>
                        <Ionicons name="location-outline" size={11} /> {item.location}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── Ratings ── */}
        {trip ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
            <TripRatingSection
              tripOwnerId={trip.user_id}
              currentUserId={user?.id ?? null}
              ratings={ratings}
              userRating={userRating}
              saving={savingRating}
              onSubmit={handleSubmitRating}
              onRemove={handleRemoveRating}
            />
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  notFoundTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  notFoundSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  backPill: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  /* ── Hero ── */
  heroSection: {
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 240,
  },
  coverPlaceholder: {
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBackBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  sharedBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sharedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  /* ── Body ── */
  body: {
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  /* ── Date card ── */
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  dateBlock: {
    flex: 1,
    alignItems: 'center',
  },
  dateDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  dateLabel: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    textAlign: 'center',
  },

  /* ── Card ── */
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  storyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  /* ── Places ── */
  categoryGroup: {
    marginBottom: Spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  placeThumbnail: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
  },
  placeThumbnailPlaceholder: {
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  placeAddress: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  /* ── Plan items ── */
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  planIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planInfo: {
    flex: 1,
  },
  planTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  planType: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  planLocation: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 2,
  },

  /* ── Contact Traveler button ── */
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 11,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  contactBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
});
