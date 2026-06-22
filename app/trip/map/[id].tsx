import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrips } from '../../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../../../src/constants';
import { fetchTripItems } from '../../../src/services/tripItems';
import { fetchPOI } from '../../../src/services/poiItems';
import { fetchTripPlanningItems } from '../../../src/services/tripPlanningItems';
import { fetchTripCheckpoints, removeTripCheckpoint, type TripCheckpoint } from '../../../src/services/tripCheckpoints';
import { CATEGORY_CONFIG } from '../../../src/lib/circuitCategories';
import { PLANNING_TYPE_CONFIG } from '../../../src/components/TripPlanningSection';

interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string;
  color: string;
  markerType: 'place' | 'planning' | 'checkpoint';
}

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trips } = useTrips();
  const mapRef = useRef<MapView>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [checkpoints, setCheckpoints] = useState<TripCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const trip = trips.find((t) => t.id === id);

  const loadMarkers = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result: MapMarker[] = [];

      // ── 1. Saved places (trip_items → POI lat/lng) ──
      const rawItems = await fetchTripItems(id);
      await Promise.all(
        rawItems.map(async (item) => {
          try {
            const poi = await fetchPOI(item.source_item_id);
            if (poi && poi.latitude != null && poi.longitude != null) {
              const cfg = CATEGORY_CONFIG[item.category];
              result.push({
                id: `place-${item.id}`,
                latitude: poi.latitude,
                longitude: poi.longitude,
                title: poi.title,
                subtitle: cfg.label,
                color: cfg.color,
                markerType: 'place',
              });
            }
          } catch {
            // skip items that fail to load
          }
        }),
      );

      // ── 2. Planning items with coordinates ──
      const planItems = await fetchTripPlanningItems(id);
      for (const item of planItems) {
        if (item.latitude != null && item.longitude != null) {
          const cfg = PLANNING_TYPE_CONFIG[item.item_type];
          result.push({
            id: `plan-${item.id}`,
            latitude: item.latitude,
            longitude: item.longitude,
            title: item.title,
            subtitle: cfg.label,
            color: cfg.color,
            markerType: 'planning',
          });
        }
      }

      // ── 3. Tracking checkpoints ──
      const cpData = await fetchTripCheckpoints(id);
      setCheckpoints(cpData);

      // Include checkpoints in auto-fit
      const allCoords = [
        ...result.map((m) => ({ latitude: m.latitude, longitude: m.longitude })),
        ...cpData.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      ];

      setMarkers(result);

      if (allCoords.length > 0) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(allCoords, {
            edgePadding: { top: 100, right: 60, bottom: 100, left: 60 },
            animated: true,
          });
        }, 600);
        return; // skip the original fitToCoordinates below
      }

    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers]);

  const placeCount = markers.filter((m) => m.markerType === 'place').length;
  const planCount = markers.filter((m) => m.markerType === 'planning').length;
  const cpCount = checkpoints.length;

  const handleRemoveCheckpoint = (cp: TripCheckpoint) => {
    Alert.alert(
      'Remove Checkpoint',
      `Remove "${cp.label ?? 'this checkpoint'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeTripCheckpoint(cp.id);
            setCheckpoints((prev) => prev.filter((c) => c.id !== cp.id));
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 20,
          longitude: 10,
          latitudeDelta: 80,
          longitudeDelta: 80,
        }}
        showsUserLocation
        showsCompass
        showsScale
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
          >
            <View style={[styles.markerDot, { backgroundColor: marker.color }]}>
              <Ionicons
                name={marker.markerType === 'place' ? 'location' : 'calendar'}
                size={14}
                color={Colors.white}
              />
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle} numberOfLines={2}>{marker.title}</Text>
                <Text style={styles.calloutSub}>{marker.subtitle}</Text>
              </View>
            </Callout>
          </Marker>
        ))}

        {checkpoints.map((cp) => (
          <Marker
            key={`cp-${cp.id}`}
            coordinate={{ latitude: cp.latitude, longitude: cp.longitude }}
            onCalloutPress={() => handleRemoveCheckpoint(cp)}
          >
            <View style={[styles.markerDot, styles.markerCheckpoint]}>
              <Ionicons name="flag" size={14} color={Colors.white} />
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle} numberOfLines={2}>
                  {cp.label ?? 'Checkpoint'}
                </Text>
                <Text style={styles.calloutSub}>Tap to remove</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* ── Back button ── */}
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>

      {/* ── Trip title badge ── */}
      {trip ? (
        <View style={styles.titleBadge}>
          <Ionicons name="map-outline" size={14} color={Colors.primary} />
          <Text style={styles.titleBadgeText} numberOfLines={1}>{trip.title}</Text>
        </View>
      ) : null}

      {/* ── Loading overlay ── */}
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : null}

      {/* ── Stats / empty badge ── */}
      {!loading && markers.length === 0 && cpCount === 0 ? (
        <View style={styles.bottomCard}>
          <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>No places with coordinates yet</Text>
        </View>
      ) : !loading ? (
        <View style={styles.bottomCard}>
          {placeCount > 0 ? (
            <View style={styles.statChip}>
              <Ionicons name="pin-outline" size={14} color={Colors.primary} />
              <Text style={styles.statText}>{placeCount} {placeCount === 1 ? 'place' : 'places'}</Text>
            </View>
          ) : null}
          {planCount > 0 ? (
            <View style={[styles.statChip, { backgroundColor: '#F59E0B18' }]}>
              <Ionicons name="calendar-outline" size={14} color="#F59E0B" />
              <Text style={[styles.statText, { color: '#F59E0B' }]}>{planCount} planned</Text>
            </View>
          ) : null}
          {cpCount > 0 ? (
            <View style={[styles.statChip, { backgroundColor: '#EF444418' }]}>
              <Ionicons name="flag-outline" size={14} color="#EF4444" />
              <Text style={[styles.statText, { color: '#EF4444' }]}>{cpCount} {cpCount === 1 ? 'checkpoint' : 'checkpoints'}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },

  /* ── Overlay controls ── */
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 20,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  titleBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 20,
    left: 72,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  titleBadgeText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },

  /* ── Loading ── */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Bottom stats card ── */
  bottomCard: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  statText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  /* ── Markers ── */
  markerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  markerCheckpoint: {
    backgroundColor: '#EF4444',
  },

  /* ── Callout ── */
  callout: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: 10,
    minWidth: 120,
    maxWidth: 190,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  calloutTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  calloutSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
