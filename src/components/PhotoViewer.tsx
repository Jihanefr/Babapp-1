import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants';
import type { GeoPhoto } from '../hooks';
import { CATEGORY_CONFIG, type CircuitCategory } from '../lib/circuitCategories';
import { getDetailedAddress } from '../lib/geocode';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface CategoryInfo {
  label: string;
  icon: string;
  color: string;
}

interface Props {
  photos: GeoPhoto[];
  initialIndex: number;
  onClose: () => void;
  onSavePlace?: (photo: GeoPhoto, category: CircuitCategory) => void;
  getPhotoCategory?: (photo: GeoPhoto) => CategoryInfo | null;
  onDelete?: (photo: GeoPhoto) => void;
  onViewOnMap?: (photo: GeoPhoto) => void;
}

const CATEGORIES: { key: CircuitCategory; icon: string; label: string; color: string }[] = [
  { key: 'see', ...CATEGORY_CONFIG.see },
  { key: 'eat', ...CATEGORY_CONFIG.eat },
  { key: 'stay', ...CATEGORY_CONFIG.stay },
  { key: 'do', ...CATEGORY_CONFIG.do },
];

export function PhotoViewer({ photos, initialIndex, onClose, onSavePlace, getPhotoCategory, onDelete, onViewOnMap }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const current = photos[currentIndex];
  const [detailedAddr, setDetailedAddr] = useState<Record<string, string>>({});
  const [showSaveOptions, setShowSaveOptions] = useState(false);

  // Reverse geocode current photo for detailed address
  useEffect(() => {
    const key = `${Number(current.latitude).toFixed(4)}_${Number(current.longitude).toFixed(4)}`;
    if (detailedAddr[key]) return;
    let cancelled = false;
    getDetailedAddress(Number(current.latitude), Number(current.longitude)).then((result) => {
      if (!cancelled) {
        setDetailedAddr((prev) => ({ ...prev, [key]: result.address }));
      }
    });
    return () => { cancelled = true; };
  }, [current.latitude, current.longitude]);

  const getLocationText = () => {
    const key = `${Number(current.latitude).toFixed(4)}_${Number(current.longitude).toFixed(4)}`;
    return detailedAddr[key] || current.country || `${Number(current.latitude).toFixed(4)}, ${Number(current.longitude).toFixed(4)}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getMapsUrl = (photo: GeoPhoto) =>
    `https://www.google.com/maps/search/?api=1&query=${Number(photo.latitude)},${Number(photo.longitude)}`;

  const handleDelete = (photo: GeoPhoto) => {
    Alert.alert(
      'Hide from Map',
      'This photo will no longer appear on your map. The original photo on your device stays untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () => onDelete?.(photo),
        },
      ],
    );
  };

  const handleShare = (photo: GeoPhoto) => {
    const url = getMapsUrl(photo);
    const message = `Check out this location!\n${url}`;
    const options = ['Share Location', 'Open in Google Maps', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (index) => {
          if (index === 0) Share.share({ message });
          if (index === 1) Linking.openURL(url);
        },
      );
    } else {
      Alert.alert('Share Photo Location', undefined, [
        { text: 'Share Location', onPress: () => Share.share({ message }) },
        { text: 'Open in Google Maps', onPress: () => Linking.openURL(url) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setCurrentIndex(idx);
        }}
        renderItem={({ item }) => (
          <ZoomablePhoto uri={item.uri} />
        )}
      />

      {/* Close button */}
      <Pressable onPress={onClose} style={styles.closeBtn}>
        <Ionicons name="close" size={26} color={Colors.white} />
      </Pressable>

      {/* Share button */}
      <Pressable onPress={() => handleShare(current)} style={styles.shareBtn}>
        <Ionicons name="share-outline" size={24} color={Colors.white} />
      </Pressable>

      {/* Save as Place button */}
      {onSavePlace && !getPhotoCategory?.(current) && (
        <Pressable onPress={() => setShowSaveOptions((v) => !v)} style={styles.savePlaceBtn}>
          <Ionicons name={showSaveOptions ? 'close' : 'bookmark-outline'} size={24} color={Colors.white} />
        </Pressable>
      )}

      {/* View on map button */}
      {onViewOnMap && (
        <Pressable onPress={() => { onViewOnMap(current); onClose(); }} style={styles.viewOnMapBtn}>
          <Ionicons name="map-outline" size={22} color={Colors.white} />
        </Pressable>
      )}

      {/* Hide from map button */}
      {onDelete && (
        <Pressable onPress={() => handleDelete(current)} style={styles.deleteBtn}>
          <Ionicons name="eye-off-outline" size={22} color={Colors.white} />
        </Pressable>
      )}

      {/* Category quick-save buttons */}
      {showSaveOptions && onSavePlace && (
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[styles.categoryBtn, { backgroundColor: cat.color }]}
              onPress={() => {
                onSavePlace(current, cat.key);
                setShowSaveOptions(false);
              }}
            >
              <Ionicons name={cat.icon as any} size={18} color={Colors.white} />
              <Text style={styles.categoryBtnText}>{cat.label.split(' ').pop()}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Bottom info bar */}
      <View style={styles.bottomBar}>
        {(() => {
          const catInfo = getPhotoCategory?.(current);
          if (!catInfo) return null;
          return (
            <View style={[styles.categoryBadge, { backgroundColor: catInfo.color }]}>
              <Ionicons name={catInfo.icon as any} size={14} color={Colors.white} />
              <Text style={styles.categoryBadgeText}>{catInfo.label}</Text>
            </View>
          );
        })()}
        <Text style={styles.dateText}>{formatDate(current.creationTime)}</Text>
        <Text style={styles.coordsText}>{getLocationText()}</Text>
        <Text style={styles.counter}>
          {currentIndex + 1} / {photos.length}
        </Text>
      </View>
    </View>
  );
}

function ZoomablePhoto({ uri }: { uri: string }) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width: SCREEN_W, height: SCREEN_H }}
      contentContainerStyle={styles.zoomContainer}
      maximumZoomScale={5}
      minimumZoomScale={1}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      bouncesZoom
    >
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="contain"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  zoomContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: SCREEN_H,
  },
  photo: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  shareBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    left: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  savePlaceBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    left: Spacing.md + 52,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  viewOnMapBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    left: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239,68,68,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  dateText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  coordsText: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  counter: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    marginBottom: 8,
  },
  categoryBadgeText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  categoryRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  categoryBtnText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
