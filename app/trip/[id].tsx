import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper, TripPlanningSection, TripPlanningItemForm, TripNotesSection, TripCheckpointButton, EditTripModal, TripPhotoCarousel } from '../../src/components';
import { useTrips, useAuth } from '../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';
import { fetchTripItems, removeTripItem, type TripItem, type TripItemCategory } from '../../src/services/tripItems';
import { fetchPOI, type POIItem } from '../../src/services/poiItems';
import { CATEGORY_CONFIG } from '../../src/lib/circuitCategories';
import {
  fetchTripPlanningItems,
  addTripPlanningItem,
  updateTripPlanningItem,
  removeTripPlanningItem,
  type TripPlanningItem,
  type NewTripPlanningItem,
} from '../../src/services/tripPlanningItems';
import {
  fetchTripNotes,
  addTripNote,
  removeTripNote,
  type TripNote,
} from '../../src/services/tripNotes';
import {
  addTripCheckpoint,
  type TripCheckpoint,
} from '../../src/services/tripCheckpoints';

interface TripItemWithPOI extends TripItem {
  poi?: POIItem;
}

const CATEGORY_ORDER: TripItemCategory[] = ['see', 'eat', 'stay', 'do'];
type ActiveTab = 'overview' | 'places' | 'plan' | 'notes';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips, deleteTrip, uploadTripPhotos, uploadTripImage, removeTripPhoto, updateTrip } = useTrips();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<TripItemWithPOI[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [planningItems, setPlanningItems] = useState<TripPlanningItem[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [removingPlanId, setRemovingPlanId] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [removingNoteId, setRemovingNoteId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<TripCheckpoint[]>([]);
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [editingPlanItem, setEditingPlanItem] = useState<TripPlanningItem | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const trip = trips.find((t) => t.id === id);

  const loadItems = useCallback(async () => {
    if (!id) return;
    setLoadingItems(true);
    setItemsError(false);
    try {
      const raw = await fetchTripItems(id);
      const withPOI = await Promise.all(
        raw.map(async (item) => {
          try {
            const poi = await fetchPOI(item.source_item_id);
            return { ...item, poi: poi ?? undefined };
          } catch {
            return { ...item, poi: undefined };
          }
        }),
      );
      setItems(withPOI);
    } catch {
      setItemsError(true);
    } finally {
      setLoadingItems(false);
    }
  }, [id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const loadPlanningItems = useCallback(async () => {
    if (!id) return;
    setLoadingPlan(true);
    try {
      const data = await fetchTripPlanningItems(id);
      setPlanningItems(data);
    } finally {
      setLoadingPlan(false);
    }
  }, [id]);

  useEffect(() => {
    loadPlanningItems();
  }, [loadPlanningItems]);

  const handleAddPlanningItem = async (item: NewTripPlanningItem) => {
    const { data, error } = await addTripPlanningItem(item);
    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      setPlanningItems((prev) => [...prev, data]);
    }
  };

  const handleUpdatePlanningItem = async (
    itemId: string,
    updates: Partial<Pick<TripPlanningItem, 'title' | 'description' | 'location' | 'start_datetime' | 'end_datetime' | 'metadata'>>,
  ) => {
    const { error } = await updateTripPlanningItem(itemId, updates);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setPlanningItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
      );
    }
  };

  const handleEditTrip = async (updates: Parameters<typeof updateTrip>[1]) => {
    if (!id) return;
    const { error } = await updateTrip(id, updates);
    if (error) Alert.alert('Error', error.message);
  };

  const loadNotes = useCallback(async () => {
    if (!id) return;
    setLoadingNotes(true);
    try {
      const data = await fetchTripNotes(id);
      setNotes(data);
    } finally {
      setLoadingNotes(false);
    }
  }, [id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleAddNote = async (content: string) => {
    if (!user || !id) return;
    setSavingNote(true);
    const { data, error } = await addTripNote({ trip_id: id, user_id: user.id, content });
    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      setNotes((prev) => [data, ...prev]);
    }
    setSavingNote(false);
  };

  const handleShare = async () => {
    if (!trip || !id) return;
    if (!trip.is_public) {
      Alert.alert(
        'Share Trip',
        'Make this trip public so others can view it? Anyone with the link will be able to see your trip details, places, and plan.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Make Public & Share',
            onPress: async () => {
              await updateTrip(id, { is_public: true, trip_type: 'sharing' });
              openShareSheet();
            },
          },
        ],
      );
    } else {
      openShareSheet();
    }
  };

  const openShareSheet = () => {
    Share.share({
      title: trip?.title ?? 'My Trip',
      message: `Check out my trip "${trip?.title ?? ''}" on BabApp! 🌍`,
    });
  };

  const handleAddCheckpoint = async (coords: { latitude: number; longitude: number; label: string }) => {
    if (!user || !id) return;
    const { data, error } = await addTripCheckpoint({
      trip_id: id,
      user_id: user.id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: coords.label,
      source: 'manual',
    });
    if (error) {
      Alert.alert('Error', error.message);
    } else if (data) {
      setCheckpoints((prev) => [...prev, data]);
      Alert.alert('Checkpoint saved', `${coords.label} has been saved to your trip map.`);
    }
  };

  const handleRemoveNote = (note: TripNote) => {
    Alert.alert(
      'Delete Note',
      'Delete this note permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemovingNoteId(note.id);
            await removeTripNote(note.id);
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
            setRemovingNoteId(null);
          },
        },
      ],
    );
  };

  const handleRemovePlanningItem = (item: TripPlanningItem) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.title}" from the plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingPlanId(item.id);
            await removeTripPlanningItem(item.id);
            setPlanningItems((prev) => prev.filter((i) => i.id !== item.id));
            setRemovingPlanId(null);
          },
        },
      ],
    );
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = () => {
    Alert.alert('Delete Trip', 'This will permanently delete the trip and all its items.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await deleteTrip(id);
          if (error) Alert.alert('Error', error.message);
          else router.navigate('/(tabs)/trips');
        },
      },
    ]);
  };

  const handleChangeCover = async () => {
    if (!id) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setUploading(true);
      await uploadTripImage(id, result.assets[0].uri);
      setUploading(false);
    }
  };

  const handleAddCarouselPhotos = async () => {
    if (!id) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 10 - (trip?.photo_urls?.length ?? 0),
    });
    if (!result.canceled && result.assets.length > 0) {
      setUploadingPhotos(true);
      await uploadTripPhotos(id, result.assets.map((a) => a.uri));
      setUploadingPhotos(false);
    }
  };

  const handleRemoveCarouselPhoto = async (url: string) => {
    if (!id) return;
    await removeTripPhoto(id, url);
  };

  const handleRemoveItem = (item: TripItemWithPOI) => {
    Alert.alert(
      'Remove from Trip',
      `Remove "${item.poi?.title ?? 'this place'}" from the trip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(item.id);
            await removeTripItem(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            setRemovingId(null);
          },
        },
      ],
    );
  };

  if (!trip) {
    return (
      <ScreenWrapper>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  const isPlanning = trip.trip_type === 'planning';
  const groupedItems = CATEGORY_ORDER.reduce<Record<TripItemCategory, TripItemWithPOI[]>>(
    (acc, cat) => {
      acc[cat] = items.filter((i) => i.category === cat);
      return acc;
    },
    { see: [], eat: [], stay: [], do: [] },
  );
  const hasItems = items.length > 0;

  return (
    <ScreenWrapper padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Hero cover ── */}
        <View style={styles.imageSection}>
          {trip.cover_image_url ? (
            <Image source={{ uri: trip.cover_image_url }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Ionicons name={isPlanning ? 'map-outline' : 'images-outline'} size={52} color={Colors.textLight} />
            </View>
          )}
          <Pressable onPress={() => router.navigate('/(tabs)/trips')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
          <Pressable onPress={handleChangeCover} style={styles.cameraBtn}>
            {uploading
              ? <ActivityIndicator size="small" color={Colors.text} />
              : <Ionicons name="camera-outline" size={20} color={Colors.text} />}
          </Pressable>
          <Pressable onPress={handleShare} style={styles.shareBtn}>
            <Ionicons name="share-outline" size={20} color={trip.is_public ? Colors.primary : Colors.text} />
          </Pressable>
          {/* Type badge on image */}
          <View style={[styles.typeBadgeHero, isPlanning ? styles.typeBadgeHeroPlanning : styles.typeBadgeHeroSharing]}>
            <Ionicons name={isPlanning ? 'map-outline' : 'images-outline'} size={12} color={Colors.white} />
            <Text style={styles.typeBadgeHeroText}>{isPlanning ? 'Planning' : 'Sharing'}</Text>
          </View>
        </View>

        <View style={styles.body}>

          {/* ── Title + location ── */}
          <View style={styles.titleRow}>
            <Text style={[styles.title, { flex: 1 }]}>{trip.title}</Text>
            <TouchableOpacity
              style={styles.editTripBtn}
              onPress={() => setShowEditTrip(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {trip.location ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color={Colors.primary} />
              <Text style={styles.locationText}>{trip.location}</Text>
            </View>
          ) : null}

          {/* ── Dates ── */}
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

          {/* ── Budget chip (planning only) ── */}
          {isPlanning && trip.budget ? (
            <View style={styles.budgetChip}>
              <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
              <Text style={styles.budgetText}>{trip.budget}</Text>
            </View>
          ) : null}

          {/* ── Map + Checkpoint action row ── */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.mapBtn, { flex: 1 }]}
              onPress={() => router.push(`/trip/map/${id}`)}
            >
              <Ionicons name="map-outline" size={16} color={Colors.white} />
              <Text style={styles.mapBtnText}>View Map</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <TripCheckpointButton onCheckpoint={handleAddCheckpoint} />
            </View>
          </View>

          {/* ── Tab bar ── */}
          <View style={styles.tabBar}>
            {(['overview', 'places', 'plan', 'notes'] as ActiveTab[]).map((tab) => {
              const label =
                tab === 'overview' ? 'Overview' :
                tab === 'places' ? `Places${items.length > 0 ? ` (${items.length})` : ''}` :
                tab === 'plan' ? `Plan${planningItems.length > 0 ? ` (${planningItems.length})` : ''}` :
                `Notes${notes.length > 0 ? ` (${notes.length})` : ''}`;
              return (
                <Pressable
                  key={tab}
                  style={[styles.tab, activeTab === tab && styles.tabActive]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Overview tab ── */}
          {activeTab === 'overview' && (
            <>
              {trip.description ? (
                <View style={styles.storyCard}>
                  <Text style={styles.sectionTitle}>{isPlanning ? 'Notes' : 'Story'}</Text>
                  <Text style={styles.storyText}>{trip.description}</Text>
                </View>
              ) : (
                <View style={styles.emptyItems}>
                  <Ionicons name="document-text-outline" size={36} color={Colors.textLight} />
                  <Text style={styles.emptyItemsTitle}>No description yet</Text>
                  <Text style={styles.emptyItemsSub}>Edit your trip to add a description or story.</Text>
                </View>
              )}
              <TripPhotoCarousel
                photos={trip.photo_urls ?? []}
                isOwner
                uploading={uploadingPhotos}
                onAddPhoto={handleAddCarouselPhotos}
                onRemovePhoto={handleRemoveCarouselPhoto}
              />
            </>
          )}

          {/* ── Places tab ── */}
          {activeTab === 'places' && (
            <View style={styles.sectionBlock}>
              {loadingItems ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
              ) : itemsError ? (
                <View style={styles.emptyItems}>
                  <Ionicons name="cloud-offline-outline" size={36} color={Colors.textLight} />
                  <Text style={styles.emptyItemsTitle}>Could not load places</Text>
                  <Text style={styles.emptyItemsSub}>Check your connection and try again.</Text>
                </View>
              ) : !hasItems ? (
                <View style={styles.emptyItems}>
                  <Ionicons name="pin-outline" size={36} color={Colors.textLight} />
                  <Text style={styles.emptyItemsTitle}>No places yet</Text>
                  <Text style={styles.emptyItemsSub}>
                    Open any journal entry or community post and tap{' '}
                    <Text style={{ fontWeight: FontWeight.bold }}>"Add to Trip"</Text> to collect places here.
                  </Text>
                </View>
              ) : (
                CATEGORY_ORDER.map((cat) => {
                  const catItems = groupedItems[cat];
                  if (catItems.length === 0) return null;
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <View key={cat} style={styles.categoryBlock}>
                      <View style={[styles.categoryHeader, { borderLeftColor: cfg.color }]}>
                        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                        <Text style={[styles.categoryLabel, { color: cfg.color }]}>{cfg.label}</Text>
                        <Text style={styles.categoryCount}>{catItems.length}</Text>
                      </View>
                      {catItems.map((item) => (
                        <View key={item.id} style={styles.placeRow}>
                          {item.poi?.thumbnailUrl ? (
                            <Image source={{ uri: item.poi.thumbnailUrl }} style={styles.placeThumbnail} />
                          ) : (
                            <View style={[styles.placeThumbnail, styles.placeThumbnailEmpty]}>
                              <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                            </View>
                          )}
                          <View style={styles.placeInfo}>
                            <Text style={styles.placeName} numberOfLines={1}>
                              {item.poi?.title ?? 'Unknown place'}
                            </Text>
                            {item.poi?.address ? (
                              <Text style={styles.placeAddress} numberOfLines={1}>{item.poi.address}</Text>
                            ) : null}
                            {item.notes ? (
                              <Text style={styles.placeNotes} numberOfLines={2}>{item.notes}</Text>
                            ) : null}
                          </View>
                          <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemoveItem(item)}
                            disabled={removingId === item.id}
                          >
                            {removingId === item.id
                              ? <ActivityIndicator size="small" color={Colors.error} />
                              : <Ionicons name="trash-outline" size={18} color={Colors.error} />}
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ── Notes tab ── */}
          {activeTab === 'notes' && (
            <TripNotesSection
              notes={notes}
              loading={loadingNotes}
              saving={savingNote}
              removingId={removingNoteId}
              onAdd={handleAddNote}
              onRemove={handleRemoveNote}
            />
          )}

          {/* ── Plan tab ── */}
          {activeTab === 'plan' && (
            <TripPlanningSection
              items={planningItems}
              loading={loadingPlan}
              removingId={removingPlanId}
              onAdd={() => setShowPlanForm(true)}
              onRemove={handleRemovePlanningItem}
              onEdit={(item) => { setEditingPlanItem(item); setShowPlanForm(true); }}
            />
          )}

          {/* ── Delete trip ── */}
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <Text style={styles.deleteBtnText}>Delete Trip</Text>
          </TouchableOpacity>
        </View>

        {/* ── Planning item form (add + edit) ── */}
        {user && (
          <TripPlanningItemForm
            visible={showPlanForm}
            tripId={id ?? ''}
            userId={user.id}
            editItem={editingPlanItem}
            onClose={() => { setShowPlanForm(false); setEditingPlanItem(null); }}
            onSubmit={handleAddPlanningItem}
            onUpdate={handleUpdatePlanningItem}
          />
        )}

        {/* ── Edit trip modal ── */}
        {trip && (
          <EditTripModal
            visible={showEditTrip}
            trip={trip}
            onClose={() => setShowEditTrip(false)}
            onSave={handleEditTrip}
          />
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Hero ── */
  imageSection: {
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 240,
  },
  coverPlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeHero: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  typeBadgeHeroPlanning: {
    backgroundColor: Colors.primary,
  },
  typeBadgeHeroSharing: {
    backgroundColor: Colors.accent,
  },
  typeBadgeHeroText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },

  /* ── Body ── */
  body: {
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  editTripBtn: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.md,
  },
  locationText: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },

  /* ── Dates ── */
  dateCard: {
    flexDirection: 'row',
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
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  dateLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
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

  /* ── Share button (hero overlay) ── */
  shareBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 56,
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

  /* ── Action row (Map + Checkpoint) ── */
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  /* ── Map button ── */
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  mapBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  /* ── Tab bar ── */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.white,
  },

  /* ── Budget ── */
  budgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '14',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
  },
  budgetText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  /* ── Story / Notes ── */
  storyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },

  /* ── Shared section ── */
  sectionBlock: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  storyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginTop: Spacing.xs,
  },

  /* ── Photo grid ── */
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  photoGridItem: {
    width: 90,
    height: 90,
    borderRadius: BorderRadius.md,
  },

  /* ── Empty items ── */
  emptyItems: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    ...Shadow.card,
  },
  emptyItemsTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptyItemsSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Category sections ── */
  categoryBlock: {
    marginBottom: Spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderLeftWidth: 3,
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  categoryLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },

  /* ── Place row ── */
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  placeThumbnail: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
  },
  placeThumbnailEmpty: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  placeAddress: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  placeNotes: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 3,
    fontStyle: 'italic',
  },
  removeBtn: {
    padding: Spacing.xs,
  },

  /* ── Delete trip ── */
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    marginTop: Spacing.lg,
  },
  deleteBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
});
