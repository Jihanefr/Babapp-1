import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';

const SCREEN_WIDTH = Dimensions.get('window').width;
const BODY_PADDING = Spacing.md * 2;
const CAROUSEL_WIDTH = SCREEN_WIDTH - BODY_PADDING;
const PHOTO_HEIGHT = Math.round(CAROUSEL_WIDTH * (9 / 16));
const MAX_PHOTOS = 10;

interface Props {
  photos: string[];
  isOwner?: boolean;
  uploading?: boolean;
  onAddPhoto?: () => void;
  onRemovePhoto?: (url: string) => void;
}

export function TripPhotoCarousel({ photos, isOwner, uploading, onAddPhoto, onRemovePhoto }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const canAdd = isOwner && photos.length < MAX_PHOTOS;
  const totalSlides = photos.length + (canAdd ? 1 : 0);

  if (totalSlides === 0) return null;

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / CAROUSEL_WIDTH);
    setActiveIndex(Math.max(0, Math.min(idx, totalSlides - 1)));
  };

  return (
    <View style={styles.wrapper}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="images-outline" size={17} color={Colors.primary} />
          <Text style={styles.headerTitle}>Photos</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.counter}>{photos.length}/{MAX_PHOTOS}</Text>
        </View>
      </View>

      {/* ── Carousel ── */}
      <View style={styles.carouselContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          nestedScrollEnabled
          decelerationRate="fast"
          style={{ width: CAROUSEL_WIDTH }}
        >
          {photos.map((uri) => (
            <View key={uri} style={styles.slide}>
              <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
              {isOwner && onRemovePhoto ? (
                <TouchableOpacity
                  style={styles.removeOverlay}
                  onPress={() => onRemovePhoto(uri)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  <View style={styles.removeCircle}>
                    <Ionicons name="close" size={14} color={Colors.white} />
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {canAdd ? (
            <View style={[styles.slide, styles.addSlide]}>
              {uploading ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.uploadingText}>Uploading…</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addTouchable}
                  onPress={onAddPhoto}
                  activeOpacity={0.7}
                >
                  <View style={styles.addIconCircle}>
                    <Ionicons name="add" size={36} color={Colors.primary} />
                  </View>
                  <Text style={styles.addTitle}>Add Photo</Text>
                  <Text style={styles.addSub}>{photos.length} of {MAX_PHOTOS} photos added</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </ScrollView>

        {/* ── Dot indicators ── */}
        {totalSlides > 1 ? (
          <View style={styles.dots}>
            {Array.from({ length: totalSlides }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  headerRight: {
    backgroundColor: Colors.primary + '18',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counter: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  carouselContainer: {
    alignItems: 'center',
    paddingBottom: Spacing.sm,
  },
  slide: {
    width: CAROUSEL_WIDTH,
    height: PHOTO_HEIGHT,
    position: 'relative',
  },
  photo: {
    width: CAROUSEL_WIDTH,
    height: PHOTO_HEIGHT,
  },
  removeOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  removeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSlide: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTouchable: {
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
  },
  addIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  addSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  uploadingBox: {
    alignItems: 'center',
    gap: 10,
  },
  uploadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
});
