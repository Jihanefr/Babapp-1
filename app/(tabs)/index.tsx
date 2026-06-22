import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCircuits, type Circuit, usePhotoPicker, useMap, type ExploreMode } from '../../src/contexts';
import {
  WEATHER_LAYERS,
  getWeatherTileUrl,
  type WeatherLayer,
} from '../../src/lib/weather';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';
import { usePhotoScanner, usePhotoPins, type GeoPhoto } from '../../src/hooks';
import { PhotoViewer, ClimateModal, SavePlaceModal } from '../../src/components';
import { createPOI, fetchPOIs, type POIItem } from '../../src/services/poiItems';
import { useAuth } from '../../src/contexts';
import { CATEGORY_CONFIG, guessCategory, type CircuitCategory } from '../../src/lib/circuitCategories';
import { forwardGeocode } from '../../src/lib/geocode';
import { persistPhotoPins } from '../../src/services/photoPins';


const INITIAL_REGION = {
  latitude: 48.5,
  longitude: 10.0,
  latitudeDelta: 20,
  longitudeDelta: 20,
};

const MAX_VISIBLE_MARKERS = 150;

/** Pick at most `maxCount` photos by dividing the space into a grid and taking one per cell. */
function sampleByGrid<T extends { latitude: number; longitude: number }>(
  photos: T[],
  maxCount: number,
): T[] {
  if (photos.length <= maxCount) return photos;
  const lats = photos.map((p) => p.latitude);
  const lngs = photos.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const gridSize = Math.ceil(Math.sqrt(maxCount));
  const grid = new Map<string, T>();
  for (const photo of photos) {
    const row = Math.floor(
      ((photo.latitude - minLat) / (maxLat - minLat + 0.0001)) * gridSize,
    );
    const col = Math.floor(
      ((photo.longitude - minLng) / (maxLng - minLng + 0.0001)) * gridSize,
    );
    const key = `${row}_${col}`;
    if (!grid.has(key)) grid.set(key, photo);
  }
  return Array.from(grid.values()).slice(0, maxCount);
}

