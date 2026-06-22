import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import { getMonthlyClimate, type ClimateResult } from '../services/climate';
import { getDetailedAddress } from '../lib/geocode';

const { width: SCREEN_W } = Dimensions.get('window');

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface ClimateLocation {
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  location: ClimateLocation | null;
}

function buildMetrics(data: ClimateResult | null) {
  if (!data) {
    return [
      { icon: 'thermometer-outline', label: 'Avg High', value: '—', unit: '°C' },
      { icon: 'snow-outline', label: 'Avg Low', value: '—', unit: '°C' },
      { icon: 'rainy-outline', label: 'Precipitation', value: '—', unit: 'mm' },
      { icon: 'water-outline', label: 'Rainy Days', value: '—', unit: 'days' },
      { icon: 'speedometer-outline', label: 'Wind Speed', value: '—', unit: 'km/h' },
      { icon: 'sunny-outline', label: 'Sunshine', value: '—', unit: 'hrs' },
    ];
  }
  return [
    { icon: 'thermometer-outline', label: 'Avg High', value: `${data.avgHigh}`, unit: '°C' },
    { icon: 'snow-outline', label: 'Avg Low', value: `${data.avgLow}`, unit: '°C' },
    { icon: 'rainy-outline', label: 'Precipitation', value: `${data.precipitation}`, unit: 'mm' },
    { icon: 'water-outline', label: 'Rainy Days', value: `${data.rainyDays}`, unit: 'days' },
    { icon: 'speedometer-outline', label: 'Wind Speed', value: `${data.windSpeed}`, unit: 'km/h' },
    { icon: 'sunny-outline', label: 'Sunshine', value: `${data.sunshine}`, unit: 'hrs' },
  ];
}

const DEBOUNCE_MS = 400;

export function ClimateModal({ visible, onClose, location }: Props) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [climateData, setClimateData] = useState<ClimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate months: 6 back + 12 forward
  const months: { month: number; year: number; label: string }[] = [];
  for (let i = -6; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({
      month: d.getMonth(),
      year: d.getFullYear(),
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    });
  }

  const selectedKey = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  const fetchClimate = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getMonthlyClimate({
        latitude: location.latitude,
        longitude: location.longitude,
        year: selectedYear,
        month: selectedMonth,
      });
      setClimateData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load climate data');
      setClimateData(null);
    } finally {
      setLoading(false);
    }
  }, [location?.latitude, location?.longitude, selectedMonth, selectedYear]);

  // Debounced fetch when location or month changes
  useEffect(() => {
    if (!visible || !location) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchClimate, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [visible, fetchClimate]);

  // Reverse geocode location for display name
  useEffect(() => {
    if (!visible || !location) { setLocationName(null); return; }
    let cancelled = false;
    getDetailedAddress(location.latitude, location.longitude).then((result) => {
      if (!cancelled) {
        const parts: string[] = [];
        if (result.city) parts.push(result.city);
        if (result.country) parts.push(result.country);
        setLocationName(parts.length > 0 ? parts.join(', ') : result.address);
      }
    });
    return () => { cancelled = true; };
  }, [visible, location?.latitude, location?.longitude]);

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setClimateData(null);
      setError(null);
      setLocationName(null);
    }
  }, [visible]);

  const metrics = buildMetrics(climateData);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Climate</Text>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Typical conditions based on historical climate data
            </Text>
          </View>

          {/* Location info */}
          <View style={styles.locationCard}>
            <Ionicons name="location" size={18} color={Colors.primary} />
            {location ? (
              <Text style={styles.locationText}>
                {locationName ?? `${Number(location.latitude).toFixed(3)}°, ${Number(location.longitude).toFixed(3)}°`}
              </Text>
            ) : (
              <Text style={styles.locationPlaceholder}>
                Long-press on the map to choose a location
              </Text>
            )}
          </View>

          {/* Month-Year horizontal selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthBarContent}
            style={styles.monthBar}
          >
            {months.map((m) => {
              const key = `${MONTH_NAMES[m.month]} ${m.year}`;
              const isActive = key === selectedKey;
              return (
                <Pressable
                  key={key}
                  style={[styles.monthPill, isActive && styles.monthPillActive]}
                  onPress={() => {
                    setSelectedMonth(m.month);
                    setSelectedYear(m.year);
                  }}
                >
                  <Text style={[styles.monthPillMonth, isActive && styles.monthPillTextActive]}>
                    {MONTH_NAMES[m.month]}
                  </Text>
                  <Text style={[styles.monthPillYear, isActive && styles.monthPillTextActive]}>
                    {m.year}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Loading / Error / Metrics */}
          {loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.stateText}>Loading climate data…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateContainer}>
              <Ionicons name="alert-circle-outline" size={28} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={fetchClimate}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : !location ? (
            <View style={styles.stateContainer}>
              <Ionicons name="finger-print-outline" size={28} color={Colors.textLight} />
              <Text style={styles.stateText}>Long-press on the map to select a location</Text>
            </View>
          ) : (
            <View style={styles.metricsGrid}>
              {metrics.map((metric) => (
                <View key={metric.label} style={styles.metricCard}>
                  <Ionicons name={metric.icon as any} size={22} color={Colors.primary} />
                  <Text style={styles.metricValue}>
                    {metric.value}<Text style={styles.metricUnit}> {metric.unit}</Text>
                  </Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            Typical conditions based on historical climate data; not a forecast.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* Location */
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  locationText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  locationPlaceholder: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  /* Month bar */
  monthBar: {
    marginBottom: Spacing.md,
    maxHeight: 64,
  },
  monthBarContent: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
    alignItems: 'center',
  },
  monthPill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
  },
  monthPillActive: {
    backgroundColor: Colors.primary,
  },
  monthPillMonth: {
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  monthPillYear: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  monthPillTextActive: {
    color: Colors.white,
  },
  /* Metrics */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: 10,
  },
  metricCard: {
    width: (SCREEN_W - Spacing.lg * 2 - 20) / 3,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  /* State containers (loading, error, empty) */
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  stateText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  retryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  /* Disclaimer */
  disclaimer: {
    fontSize: 10,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
