import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components';
import { useCircuits, type Circuit, type CircuitImage } from '../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_GAP = 8;
const NUM_COLUMNS = 3;
const IMAGE_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - IMAGE_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function CircuitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circuits, getCircuitImages, uploadCircuitImage } = useCircuits();
  const [images, setImages] = useState<CircuitImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const circuit = circuits.find((c) => c.id === id);

  useEffect(() => {
    if (id) {
      loadImages();
    }
  }, [id]);

  const loadImages = async () => {
    if (!id) return;
    setLoadingImages(true);
    const imgs = await getCircuitImages(id);
    setImages(imgs);
    setLoadingImages(false);
  };

  const handleAddPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0 && id) {
      setUploading(true);
      for (const asset of result.assets) {
        const { error } = await uploadCircuitImage(id, asset.uri);
        if (error) {
          Alert.alert('Upload Failed', error.message);
          break;
        }
      }
      await loadImages();
      setUploading(false);
    }
  };

  if (!circuit) {
    return (
      <ScreenWrapper>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  if (selectedImageIndex !== null) {
    return (
      <ImageViewer
        images={images}
        initialIndex={selectedImageIndex}
        onClose={() => setSelectedImageIndex(null)}
      />
    );
  }

  return (
    <ScreenWrapper padded={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.imageSection}>
          {circuit.cover_image_url ? (
            <Image source={{ uri: circuit.cover_image_url }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Ionicons name="image-outline" size={48} color={Colors.textLight} />
            </View>
          )}
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{circuit.title}</Text>

          {circuit.location ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={18} color={Colors.primary} />
              <Text style={styles.locationText}>{circuit.location}</Text>
            </View>
          ) : null}

          <View style={styles.metaCard}>
            {circuit.difficulty ? (
              <MetaStat icon="fitness-outline" label="Difficulty" value={circuit.difficulty} />
            ) : null}
            {circuit.duration_hours ? (
              <MetaStat icon="time-outline" label="Duration" value={`${circuit.duration_hours}h`} />
            ) : null}
            {circuit.distance_km ? (
              <MetaStat icon="walk-outline" label="Distance" value={`${circuit.distance_km} km`} />
            ) : null}
          </View>

          {circuit.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{circuit.description}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.photoHeader}>
              <Text style={styles.sectionTitle}>
                Photos {images.length > 0 ? `(${images.length})` : ''}
              </Text>
              <Pressable onPress={handleAddPhoto} style={styles.addPhotoBtn} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color={Colors.white} />
                    <Text style={styles.addPhotoText}>Add</Text>
                  </>
                )}
              </Pressable>
            </View>
            {loadingImages ? (
              <ActivityIndicator size="small" color={Colors.primary} style={styles.imageLoader} />
            ) : images.length === 0 ? (
              <Text style={styles.noImages}>No photos yet. Tap Add to upload!</Text>
            ) : (
              <View style={styles.imageGrid}>
                {images.map((img, index) => (
                  <Pressable
                    key={img.id}
                    onPress={() => setSelectedImageIndex(index)}
                    style={styles.gridItem}
                  >
                    <Image source={{ uri: img.image_url }} style={styles.gridImage} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

function MetaStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metaStatItem}>
      <Ionicons name={icon as any} size={20} color={Colors.primary} />
      <Text style={styles.metaStatLabel}>{label}</Text>
      <Text style={styles.metaStatValue}>{value}</Text>
    </View>
  );
}

function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: CircuitImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  return (
    <View style={styles.viewerContainer}>
      <Pressable onPress={onClose} style={styles.viewerClose}>
        <Ionicons name="close" size={28} color={Colors.white} />
      </Pressable>

      <FlatList
        data={images}
        horizontal
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(idx);
        }}
        renderItem={({ item }) => (
          <View style={styles.viewerSlide}>
            <Image
              source={{ uri: item.image_url }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
            {item.caption ? (
              <Text style={styles.viewerCaption}>{item.caption}</Text>
            ) : null}
          </View>
        )}
      />

      <Text style={styles.viewerCounter}>
        {currentIndex + 1} / {images.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  locationText: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    marginLeft: Spacing.xs,
  },
  metaCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    justifyContent: 'space-around',
    ...Shadow.card,
  },
  metaStatItem: {
    alignItems: 'center',
  },
  metaStatLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  metaStatValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  imageLoader: {
    marginTop: Spacing.md,
  },
  noImages: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  addPhotoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: IMAGE_GAP,
  },
  gridItem: {
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  gridImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: BorderRadius.sm,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerSlide: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  viewerCaption: {
    color: Colors.white,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  viewerCounter: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
});