export default function ExploreScreen() {
  const { circuits } = useCircuits();
  const { user } = useAuth();
  const photoPicker = usePhotoPicker();
  const isPicking = !!photoPicker.pickingForPoi;
  const mapRef = useRef<MapView>(null);
  const { region, setRegion, mode, setMode, focusedPhoto, clearFocusedPhoto, fromPoi, setFromPoi } = useMap();
  const pendingFocusRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Start with world region so all photos pass the viewport check immediately.
  // Grid sampling caps at MAX_VISIBLE_MARKERS regardless.
  const [mapRegion, setMapRegion] = useState({ latitude: 0, longitude: 0, latitudeDelta: 180, longitudeDelta: 360 });
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [activeLayer, setActiveLayer] = useState<WeatherLayer | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const photoScanner = usePhotoScanner();
  const photoPins = usePhotoPins();
  const [selectedPhoto, setSelectedPhoto] = useState<GeoPhoto | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>('All');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showClimate, setShowClimate] = useState(false);
  const [showSavePlace, setShowSavePlace] = useState(false);
  const [filterCategory, setFilterCategory] = useState<CircuitCategory | null>(null);
  const [climateLocation, setClimateLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pois, setPois] = useState<POIItem[]>([]);
  const [showPhotoPanel, setShowPhotoPanel] = useState(false); // starts closed
  const [manualPhotos, setManualPhotos] = useState<GeoPhoto[]>([]);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [hiddenPhotoIds, setHiddenPhotoIds] = useState<Set<string>>(new Set());
  const [noGpsModalPhoto, setNoGpsModalPhoto] = useState<GeoPhoto | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationResult, setLocationResult] = useState<{ latitude: number; longitude: number; label: string; country: string | null } | null>(null);

  const HIDDEN_KEY = '@hidden_map_photo_ids';

  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY).then((raw) => {
      if (raw) {
        try { setHiddenPhotoIds(new Set(JSON.parse(raw))); } catch {}
      }
    });
  }, []);

  const handleHidePhoto = useCallback((photo: GeoPhoto) => {
    setHiddenPhotoIds((prev) => {
      const next = new Set([...prev, photo.id]);
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const loadPOIs = useCallback(async () => {
    if (!user) return;
    const items = await fetchPOIs(user.id);
    setPois(items);
  }, [user]);

  const handleSearchLocation = useCallback(async () => {
    if (!locationQuery.trim()) return;
    setLocationSearching(true);
    const result = await forwardGeocode(locationQuery.trim());
    setLocationResult(result);
    setLocationSearching(false);
    if (!result) Alert.alert('Not found', 'Could not find that location. Try a different name.');
  }, [locationQuery]);

  const handleConfirmManualLocation = useCallback(async () => {
    if (!user || !noGpsModalPhoto || !locationResult) return;
    setLocationSearching(true);
    const photoWithLocation: GeoPhoto = {
      ...noGpsModalPhoto,
      latitude: locationResult.latitude,
      longitude: locationResult.longitude,
      country: locationResult.country ?? undefined,
    };
    await persistPhotoPins(user.id, [photoWithLocation]);
    await photoPins.load();
    setNoGpsModalPhoto(null);
    setLocationQuery('');
    setLocationResult(null);
    setLocationSearching(false);
  }, [user, noGpsModalPhoto, locationResult, photoPins]);

  useEffect(() => {
    loadPOIs();
  }, [loadPOIs]);

  // Fly to user's location on mount (falls back to Europe default if denied)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        mapRef.current?.animateToRegion(
          {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            latitudeDelta: 0.5,
            longitudeDelta: 0.5,
          },
          800,
        );
      } catch {
        // silent — map stays on Europe default
      }
    })();
  }, []);

  const isCircuits = mode === 'circuits';
  const isPhotos = mode === 'photos';

  // Build photo list: only include photos with valid non-zero GPS.
  // Priority: fresh scanner results > Supabase saved pins > manual picks.
  const allPhotos = useMemo(() => {
    const validScanned = photoScanner.photos.filter(
      (p) => p.latitude && p.longitude,
    );
    const validSaved = photoPins.savedPhotos.filter(
      (p) => p.latitude && p.longitude,
    );
    const base = validScanned.length > 0 ? validScanned : validSaved;
    const combined = manualPhotos.length === 0 ? base : (() => {
      const ids = new Set(base.map((p) => p.id));
      return [
        ...base,
        ...manualPhotos.filter((p) => !ids.has(p.id) && p.latitude && p.longitude),
      ];
    })();
    return hiddenPhotoIds.size > 0
      ? combined.filter((p) => !hiddenPhotoIds.has(p.id))
      : combined;
  }, [photoScanner.photos, photoPins.savedPhotos, manualPhotos, hiddenPhotoIds]);

  // Derive unique month-year values from photos (e.g. "Jan 2024")
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthYearOptions = (() => {
    const set = new Map<string, number>();
    for (const p of allPhotos) {
      const d = new Date(p.creationTime);
      const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      set.set(key, d.getTime());
    }
    return ['All', ...Array.from(set.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k)];
  })();

  // Auto-persist + fly to photos after scan completes
  const didPersistRef = useRef(false);
  useEffect(() => {
    if (
      !photoScanner.scanning &&
      !photoScanner.geocoding &&
      photoScanner.photos.length > 0 &&
      !didPersistRef.current
    ) {
      didPersistRef.current = true;
      photoPins.persist(photoScanner.photos);

      // Fly to fit all scanned photos on the map
      const photos = photoScanner.photos.filter(p => p.latitude && p.longitude);
      if (photos.length > 0) {
        setTimeout(() => {
          if (!mapRef.current) return;
          const lats = photos.map(p => p.latitude);
          const lngs = photos.map(p => p.longitude);
          const latDelta = Math.max(Math.max(...lats) - Math.min(...lats), 0.02);
          const lngDelta = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.02);
          mapRef.current.animateToRegion({
            latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
            longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
            latitudeDelta: latDelta * 3,
            longitudeDelta: lngDelta * 3,
          }, 800);
        }, 500);
      }
    }
  }, [photoScanner.scanning, photoScanner.geocoding, photoScanner.photos.length]);

  // Reset persist flag when user triggers a new scan
  useEffect(() => {
    if (photoScanner.scanning) {
      didPersistRef.current = false;
    }
  }, [photoScanner.scanning]);

  // Debug: log marker state whenever it changes
  useEffect(() => {
    console.log('[Markers] isPhotos:', isPhotos, '| allPhotos:', allPhotos.length, '| scanned GPS:', photoScanner.photos.length, '| saved GPS:', photoPins.savedPhotos.filter(p => p.latitude && p.longitude).length);
  }, [isPhotos, allPhotos.length, photoScanner.photos.length, photoPins.savedPhotos.length]);

  // React to focusPhoto() called from POI detail or PhotoViewer in another screen
  useEffect(() => {
    if (!focusedPhoto) return;
    // Snapshot coords into a ref so they survive clearFocusedPhoto()
    pendingFocusRef.current = { latitude: focusedPhoto.latitude, longitude: focusedPhoto.longitude };
    clearFocusedPhoto();
    // Delay long enough for tab navigation animation to complete
    const timer = setTimeout(() => {
      const coords = pendingFocusRef.current;
      if (!coords) return;
      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 800);
      pendingFocusRef.current = null;
    }, 600);
    return () => clearTimeout(timer);
  }, [focusedPhoto]);

  const handlePickPhotos = useCallback(async () => {
    // Request permissions BEFORE opening picker — Android strips GPS from EXIF
    // if ACCESS_MEDIA_LOCATION is not granted at the time the picker runs.
    if (Platform.OS === 'android') {
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}
      try {
        await PermissionsAndroid.request(
          'android.permission.ACCESS_MEDIA_LOCATION' as any,
        );
      } catch {}
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    setPickingPhotos(true);
    const newGeoPhotos: GeoPhoto[] = [];
    let noGpsCount = 0;

    for (const asset of result.assets) {
      let lat: number | null = null;
      let lng: number | null = null;

      let assetCreationTime: number = Date.now();

      // Primary: read GPS + creation time via MediaLibrary asset info
      if (asset.assetId) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
          assetCreationTime = info.creationTime ?? Date.now();
          const loc = info.location;
          const hasGps = loc != null &&
            loc.latitude != null && loc.longitude != null &&
            (loc.latitude !== 0 || loc.longitude !== 0);
          if (hasGps) {
            lat = loc!.latitude;
            lng = loc!.longitude;
          }
        } catch {}
      }

      // Fallback: EXIF from ImagePicker
      // Android may return GPS as decimal, string, DMS array, or rational fractions
      if (lat === null && asset.exif) {
        const exif = asset.exif as Record<string, unknown>;

        const parseDMS = (val: unknown): number | null => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const n = parseFloat(val);
            return isNaN(n) ? null : n;
          }
          if (Array.isArray(val) && val.length === 3) {
            const parts = val.map((v) => {
              if (typeof v === 'number') return v;
              const s = String(v);
              if (s.includes('/')) {
                const [num, den] = s.split('/').map(Number);
                return den !== 0 ? num / den : 0;
              }
              return parseFloat(s) || 0;
            });
            return parts[0] + parts[1] / 60 + parts[2] / 3600;
          }
          return null;
        };

        let parsedLat = parseDMS(exif['GPSLatitude']);
        let parsedLng = parseDMS(exif['GPSLongitude']);

        if (parsedLat !== null && parsedLng !== null) {
          if (exif['GPSLatitudeRef'] === 'S') parsedLat = -parsedLat;
          if (exif['GPSLongitudeRef'] === 'W') parsedLng = -parsedLng;
          if (parsedLat !== 0 || parsedLng !== 0) {
            lat = parsedLat;
            lng = parsedLng;
          }
        }
      }

      if (lat !== null && lng !== null) {
        const creationTime = assetCreationTime;
        newGeoPhotos.push({
          id: asset.assetId ?? `picked_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          uri: asset.uri,
          latitude: lat,
          longitude: lng,
          creationTime,
          year: new Date(creationTime).getFullYear(),
        });
      } else {
        noGpsCount++;
      }
    }

    setPickingPhotos(false);

    if (newGeoPhotos.length === 0) {
      Alert.alert(
        'No location data',
        `${noGpsCount} photo${noGpsCount !== 1 ? 's have' : ' has'} no GPS coordinates. Make sure location was enabled when the photos were taken.`,
      );
      return;
    }

    if (noGpsCount > 0) {
      Alert.alert(
        'Some photos skipped',
        `${newGeoPhotos.length} photo${newGeoPhotos.length !== 1 ? 's' : ''} pinned on the map. ${noGpsCount} skipped (no GPS).`,
      );
    }

    // Merge into visible photos immediately, then persist
    setManualPhotos((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      return [...prev, ...newGeoPhotos.filter((p) => !ids.has(p.id))];
    });
    await photoPins.persist(newGeoPhotos);

    // Fly to fit all picked photos on the map
    if (newGeoPhotos.length > 0 && mapRef.current) {
      const lats = newGeoPhotos.map((p) => p.latitude);
      const lngs = newGeoPhotos.map((p) => p.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const pad = 0.5;
      mapRef.current.animateToRegion(
        {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max(maxLat - minLat + pad, 0.5),
          longitudeDelta: Math.max(maxLng - minLng + pad, 0.5),
        },
        800,
      );
    }
  }, [photoPins]);

  // Filter by selected month (allPhotos already has valid GPS only)
  const filteredPhotos =
    filterMonth === 'All'
      ? allPhotos
      : allPhotos.filter((p) => {
          const d = new Date(p.creationTime);
          return (
            `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` === filterMonth
          );
        });

  // Viewport culling: only render markers inside the visible region, max MAX_VISIBLE_MARKERS.
  // When there are more than MAX_VISIBLE_MARKERS in the viewport, use grid sampling so the
  // map stays fast even with 600+ photos.
  const viewportPhotos = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const latBuf = latitudeDelta * 0.55;
    const lngBuf = longitudeDelta * 0.55;
    const inView = filteredPhotos.filter(
      (p) =>
        p.latitude >= latitude - latBuf &&
        p.latitude <= latitude + latBuf &&
        p.longitude >= longitude - lngBuf &&
        p.longitude <= longitude + lngBuf,
    );
    return sampleByGrid(inView, MAX_VISIBLE_MARKERS);
  }, [filteredPhotos, mapRegion]);

  // Clamp / close viewer when a hidden photo shrinks the list
  useEffect(() => {
    if (viewerIndex === null) return;
    if (filteredPhotos.length === 0) {
      setViewerIndex(null);
    } else if (viewerIndex >= filteredPhotos.length) {
      setViewerIndex(filteredPhotos.length - 1);
    }
  }, [filteredPhotos.length]);

  const circuitsWithCoords = circuits.filter(
    (c) => c.latitude != null && c.longitude != null &&
      (filterCategory === null || guessCategory(c.title, c.description) === filterCategory),
  );

  const filteredPois = pois.filter(
    (p) => p.latitude != null && p.longitude != null &&
      (filterCategory === null || p.type === filterCategory),
  );

  // Match a photo to a saved POI by coordinates or photo_pin_id
  const getPhotoCategory = useCallback((photo: GeoPhoto) => {
    const match = pois.find((p) => {
      const pinId = photo.id.startsWith('pin_') ? photo.id.replace('pin_', '') : null;
      if (p.photo_pin_id && (p.photo_pin_id === photo.id || p.photo_pin_id === pinId)) return true;
      if (
        Math.abs(Number(p.latitude) - Number(photo.latitude)) < 0.0001 &&
        Math.abs(Number(p.longitude) - Number(photo.longitude)) < 0.0001
      ) return true;
      return false;
    });
    if (!match) return null;
    return CATEGORY_CONFIG[match.type];
  }, [pois]);

  const handleMarkerPress = (circuit: Circuit) => {
    setSelectedCircuit(circuit);
    if (circuit.latitude && circuit.longitude) {
      mapRef.current?.animateToRegion(
        {
          latitude: circuit.latitude,
          longitude: circuit.longitude,
          latitudeDelta: 2,
          longitudeDelta: 2,
        },
        500,
      );
    }
  };

  const toggleLayer = (layer: WeatherLayer) => {
    setActiveLayer((prev) => (prev === layer ? null : layer));
  };

  // Auto-switch to photos mode when picking starts
  useEffect(() => {
    if (isPicking && mode !== 'photos') {
      setMode('photos');
      setSelectedCircuit(null);
      setSelectedPhoto(null);
    }
  }, [isPicking]);

  const handlePhotoMarkerPress = (photo: GeoPhoto) => {
    if (isPicking) {
      photoPicker.togglePhoto(photo);
      return;
    }
    setSelectedPhoto(photo);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={(r) => { setRegion(r); setMapRegion(r); }}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={(e) => {
          if (e.nativeEvent.action === 'marker-press') return;
          setSelectedCircuit(null);
          setSelectedPhoto(null);
          setShowLayerPanel(false);
        }}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setClimateLocation({ latitude, longitude });
          setShowClimate(true);
        }}
      >
        {activeLayer ? (
          <UrlTile
            key={activeLayer}
            urlTemplate={getWeatherTileUrl(activeLayer)}
            maximumZ={15}
            minimumZ={1}
            opacity={0.85}
            flipY={false}
            zIndex={1}
            shouldReplaceMapContent={false}
            tileSize={256}
          />
        ) : null}

        {isCircuits &&
          circuitsWithCoords.map((circuit) => (
            <Marker
              key={circuit.id}
              coordinate={{
                latitude: circuit.latitude!,
                longitude: circuit.longitude!,
              }}
              title={circuit.title}
              description={circuit.location ?? ''}
              onPress={() => handleMarkerPress(circuit)}
              pinColor={Colors.primary}
            />
          ))}

        {filteredPois
            .map((p) => {
              const cat = CATEGORY_CONFIG[p.type];
              return (
                <Marker
                  key={`poi-${p.id}`}
                  coordinate={{
                    latitude: Number(p.latitude),
                    longitude: Number(p.longitude),
                  }}
                  onPress={() => router.push(`/poi/${p.id}`)}
                  tracksViewChanges={false}
                >
                  <View style={styles.poiMarkerWrap}>
                    <View style={[styles.poiMarkerPin, { backgroundColor: cat.color }]}>
                      <Ionicons name={cat.icon as any} size={16} color={Colors.white} />
                    </View>
                    <View style={[styles.poiMarkerTag, { backgroundColor: cat.color }]}>
                      <Text style={styles.poiMarkerTagText}>{cat.label.split(' ').pop()}</Text>
                    </View>
                    <View style={[styles.poiMarkerArrow, { borderTopColor: cat.color }]} />
                  </View>
                </Marker>
              );
            })}

        {isPhotos &&
          viewportPhotos.map((photo) => {
            const selected = isPicking && photoPicker.isSelected(photo.id);
            const catInfo = getPhotoCategory(photo);
            const borderColor = selected
              ? Colors.primary
              : catInfo
              ? catInfo.color
              : Colors.white;
            return (
              <Marker
                key={photo.id}
                coordinate={{
                  latitude: photo.latitude,
                  longitude: photo.longitude,
                }}
                onPress={() => handlePhotoMarkerPress(photo)}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[
                  styles.photoMarker,
                  { borderColor, borderWidth: catInfo || selected ? 3 : 2 },
                ]}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoMarkerImage}
                  />
                  {selected && (
                    <View style={styles.photoMarkerCheck}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    </View>
                  )}
                </View>
              </Marker>
            );
          })}
        {/* Climate pin marker */}
        {climateLocation && (
          <Marker
            coordinate={climateLocation}
            pinColor="#EF4444"
            title="Climate Location"
          />
        )}
      </MapView>

      {/* ── Top bar: title + toggle ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.titleCard}>
            <Ionicons name="compass-outline" size={20} color={Colors.primary} />
            <Text style={styles.title}>BabApp</Text>
          </View>

          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segment, isCircuits && styles.segmentActive]}
              onPress={() => { setMode('circuits'); setSelectedCircuit(null); setSelectedPhoto(null); setShowLayerPanel(false); }}
            >
              <Ionicons
                name="map-outline"
                size={15}
                color={isCircuits ? Colors.white : Colors.text}
              />
              <Text style={[styles.segmentText, isCircuits && styles.segmentTextActive]}>
                Journal
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, isPhotos && styles.segmentActive]}
              onPress={() => { setMode('photos'); setSelectedCircuit(null); setSelectedPhoto(null); setShowLayerPanel(false); }}
            >
              <Ionicons
                name="images-outline"
                size={15}
                color={isPhotos ? Colors.white : Colors.text}
              />
              <Text style={[styles.segmentText, isPhotos && styles.segmentTextActive]}>
                My Photos
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Back to journal pill ── */}
      {fromPoi && (
        <Pressable
          style={styles.backToJournalPill}
          onPress={() => {
            setFromPoi(null);
            router.push(`/poi/${fromPoi.id}?from=circuits` as any);
          }}
        >
          <Ionicons name="arrow-back" size={15} color={Colors.white} />
          <Text style={styles.backToJournalText} numberOfLines={1}>
            Back to {fromPoi.title}
          </Text>
        </Pressable>
      )}

      {/* ── Journal mode: category filter pills ── */}
      {isCircuits && (
        <View style={styles.categoryFilterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilterContent}>
            <Pressable
              style={[styles.categoryPill, filterCategory === null && styles.categoryPillAll]}
              onPress={() => setFilterCategory(null)}
            >
              <Text style={[styles.categoryPillText, filterCategory === null && styles.categoryPillTextActive]}>
                All
              </Text>
            </Pressable>
            {(Object.entries(CATEGORY_CONFIG) as [CircuitCategory, typeof CATEGORY_CONFIG[CircuitCategory]][]).map(([key, cfg]) => {
              const active = filterCategory === key;
              return (
                <Pressable
                  key={key}
                  style={[
                    styles.categoryPill,
                    { borderColor: cfg.color },
                    active && { backgroundColor: cfg.color },
                  ]}
                  onPress={() => setFilterCategory(active ? null : key)}
                >
                  <Ionicons name={cfg.icon as any} size={13} color={active ? Colors.white : cfg.color} />
                  <Text style={[styles.categoryPillText, { color: active ? Colors.white : cfg.color }]}>
                    {cfg.label.split(' ').pop()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── My Photos: month-year dropdown (top-right, below weather btn) ── */}
      {isPhotos && viewerIndex === null && monthYearOptions.length > 1 && !photoScanner.scanning && !photoScanner.geocoding && (
        <View style={styles.monthDropdownWrapper}>
          <Pressable
            style={styles.monthDropdownBtn}
            onPress={() => setShowMonthDropdown((v) => !v)}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
            <Text style={styles.monthDropdownBtnText}>
              {filterMonth === 'All' ? 'All dates' : filterMonth}
            </Text>
            <Ionicons
              name={showMonthDropdown ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textSecondary}
            />
          </Pressable>
          {showMonthDropdown && (
            <View style={styles.monthDropdownList}>
              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                {monthYearOptions.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.monthDropdownItem, filterMonth === m && styles.monthDropdownItemActive]}
                    onPress={() => {
                      setFilterMonth(m);
                      setSelectedPhoto(null);
                      setShowMonthDropdown(false);
                    }}
                  >
                    <Text style={[styles.monthDropdownItemText, filterMonth === m && styles.monthDropdownItemTextActive]}>
                      {m === 'All' ? 'All dates' : m}
                    </Text>
                    {filterMonth === m && (
                      <Ionicons name="checkmark" size={16} color={Colors.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* ── Weather + Climate buttons ── */}
      <View style={styles.weatherBtnContainer}>
        {isPhotos && (
          <Pressable
            style={[
              styles.weatherBtn,
              showLayerPanel && styles.weatherBtnActive,
            ]}
            onPress={() => setShowLayerPanel((v) => !v)}
          >
            <Ionicons
              name="partly-sunny-outline"
              size={22}
              color={showLayerPanel ? Colors.white : Colors.primary}
            />
          </Pressable>
        )}
        <Pressable
          style={[
            styles.weatherBtn,
            showClimate && styles.weatherBtnActive,
            isPhotos && { marginTop: 10 },
          ]}
          onPress={() => setShowClimate(true)}
        >
          <Ionicons
            name="thermometer-outline"
            size={22}
            color={showClimate ? Colors.white : Colors.primary}
          />
        </Pressable>
      </View>

      {showLayerPanel && (
        <View style={styles.layerPanel}>
          <Text style={styles.layerPanelTitle}>Weather Layers</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.layerOptions}>
              {WEATHER_LAYERS.map((layer) => {
                const isActive = activeLayer === layer.key;
                return (
                  <Pressable
                    key={layer.key}
                    style={[
                      styles.layerOption,
                      isActive && styles.layerOptionActive,
                    ]}
                    onPress={() => toggleLayer(layer.key)}
                  >
                    <Ionicons
                      name={layer.icon as any}
                      size={22}
                      color={isActive ? Colors.white : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.layerLabel,
                        isActive && styles.layerLabelActive,
                      ]}
                    >
                      {layer.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {activeLayer && (
            <Pressable
              style={styles.clearLayerBtn}
              onPress={() => setActiveLayer(null)}
            >
              <Text style={styles.clearLayerText}>Clear layer</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Circuits mode: circuit preview ── */}
      {isCircuits && selectedCircuit && (
        <Pressable
          style={styles.circuitPreview}
          onPress={() => router.push(`/circuit/${selectedCircuit.id}`)}
        >
          {selectedCircuit.cover_image_url ? (
            <Image
              source={{ uri: selectedCircuit.cover_image_url }}
              style={styles.previewImage}
            />
          ) : (
            <View style={[styles.previewImage, styles.previewPlaceholder]}>
              <Ionicons name="image-outline" size={24} color={Colors.textLight} />
            </View>
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {selectedCircuit.title}
            </Text>
            {selectedCircuit.location ? (
              <View style={styles.previewRow}>
                <Ionicons name="location-outline" size={13} color={Colors.primary} />
                <Text style={styles.previewLocation} numberOfLines={1}>
                  {selectedCircuit.location}
                </Text>
              </View>
            ) : null}
            <View style={styles.previewMeta}>
              {selectedCircuit.difficulty ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{selectedCircuit.difficulty}</Text>
                </View>
              ) : null}
              {selectedCircuit.distance_km ? (
                <Text style={styles.previewMetaText}>
                  {selectedCircuit.distance_km} km
                </Text>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </Pressable>
      )}

      {/* ── My Photos mode: photo preview card ── */}
      {isPhotos && selectedPhoto && (
        <Pressable
          style={styles.photoPreview}
          onPress={() => {
            const idx = filteredPhotos.findIndex((p) => p.id === selectedPhoto.id);
            if (idx >= 0) setViewerIndex(idx);
          }}
        >
          <Image
            source={{ uri: selectedPhoto.uri }}
            style={styles.photoPreviewImage}
          />
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {formatDate(selectedPhoto.creationTime)}
            </Text>
            <View style={styles.previewRow}>
              <Ionicons name="location-outline" size={13} color={Colors.primary} />
              <Text style={styles.previewLocation} numberOfLines={1}>
                {selectedPhoto.country ?? `${Number(selectedPhoto.latitude).toFixed(4)}, ${Number(selectedPhoto.longitude).toFixed(4)}`}
              </Text>
            </View>
            {(() => {
              const catInfo = getPhotoCategory(selectedPhoto);
              if (!catInfo) return null;
              return (
                <View style={[styles.previewCategoryTag, { backgroundColor: catInfo.color }]}>
                  <Ionicons name={catInfo.icon as any} size={11} color={Colors.white} />
                  <Text style={styles.previewCategoryText}>{catInfo.label}</Text>
                </View>
              );
            })()}
          </View>
          <View style={styles.previewActions}>
            <Pressable
              style={styles.savePlaceBtn}
              onPress={() => setShowSavePlace(true)}
              hitSlop={8}
            >
              <Ionicons name="bookmark-outline" size={18} color={Colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => {
                const idx = filteredPhotos.findIndex((p) => p.id === selectedPhoto.id);
                if (idx >= 0) setViewerIndex(idx);
              }}
              hitSlop={8}
            >
              <Ionicons name="expand-outline" size={20} color={Colors.textLight} />
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* ── Save as Place modal ── */}
      {selectedPhoto && (
        <SavePlaceModal
          visible={showSavePlace}
          onClose={() => setShowSavePlace(false)}
          onSave={async (title: string, type: CircuitCategory) => {
            if (!user) return;
            // Find matching photo_pin to link (by local_asset_id OR pin row id)
            const pinRowId = selectedPhoto.id.startsWith('pin_')
              ? selectedPhoto.id.replace('pin_', '')
              : null;
            const matchingPin = photoPins.pins.find(
              (p) => p.local_asset_id === selectedPhoto.id ||
                     (pinRowId && p.id === pinRowId),
            );
            // Only pass sourceUri for local files (not signed URLs)
            const isLocalFile = selectedPhoto.uri.startsWith('file://') ||
                                selectedPhoto.uri.startsWith('ph://') ||
                                selectedPhoto.uri.startsWith('asset');
            await createPOI({
              userId: user.id,
              photoPinId: matchingPin?.id,
              title,
              type,
              latitude: Number(selectedPhoto.latitude),
              longitude: Number(selectedPhoto.longitude),
              country: selectedPhoto.country ?? null,
              thumbnailPath: matchingPin?.storage_path ?? null,
              sourceUri: isLocalFile ? selectedPhoto.uri : undefined,
              takenAt: selectedPhoto.creationTime,
            });
          }}
        />
      )}

      {/* ── My Photos mode: reopen panel button ── */}
      {isPhotos && !selectedPhoto && !showPhotoPanel && (
        <Pressable
          style={styles.photoPanelReopenBtn}
          onPress={() => setShowPhotoPanel(true)}
        >
          <Ionicons name="images-outline" size={18} color={Colors.primary} />
          <Text style={styles.photoPanelReopenText}>
            {allPhotos.length > 0
              ? viewportPhotos.length < allPhotos.length
                ? `${viewportPhotos.length} / ${allPhotos.length} photos`
                : `${allPhotos.length} photos`
              : 'Photos'}
          </Text>
        </Pressable>
      )}

      {/* ── My Photos mode: scan UI ── */}
      {isPhotos && !selectedPhoto && showPhotoPanel && (
        <View style={styles.photosPanel}>
          {/* drag handle */}
          <View style={styles.photosPanelHandle} />

          {/* header row */}
          <View style={styles.photosPanelHeader}>
            <View style={styles.photosPanelTitleRow}>
              <Ionicons name="images-outline" size={18} color={Colors.primary} />
              <Text style={styles.photosPanelTitle}>My Photos</Text>
            </View>
            <Pressable onPress={() => setShowPhotoPanel(false)} hitSlop={12} style={styles.photosPanelCloseBtn}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* ── busy states ── */}
          {(photoScanner.scanning || photoScanner.geocoding || photoPins.persisting || pickingPhotos) ? (
            <View style={styles.photosPanelBusy}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.photosPanelBusyTitle}>
                  {photoScanner.scanning
                    ? `Scanning ${photoScanner.scanned}${photoScanner.total > 0 ? ` / ${Math.min(photoScanner.total, 1000)}` : ''}…`
                    : photoScanner.geocoding
                    ? `Detecting countries… ${photoScanner.geocodeProgress}%`
                    : photoPins.persisting
                    ? `Saving ${photoPins.persistProgress} / ${photoPins.persistTotal}…`
                    : 'Reading photo locations…'}
                </Text>
                {photoScanner.scanning || photoScanner.geocoding ? (
                  <Text style={styles.photosPanelBusySub}>
                    {photoScanner.photos.length} geotagged photos found
                  </Text>
                ) : null}
              </View>
            </View>

          ) : photoScanner.permissionDenied ? (
            /* ── permission denied ── */
            <View style={styles.photosPanelBusy}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.photosPanelBusyTitle}>Photo access denied</Text>
                <Text style={styles.photosPanelBusySub}>Allow access in Settings to see your photos on the map.</Text>
              </View>
              <Pressable style={styles.panelPillBtn} onPress={() => Linking.openSettings()}>
                <Text style={styles.panelPillBtnText}>Settings</Text>
              </Pressable>
            </View>

          ) : allPhotos.length > 0 ? (
            /* ── ready with photos ── */
            <>
              {/* stat row */}
              <View style={styles.photosPanelStatRow}>
                <View style={styles.photosPanelStat}>
                  <Text style={styles.photosPanelStatNum}>{allPhotos.length}</Text>
                  <Text style={styles.photosPanelStatLabel}>on map</Text>
                </View>
                {photoScanner.scanned > 0 && (
                  <View style={[styles.photosPanelStat, styles.photosPanelStatMid]}>
                    <Text style={styles.photosPanelStatNum}>{photoScanner.scanned}</Text>
                    <Text style={styles.photosPanelStatLabel}>scanned</Text>
                  </View>
                )}
                {viewportPhotos.length < allPhotos.length && (
                  <View style={styles.photosPanelStat}>
                    <Text style={styles.photosPanelStatNum}>{viewportPhotos.length}</Text>
                    <Text style={styles.photosPanelStatLabel}>in view</Text>
                  </View>
                )}
              </View>

              {/* primary action */}
              <Pressable
                style={styles.photosPanelPrimary}
                onPress={() => {
                  const photos = allPhotos.filter(p => p.latitude && p.longitude);
                  if (photos.length === 0) return;
                  setShowPhotoPanel(false);
                  setTimeout(() => {
                    if (!mapRef.current) return;
                    const lats = photos.map(p => p.latitude);
                    const lngs = photos.map(p => p.longitude);
                    const latDelta = Math.max(Math.max(...lats) - Math.min(...lats), 0.02);
                    const lngDelta = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.02);
                    mapRef.current.animateToRegion({
                      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
                      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
                      latitudeDelta: latDelta * 3,
                      longitudeDelta: lngDelta * 3,
                    }, 600);
                  }, 200);
                }}
              >
                <Ionicons name="locate-outline" size={16} color={Colors.white} />
                <Text style={styles.photosPanelPrimaryText}>Fly to All Photos</Text>
              </Pressable>

              {/* secondary actions grid */}
              <View style={styles.photosPanelGrid}>
                <Pressable style={styles.panelGridBtn} onPress={() => photoScanner.scan(user?.id, false)}>
                  <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                  <Text style={styles.panelGridBtnText}>Scan New</Text>
                </Pressable>
                <Pressable style={styles.panelGridBtn} onPress={() => photoScanner.scan(user?.id, true)}>
                  <Ionicons name="scan-outline" size={16} color={Colors.primary} />
                  <Text style={styles.panelGridBtnText}>Rescan All</Text>
                </Pressable>
                <Pressable style={styles.panelGridBtn} onPress={handlePickPhotos}>
                  <Ionicons name="images-outline" size={16} color={Colors.primary} />
                  <Text style={styles.panelGridBtnText}>Pick Photos</Text>
                </Pressable>
              </View>

              {/* no-GPS chip */}
              {photoScanner.noGpsPhotos.length > 0 && (
                <Pressable
                  style={styles.noGpsChip}
                  onPress={() => {
                    setNoGpsModalPhoto(photoScanner.noGpsPhotos[0]);
                    setLocationQuery('');
                    setLocationResult(null);
                  }}
                >
                  <Ionicons name="location-outline" size={13} color="#F59E0B" />
                  <Text style={styles.noGpsChipText}>
                    {photoScanner.noGpsPhotos.length} photo{photoScanner.noGpsPhotos.length > 1 ? 's' : ''} without GPS — tap to add location
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color="#F59E0B" />
                </Pressable>
              )}
            </>

          ) : (
            /* ── empty / first launch ── */
            <>
              <Text style={styles.photosPanelEmptySub}>
                {photoPins.loading ? 'Loading your saved photos…' : 'Scan your gallery to place photos on the map.'}
              </Text>
              {photoPins.loading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 12 }} />
              ) : (
                <View style={styles.photosPanelGrid}>
                  <Pressable style={[styles.panelGridBtn, { flex: 1.5 }]} onPress={() => photoScanner.scan(user?.id, false)}>
                    <Ionicons name="scan-outline" size={16} color={Colors.primary} />
                    <Text style={styles.panelGridBtnText}>Scan Gallery</Text>
                  </Pressable>
                  <Pressable style={styles.panelGridBtn} onPress={handlePickPhotos}>
                    <Ionicons name="images-outline" size={16} color={Colors.primary} />
                    <Text style={styles.panelGridBtnText}>Pick Photos</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Picking mode bar ── */}
      {isPicking && isPhotos && (
        <View style={styles.pickingBar}>
          <Pressable style={styles.pickingCancelBtn} onPress={() => {
            photoPicker.cancelPicking();
            router.back();
          }}>
            <Text style={styles.pickingCancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.pickingCount}>
            {photoPicker.selectedPhotos.length} photo{photoPicker.selectedPhotos.length !== 1 ? 's' : ''} selected
          </Text>
          <Pressable
            style={[styles.pickingDoneBtn, photoPicker.selectedPhotos.length === 0 && { opacity: 0.4 }]}
            onPress={() => {
              if (photoPicker.selectedPhotos.length === 0) return;
              photoPicker.finishPicking();
              router.back();
            }}
            disabled={photoPicker.selectedPhotos.length === 0}
          >
            <Text style={styles.pickingDoneText}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* ── Recenter button (always visible) ── */}
      <Pressable
        style={styles.recenterBtn}
        onPress={() => {
          mapRef.current?.animateToRegion(INITIAL_REGION, 500);
          setSelectedCircuit(null);
        }}
      >
        <Ionicons name="locate-outline" size={22} color={Colors.primary} />
      </Pressable>

      {/* ── Full-screen photo viewer ── */}
      {viewerIndex !== null && filteredPhotos.length > 0 && (
        <View style={StyleSheet.absoluteFill}>
          <PhotoViewer
            photos={filteredPhotos}
            initialIndex={viewerIndex}
            onClose={() => setViewerIndex(null)}
            onDelete={handleHidePhoto}
            onSavePlace={async (photo, category) => {
              if (!user) return;
              const pinRowId = photo.id.startsWith('pin_') ? photo.id.replace('pin_', '') : null;
              const matchingPin = photoPins.pins.find(
                (p) => p.local_asset_id === photo.id || (pinRowId && p.id === pinRowId),
              );
              const isLocalFile = photo.uri.startsWith('file://') ||
                                  photo.uri.startsWith('ph://') ||
                                  photo.uri.startsWith('asset');
              await createPOI({
                userId: user.id,
                photoPinId: matchingPin?.id,
                title: CATEGORY_CONFIG[category].label,
                type: category,
                latitude: Number(photo.latitude),
                longitude: Number(photo.longitude),
                country: photo.country ?? null,
                thumbnailPath: matchingPin?.storage_path ?? null,
                sourceUri: isLocalFile ? photo.uri : undefined,
                takenAt: photo.creationTime,
              });
              loadPOIs();
            }}
            getPhotoCategory={getPhotoCategory}
          />
        </View>
      )}

      {/* ── Climate modal ── */}
      <ClimateModal
        visible={showClimate}
        onClose={() => setShowClimate(false)}
        location={climateLocation}
      />

      {/* ── Manual location modal for photos without GPS ── */}
      <Modal
        visible={!!noGpsModalPhoto}
        transparent
        animationType="slide"
        onRequestClose={() => setNoGpsModalPhoto(null)}
      >
        <View style={styles.noGpsModalOverlay}>
          <View style={styles.noGpsModalSheet}>
            <Text style={styles.noGpsModalTitle}>Add Location</Text>
            <Text style={styles.noGpsModalSub}>This photo has no GPS. Search for a place to assign it.</Text>
            {noGpsModalPhoto && (
              <Image source={{ uri: noGpsModalPhoto.uri }} style={styles.noGpsModalThumb} resizeMode="cover" />
            )}
            <View style={styles.noGpsSearchRow}>
              <TextInput
                style={styles.noGpsInput}
                value={locationQuery}
                onChangeText={setLocationQuery}
                placeholder="e.g. Paris, Eiffel Tower..."
                placeholderTextColor={Colors.textLight}
                returnKeyType="search"
                onSubmitEditing={handleSearchLocation}
              />
              <Pressable style={styles.noGpsSearchBtn} onPress={handleSearchLocation} disabled={locationSearching}>
                {locationSearching
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Ionicons name="search" size={20} color={Colors.white} />}
              </Pressable>
            </View>
            {locationResult && (
              <View style={styles.noGpsResultRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                <Text style={styles.noGpsResultText} numberOfLines={2}>{locationResult.label}</Text>
              </View>
            )}
            <Pressable
              style={[styles.noGpsConfirmBtn, !locationResult && { opacity: 0.4 }]}
              onPress={handleConfirmManualLocation}
              disabled={!locationResult || locationSearching}
            >
              <Text style={styles.noGpsConfirmBtnText}>Save Location to Map</Text>
            </Pressable>
            <Pressable style={styles.noGpsCancelBtn} onPress={() => setNoGpsModalPhoto(null)}>
              <Text style={styles.noGpsCancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  /* ── Top bar ── */
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    left: Spacing.md,
    right: Spacing.md,
  },
  topBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    ...Shadow.card,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  /* ── Segmented control ── */
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    padding: 3,
    ...Shadow.card,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  segmentActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  segmentTextActive: {
    color: Colors.white,
  },
  /* ── Weather button ── */
  weatherBtnContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 93,
    right: Spacing.md,
  },
  weatherBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.card,
  },
  weatherBtnActive: {
    backgroundColor: Colors.primary,
  },
  /* ── Layer panel ── */
  layerPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 160 : 145,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadow.card,
  },
  layerPanelTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  layerOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  layerOption: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 76,
    height: 72,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  layerOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  layerLabel: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  layerLabelActive: {
    color: Colors.white,
  },
  clearLayerBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'center',
  },
  clearLayerText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    fontWeight: FontWeight.semibold,
  },
  /* ── Circuit preview ── */
  circuitPreview: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 16,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    ...Shadow.card,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
  },
  previewPlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  previewTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  previewLocation: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    marginLeft: 3,
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  previewMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  /* ── Month dropdown ── */
  monthDropdownWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 93,
    left: Spacing.md,
    zIndex: 20,
  },
  monthDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...Shadow.card,
  },
  monthDropdownBtnText: {
    fontSize: 14,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  monthDropdownList: {
    marginTop: 4,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadow.card,
    overflow: 'hidden',
    minWidth: 160,
  },
  monthDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  monthDropdownItemActive: {
    backgroundColor: '#F0FDF4',
  },
  monthDropdownItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  monthDropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  /* ── Photos Panel (bottom sheet) ── */
  photosPanel: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: 10,
    ...Shadow.card,
  },
  photosPanelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  photosPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  photosPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  photosPanelTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  photosPanelCloseBtn: {
    padding: 4,
  },
  /* busy / loading row */
  photosPanelBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 4,
  },
  photosPanelBusyTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  photosPanelBusySub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  /* stat row */
  photosPanelStatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
  },
  photosPanelStat: {
    flex: 1,
    alignItems: 'center',
  },
  photosPanelStatMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
  },
  photosPanelStatNum: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  photosPanelStatLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  /* primary button */
  photosPanelPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 13,
    marginBottom: 10,
    ...Shadow.button,
  },
  photosPanelPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.base,
  },
  /* 3-column grid of secondary actions */
  photosPanelGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  panelGridBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  panelGridBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  /* inline pill button (used in permission-denied row) */
  panelPillBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  panelPillBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: FontWeight.semibold,
  },
  /* empty state subtitle */
  photosPanelEmptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 19,
  },
  photoPanelClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
  photoPanelReopenBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...Shadow.card,
  },
  photoPanelReopenText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  photoMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.white,
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    ...Shadow.card,
  },
  photoMarkerImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  photoPreview: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 30 : 16,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    ...Shadow.card,
  },
  photoPreviewImage: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
  },
  scanBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  scanBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  scanBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  scanBtnSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 0,
  },
  scanBtnTextSecondary: {
    color: Colors.primary,
  },
  /* ── Preview actions (bookmark + expand) ── */
  previewActions: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  savePlaceBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* ── Photo marker selection ── */
  photoMarkerSelected: {
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  photoMarkerCheck: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.white,
    borderRadius: 10,
  },
  /* ── Picking bar ── */
  pickingBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.card,
  },
  pickingCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickingCancelText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  pickingCount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  pickingDoneBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
  },
  pickingDoneText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  /* ── Preview category tag ── */
  previewCategoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  previewCategoryText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  /* ── POI markers ── */
  poiMarkerWrap: {
    alignItems: 'center',
  },
  poiMarkerPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: Colors.white,
    ...Shadow.card,
  },
  poiMarkerTag: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  poiMarkerTagText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: FontWeight.bold,
  },
  poiMarkerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  /* ── Recenter ── */
  recenterBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 96,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.card,
  },
  /* ── Category filter bar (Journal mode) ── */
  categoryFilterBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 93,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  categoryFilterContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  categoryPillAll: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  categoryPillTextActive: {
    color: Colors.white,
  },
  backToJournalPill: {
    position: 'absolute',
    top: 108,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    zIndex: 20,
    ...Shadow.card,
  },
  backToJournalText: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
    maxWidth: 200,
  },
  noGpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8,
    alignSelf: 'center',
  },
  noGpsChipText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: FontWeight.semibold,
  },
  noGpsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  noGpsModalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  noGpsModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  noGpsModalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  noGpsModalThumb: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.border,
  },
  noGpsSearchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  noGpsInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noGpsSearchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noGpsResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  noGpsResultText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  noGpsConfirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  noGpsConfirmBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  noGpsCancelBtn: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  noGpsCancelBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
});
