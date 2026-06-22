import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenWrapper } from '../../src/components';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';
import { CATEGORY_CONFIG, type CircuitCategory } from '../../src/lib/circuitCategories';
import { fetchPOI, updatePOI, deletePOI, deletePOIPhoto, publishPOI, uploadPOIPhoto, fetchPOIPhotosWithPaths, type POIItem } from '../../src/services/poiItems';
import { fetchJournalItemPhotos, uploadAndLinkPhoto, deleteJournalItemPhoto, type JournalItemPhoto } from '../../src/services/journalItemPhotos';
import { TripPickerModal } from '../../src/components';
import { getDetailedAddress } from '../../src/lib/geocode';
import { openInAppleMaps, openInGoogleMaps, openInWaze } from '../../src/lib/mapsPreference';
import { useAuth, useMap } from '../../src/contexts';

const { width: SCREEN_W } = Dimensions.get('window');

const TYPE_OPTIONS: { key: CircuitCategory; label: string; icon: string; color: string }[] = [
  { key: 'see', ...CATEGORY_CONFIG.see },
  { key: 'eat', ...CATEGORY_CONFIG.eat },
  { key: 'stay', ...CATEGORY_CONFIG.stay },
  { key: 'do', ...CATEGORY_CONFIG.do },
];

export default function POIDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { user } = useAuth();
  const { focusPhoto, setFromPoi } = useMap();
  const [poi, setPoi] = useState<POIItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Edit state
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CircuitCategory>('see');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Location
  const [detailedAddress, setDetailedAddress] = useState<string | null>(null);

  // Photos
  const [photos, setPhotos] = useState<{ url: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [settingCover, setSettingCover] = useState(false);

  // Publish state
  const [publishing, setPublishing] = useState(false);

  // Full-screen viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  // Trip picker
  const [tripPickerVisible, setTripPickerVisible] = useState(false);
  // Linked journal photos
  const [linkedPhotos, setLinkedPhotos] = useState<JournalItemPhoto[]>([]);
  const [addingLinkedPhoto, setAddingLinkedPhoto] = useState(false);

  useEffect(() => {
    if (id) loadPOI();
  }, [id]);

  /** All viewable photos: thumbnail first, then extras */
  const allPhotos: string[] = [];
  if (poi?.thumbnailUrl) allPhotos.push(poi.thumbnailUrl);
  allPhotos.push(...photos.map((p) => p.url));

  const openPhoto = (index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleDeleteViewerPhoto = () => {
    if (!poi) return;
    const isCover = !!poi.thumbnailUrl && viewerIndex === 0;
    const extraIndex = poi.thumbnailUrl ? viewerIndex - 1 : viewerIndex;
    const storagePath = isCover
      ? poi.thumbnail_path
      : photos[extraIndex]?.path;

    if (!storagePath) return;

    Alert.alert(
      'Delete Photo',
      'Remove this photo permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingPhoto(true);
            await deletePOIPhoto(storagePath, poi.id, isCover);
            if (isCover) {
              setPoi({ ...poi, thumbnail_path: null, thumbnailUrl: undefined });
            } else {
              setPhotos((prev) => prev.filter((_, i) => i !== extraIndex));
            }
            const newTotal = allPhotos.length - 1;
            if (newTotal === 0) {
              setViewerVisible(false);
            } else {
              setViewerIndex((prev) => Math.min(prev, newTotal - 1));
            }
            setDeletingPhoto(false);
          },
        },
      ],
    );
  };

  const loadPOI = async () => {
    if (!id) return;
    setLoading(true);
    const item = await fetchPOI(id);
    if (item) {
      setPoi(item);
      setTitle(item.title);
      setType(item.type);
      setNotes(item.notes ?? '');

      // Reverse geocode for detailed address
      if (item.address) {
        setDetailedAddress(item.address);
      } else {
        const geo = await getDetailedAddress(Number(item.latitude), Number(item.longitude));
        setDetailedAddress(geo.address);
        await updatePOI(item.id, { address: geo.address });
      }

      // Load extra photos
      const items = await fetchPOIPhotosWithPaths(id);
      setPhotos(items);

      // Load linked journal photos
      const linked = await fetchJournalItemPhotos(id);
      setLinkedPhotos(linked);
    }
    setLoading(false);
  };

  const handleAddLinkedPhoto = async () => {
    if (!poi || !user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setAddingLinkedPhoto(true);
    const { error } = await uploadAndLinkPhoto(user.id, poi.id, result.assets[0].uri, linkedPhotos.length);
    if (error) {
      Alert.alert('Error', 'Failed to add photo.');
    } else {
      const updated = await fetchJournalItemPhotos(poi.id);
      setLinkedPhotos(updated);
    }
    setAddingLinkedPhoto(false);
  };

  const handleDeleteLinkedPhoto = (photo: JournalItemPhoto) => {
    Alert.alert('Remove Photo', 'Remove this photo from the journal entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteJournalItemPhoto(photo);
          setLinkedPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!poi || !title.trim()) return;
    setSaving(true);
    const { error } = await updatePOI(poi.id, {
      title: title.trim(),
      type,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Error', 'Failed to save changes.');
    } else {
      setPoi({ ...poi, title: title.trim(), type, notes: notes.trim() || null });
      setEditing(false);
    }
    setSaving(false);
  };

  const handleDelete = () => {
    if (!poi) return;
    Alert.alert(
      'Delete Place',
      `Are you sure you want to delete "${poi.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePOI(poi.id);
            if (from === 'community') router.replace('/(tabs)/community');
            else if (from === 'circuits') router.replace('/(tabs)/circuits');
            else router.back();
          },
        },
      ],
    );
  };

  const handleSetCover = async (photo: { url: string; path: string }) => {
    if (!poi || settingCover) return;
    setSettingCover(true);
    const oldThumbnailPath = poi.thumbnail_path;
    // Optimistic UI update
    const newPoi = { ...poi, thumbnail_path: photo.path, thumbnailUrl: photo.url };
    setPoi(newPoi);
    setPhotos((prev) => {
      const without = prev.filter((p) => p.path !== photo.path);
      if (oldThumbnailPath) return [...without, { path: oldThumbnailPath, url: poi.thumbnailUrl ?? '' }];
      return without;
    });
    const { error } = await updatePOI(poi.id, { thumbnail_path: photo.path });
    if (error) {
      Alert.alert('Error', 'Could not set cover photo.');
      // Revert
      setPoi(poi);
      setPhotos(await fetchPOIPhotosWithPaths(poi.id));
    }
    setSettingCover(false);
  };

  const handleTogglePublish = async () => {
    if (!poi) return;
    setPublishing(true);
    const next = !poi.is_published;
    const { error } = await publishPOI(poi.id, next);
    if (error) {
      Alert.alert('Error', 'Failed to update visibility.');
    } else {
      setPoi({ ...poi, is_published: next });
    }
    setPublishing(false);
  };

  const handleShare = async () => {
    if (!poi) return;
    const location = detailedAddress ?? poi.country ?? `${Number(poi.latitude).toFixed(4)}, ${Number(poi.longitude).toFixed(4)}`;
    const cat = CATEGORY_CONFIG[poi.type];
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${Number(poi.latitude)},${Number(poi.longitude)}`;
    const message = `📍 ${poi.title}\n🗂 ${cat.label}\n📌 ${location}\n🗺 ${mapsLink}\n\nSaved on BabApp`;
    const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

    Alert.alert(
      'Share Place',
      poi.title,
      [
        {
          text: 'WhatsApp',
          onPress: () =>
            Linking.canOpenURL(waUrl).then((ok) =>
              ok
                ? Linking.openURL(waUrl)
                : Share.share({ message }),
            ),
        },
        {
          text: 'Other…',
          onPress: () => Share.share({ message }),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleOpenInMaps = () => {
    if (!poi) return;
    const lat = Number(poi.latitude);
    const lng = Number(poi.longitude);
    const iosOptions = [
      { text: 'Apple Maps', onPress: () => openInAppleMaps(lat, lng, poi.title) },
      { text: 'Google Maps', onPress: () => openInGoogleMaps(lat, lng, poi.title) },
      { text: 'Waze', onPress: () => openInWaze(lat, lng) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    const androidOptions = [
      { text: 'Google Maps', onPress: () => openInGoogleMaps(lat, lng, poi.title) },
      { text: 'Waze', onPress: () => openInWaze(lat, lng) },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Open in Maps', 'Choose your maps app', Platform.OS === 'ios' ? iosOptions : androidOptions);
  };

  const handleAddPhoto = async () => {
    if (!poi || !user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    const { url, path, error } = await uploadPOIPhoto(user.id, poi.id, result.assets[0].uri);
    if (error) {
      Alert.alert('Error', 'Failed to upload photo.');
    } else if (url && path) {
      setPhotos((prev: { url: string; path: string }[]) => [...prev, { url, path }]);
    }
    setUploading(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // ── LOADING / ERROR ──
  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  if (!poi) {
    return (
      <ScreenWrapper>
        <View style={styles.loader}>
          <Text style={styles.errorText}>Place not found</Text>
          <Pressable style={styles.goBackBtn} onPress={() => {
              if (from === 'community') router.replace('/(tabs)/community');
              else if (from === 'circuits') router.replace('/(tabs)/circuits');
              else router.back();
            }}>
            <Text style={styles.goBackBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </ScreenWrapper>
    );
  }

  const cat = CATEGORY_CONFIG[poi.type];
  const isOwner = poi.user_id === user?.id;

  // ── FULL-SCREEN PHOTO VIEWER ──
  const renderViewer = () => (
    <Modal visible={viewerVisible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.viewerBg}>
        <StatusBar barStyle="light-content" />
        {/* Close button */}
        <Pressable style={styles.viewerClose} onPress={() => setViewerVisible(false)} hitSlop={16}>
          <Ionicons name="close" size={28} color={Colors.white} />
        </Pressable>
        {/* Counter */}
        <View style={styles.viewerCounter}>
          <Text style={styles.viewerCounterText}>
            {viewerIndex + 1} / {allPhotos.length}
          </Text>
        </View>
        {/* Delete button — owner only */}
        {isOwner && (
          <Pressable
            style={styles.viewerDelete}
            onPress={handleDeleteViewerPhoto}
            disabled={deletingPhoto}
            hitSlop={16}
          >
            {deletingPhoto
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="trash-outline" size={22} color={Colors.white} />}
          </Pressable>
        )}
        {/* Swipable photos */}
        <FlatList
          data={allPhotos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={viewerIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setViewerIndex(idx);
          }}
          keyExtractor={(_, i) => `viewer-${i}`}
          renderItem={({ item }) => (
            <View style={styles.viewerSlide}>
              <Image source={{ uri: item }} style={styles.viewerImage} resizeMode="contain" />
            </View>
          )}
        />
      </View>
    </Modal>
  );

  // ── EDIT MODE ──
  if (editing) {
    return (
      <ScreenWrapper>
        {renderViewer()}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable style={styles.headerBackBtn} onPress={() => setEditing(false)} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Edit Place</Text>
            <Pressable style={styles.headerDeleteBtn} onPress={handleDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </Pressable>
          </View>

          {/* Name field */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput
              style={styles.fieldInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Place name"
              placeholderTextColor={Colors.textLight}
              maxLength={100}
            />
          </View>

          {/* Type selector */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <View style={styles.typePillRow}>
              {TYPE_OPTIONS.map((opt) => {
                const active = type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.typePill,
                      { borderColor: opt.color + '60' },
                      active && { backgroundColor: opt.color, borderColor: opt.color },
                    ]}
                    onPress={() => setType(opt.key)}
                  >
                    <Ionicons name={opt.icon as any} size={15} color={active ? Colors.white : opt.color} />
                    <Text style={[styles.typePillText, active ? { color: Colors.white } : { color: opt.color }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              style={[styles.fieldInput, { minHeight: 90, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add notes about this place..."
              placeholderTextColor={Colors.textLight}
              multiline
              maxLength={500}
            />
          </View>

          {/* Photos */}
          <View style={styles.card}>
            <View style={styles.photoHeaderRow}>
              <Text style={styles.fieldLabel}>PHOTOS</Text>
              <Pressable style={styles.addPhotoPill} onPress={handleAddPhoto} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color={Colors.primary} />
                    <Text style={styles.addPhotoPillText}>Add Photo</Text>
                  </>
                )}
              </Pressable>
            </View>
            <View style={styles.photoGrid}>
              {poi.thumbnailUrl && (
                <View style={styles.gridPhotoWrap}>
                  <Pressable onPress={() => openPhoto(0)}>
                    <Image source={{ uri: poi.thumbnailUrl }} style={styles.gridPhoto} />
                  </Pressable>
                  <View style={styles.coverBadge}>
                    <Ionicons name="star" size={10} color={Colors.white} />
                    <Text style={styles.coverBadgeText}>Cover</Text>
                  </View>
                </View>
              )}
              {photos.map((photo, i) => (
                <View key={photo.path} style={styles.gridPhotoWrap}>
                  <Pressable onPress={() => openPhoto(poi.thumbnailUrl ? i + 1 : i)}>
                    <Image source={{ uri: photo.url }} style={styles.gridPhoto} />
                  </Pressable>
                  <Pressable
                    style={styles.setCoverBtn}
                    onPress={() => handleSetCover(photo)}
                    disabled={settingCover}
                  >
                    <Ionicons name="star-outline" size={10} color={Colors.white} />
                    <Text style={styles.coverBadgeText}>Set Cover</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {/* Save button */}
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </Pressable>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  // ── VIEW MODE ──
  return (
    <ScreenWrapper>
      {renderViewer()}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.headerBackBtn} onPress={() => {
              if (from === 'community') router.replace('/(tabs)/community');
              else if (from === 'circuits') router.replace('/(tabs)/circuits');
              else router.back();
            }} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{poi.title}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleShare} hitSlop={12} style={styles.headerIconBtn}>
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
            </Pressable>
            {isOwner && (
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => {
                  setTitle(poi.title);
                  setType(poi.type);
                  setNotes(poi.notes ?? '');
                  setEditing(true);
                }}
                hitSlop={12}
              >
                <Ionicons name="create-outline" size={20} color={Colors.primary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Hero photo */}
        {poi.thumbnailUrl ? (
          <Pressable onPress={() => openPhoto(0)}>
            <Image source={{ uri: poi.thumbnailUrl }} style={styles.heroPhoto} />
            <View style={styles.heroOverlay}>
              <View style={[styles.heroBadge, { backgroundColor: cat.color }]}>
                <Ionicons name={cat.icon as any} size={13} color={Colors.white} />
                <Text style={styles.heroBadgeText}>{cat.label}</Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.heroPhoto, styles.heroPlaceholder]}>
            <Ionicons name={cat.icon as any} size={56} color={cat.color} />
            <View style={[styles.heroBadge, { backgroundColor: cat.color, marginTop: 12 }]}>
              <Text style={styles.heroBadgeText}>{cat.label}</Text>
            </View>
          </View>
        )}

        {/* View on Photo Map — only if linked to a photo pin */}
        {poi.photo_pin_id && (
          <Pressable
            style={styles.photoMapChip}
            onPress={() => {
              focusPhoto(`pin_${poi.photo_pin_id}`, Number(poi.latitude), Number(poi.longitude));
              setFromPoi({ id: poi.id, title: poi.title });
              router.navigate('/(tabs)' as any);
            }}
          >
            <Ionicons name="camera-outline" size={16} color={Colors.primary} />
            <Text style={styles.photoMapChipText}>View original photo on map</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
          </Pressable>
        )}

        {/* Extra photos grid */}
        {photos.length > 0 && (
          <View style={styles.photoGridView}>
            {photos.map((photo: { url: string; path: string }, i: number) => (
              <Pressable key={photo.path} onPress={() => openPhoto(poi.thumbnailUrl ? i + 1 : i)}>
                <Image source={{ uri: photo.url }} style={styles.gridPhotoSmall} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Info cards */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardRow}>
            <View style={[styles.infoIconCircle, { backgroundColor: Colors.primary + '15' }]}>
              <Ionicons name="location" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoCardLabel}>Location</Text>
              <Text style={styles.infoCardValue}>
                {detailedAddress ?? poi.country ?? 'Unknown location'}
              </Text>
              <Text style={styles.infoCardSub}>
                {Number(poi.latitude).toFixed(5)}, {Number(poi.longitude).toFixed(5)}
              </Text>
            </View>
          </View>
          <Pressable style={styles.mapsChip} onPress={handleOpenInMaps}>
            <Ionicons name="navigate-outline" size={14} color={Colors.primary} />
            <Text style={styles.mapsChipText}>Open in Maps</Text>
          </Pressable>
        </View>

        {/* Quick retag — owner only, in view mode */}
        {isOwner && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardLabel}>CATEGORY</Text>
            <View style={styles.quickTagRow}>
              {TYPE_OPTIONS.map((opt) => {
                const active = poi.type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.quickTagPill, active && { backgroundColor: opt.color }]}
                    onPress={async () => {
                      if (active) return;
                      setPoi({ ...poi, type: opt.key });
                      await updatePOI(poi.id, { type: opt.key });
                    }}
                  >
                    <Ionicons name={opt.icon as any} size={13} color={active ? Colors.white : opt.color} />
                    <Text style={[styles.quickTagText, active && { color: Colors.white }]}>
                      {opt.label.split(' ').pop()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Notes */}
        {poi.notes ? (
          <View style={styles.infoCard}>
            <View style={styles.infoCardRow}>
              <View style={[styles.infoIconCircle, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="document-text-outline" size={18} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoCardLabel}>Notes</Text>
                <Text style={styles.infoCardValue}>{poi.notes}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Date */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardRow}>
            <View style={[styles.infoIconCircle, { backgroundColor: Colors.accent + '20' }]}>
              <Ionicons name="calendar-outline" size={18} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoCardLabel}>
                {poi.taken_at ? 'Photo Taken' : 'Visited'}
              </Text>
              <Text style={styles.infoCardValue}>
                {formatDate(poi.taken_at ?? poi.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Linked photos gallery */}
        {(linkedPhotos.length > 0 || isOwner) && (
          <View style={styles.infoCard}>
            <View style={styles.galleryHeader}>
              <Text style={styles.infoCardLabel}>GALLERY</Text>
              {isOwner && (
                <Pressable
                  style={styles.galleryAddBtn}
                  onPress={handleAddLinkedPhoto}
                  disabled={addingLinkedPhoto}
                >
                  {addingLinkedPhoto
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />}
                </Pressable>
              )}
            </View>
            {linkedPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {linkedPhotos.map((lp) => (
                  <Pressable
                    key={lp.id}
                    onLongPress={() => isOwner && handleDeleteLinkedPhoto(lp)}
                    style={styles.galleryThumbWrap}
                  >
                    {lp.signedUrl ? (
                      <Image source={{ uri: lp.signedUrl }} style={styles.galleryThumb} />
                    ) : (
                      <View style={[styles.galleryThumb, { backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="image-outline" size={22} color={Colors.textLight} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.galleryEmpty}>Tap + to add photos to this journal entry</Text>
            )}
          </View>
        )}

        {/* Add to Trip — any logged-in user */}
        {user && (
          <Pressable
            style={styles.addToTripBtn}
            onPress={() => setTripPickerVisible(true)}
          >
            <Ionicons name="bookmark-outline" size={18} color={Colors.primary} />
            <Text style={styles.addToTripBtnText}>Add to Trip</Text>
          </Pressable>
        )}

        {/* Publish / Unpublish — owner only */}
        {isOwner && (
          <Pressable
            style={[styles.publishBtn, poi.is_published && styles.publishBtnActive, publishing && { opacity: 0.6 }]}
            onPress={handleTogglePublish}
            disabled={publishing}
          >
            <Ionicons
              name={poi.is_published ? 'globe-outline' : 'lock-closed-outline'}
              size={18}
              color={poi.is_published ? Colors.white : Colors.primary}
            />
            <Text style={[styles.publishBtnText, poi.is_published && styles.publishBtnTextActive]}>
              {publishing ? 'Updating...' : poi.is_published ? 'Published — Tap to make Private' : 'Private — Tap to Publish'}
            </Text>
          </Pressable>
        )}

      </ScrollView>

      {poi && (
        <TripPickerModal
          visible={tripPickerVisible}
          onClose={() => setTripPickerVisible(false)}
          poiId={poi.id}
          poiCategory={poi.type}
          sourceType={from === 'community' ? 'community' : 'journal'}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  goBackBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  goBackBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border + '80',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border + '80',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.error + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Hero photo (view) ── */
  heroPhoto: {
    width: '100%',
    height: 260,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  heroPlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  heroBadgeText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  /* ── Photo grids ── */
  photoGridView: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.sm,
  },
  gridPhotoSmall: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.sm,
  },
  gridPhoto: {
    width: 90,
    height: 90,
    borderRadius: BorderRadius.md,
  },

  /* ── Info cards (view) ── */
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    ...Shadow.card,
  },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    marginTop: 2,
    lineHeight: 22,
  },
  infoCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  mapsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
    marginLeft: 48,
  },
  mapsChipText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  /* ── Edit button (view) ── */
  editBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    marginTop: Spacing.xl,
    ...Shadow.button,
  },
  editBtnFullText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },

  /* ── Edit mode ── */
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    ...Shadow.card,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textLight,
    letterSpacing: 1,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: '#FAFBFC',
  },
  typePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typePillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  addPhotoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  addPhotoPillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.xs,
    ...Shadow.button,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },

  /* ── Full-screen viewer ── */
  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerDelete: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 56 : 24,
    right: 20,
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239,68,68,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerCounter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  viewerCounterText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  viewerSlide: {
    width: SCREEN_W,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_W,
    height: '80%',
  },

  /* ── Photo map chip ── */
  photoMapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  photoMapChipText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  /* ── Photo grid with cover overlay ── */
  gridPhotoWrap: {
    position: 'relative',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  setCoverBtn: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  coverBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeight.bold,
  },

  /* ── Publish button ── */
  addToTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 13,
    marginBottom: Spacing.sm,
  },
  addToTripBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    ...Shadow.card,
  },
  publishBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  publishBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  publishBtnTextActive: {
    color: Colors.white,
  },
  quickTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  quickTagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryAddBtn: {
    padding: 4,
  },
  galleryThumbWrap: {
    marginRight: 8,
  },
  galleryThumb: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
  },
  galleryEmpty: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
