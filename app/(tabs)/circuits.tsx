import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components';
import { useCircuits, useAuth, type Circuit } from '../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';
import {
  guessCategory,
  CATEGORY_CONFIG,
  type CircuitCategory,
} from '../../src/lib/circuitCategories';
import { fetchPOIsPaged, deletePOI, publishPOI, type POIItem } from '../../src/services/poiItems';
import { usePaginated } from '../../src/hooks/usePaginated';

type FilterOption = 'all' | CircuitCategory;

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'All' },
  ...(['see', 'stay', 'eat', 'do'] as CircuitCategory[]).map((key) => ({
    key,
    label: CATEGORY_CONFIG[key].label,
  })),
];

type ListItem =
  | { kind: 'circuit'; data: Circuit & { category: CircuitCategory } }
  | { kind: 'poi'; data: POIItem };

export default function CircuitsScreen() {
  const { circuits, loading, fetchCircuits } = useCircuits();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterOption>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const poiFetcher = useCallback(
    (cursor: string | null, limit: number) => {
      if (!user) return Promise.resolve({ items: [], nextCursor: null, hasMore: false });
      return fetchPOIsPaged(user.id, cursor, limit);
    },
    [user],
  );

  const {
    items: pois,
    loading: poisLoading,
    refreshing: poisRefreshing,
    loadNext: loadMorePOIs,
    refresh: refreshPOIs,
    reset: resetPOIs,
  } = usePaginated<POIItem>(poiFetcher, 20);

  useEffect(() => { refreshPOIs(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePublish = async (item: POIItem) => {
    const next = !item.is_published;
    await publishPOI(item.id, next);
    refreshPOIs();
  };

  const categorisedCircuits = useMemo(
    () =>
      circuits.map((c) => ({
        ...c,
        category: guessCategory(c.title, c.description),
      })),
    [circuits],
  );

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    pois.forEach((p) => { if (p.country) set.add(p.country); });
    return ['all', ...Array.from(set).sort()];
  }, [pois]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    pois.forEach((p) => {
      if (p.taken_at) set.add(String(new Date(p.taken_at).getFullYear()));
    });
    return ['all', ...Array.from(set).sort((a, b) => Number(b) - Number(a))];
  }, [pois]);

  const filteredItems = useMemo(() => {
    const circuitItems: ListItem[] = categorisedCircuits
      .filter((c) => filter === 'all' || c.category === filter)
      .map((c) => ({ kind: 'circuit' as const, data: c }));

    const poiItems: ListItem[] = pois
      .filter((p) => filter === 'all' || p.type === filter)
      .filter((p) => countryFilter === 'all' || p.country === countryFilter)
      .filter((p) => {
        if (yearFilter === 'all') return true;
        if (!p.taken_at) return false;
        return String(new Date(p.taken_at).getFullYear()) === yearFilter;
      })
      .map((p) => ({ kind: 'poi' as const, data: p }));

    return [...poiItems, ...circuitItems];
  }, [categorisedCircuits, pois, filter, countryFilter, yearFilter]);

  const totalCount = circuits.length + pois.length;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'circuit') return renderCircuit(item.data);
    return renderPOI(item.data);
  };

  const renderCircuit = (item: Circuit & { category: CircuitCategory }) => {
    const cat = CATEGORY_CONFIG[item.category];
    return (
    <Pressable
      style={({ pressed }) => [styles.circuitCard, pressed && styles.cardPressed]}
      onPress={() => router.push(`/circuit/${item.id}`)}
    >
      {item.cover_image_url ? (
        <Image source={{ uri: item.cover_image_url }} style={styles.circuitImage} />
      ) : (
        <View style={[styles.circuitImage, styles.imagePlaceholder]}>
          <Ionicons name="image-outline" size={32} color={Colors.textLight} />
        </View>
      )}
      <View style={styles.circuitInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.circuitTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.categoryTag, { backgroundColor: cat.color + '18' }]}>
            <Ionicons name={cat.icon as any} size={11} color={cat.color} />
            <Text style={[styles.categoryTagText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>
        {item.location ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={14} color={Colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          {item.difficulty ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.difficulty}</Text>
            </View>
          ) : null}
          {item.duration_hours ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{item.duration_hours}h</Text>
            </View>
          ) : null}
          {item.distance_km ? (
            <View style={styles.metaItem}>
              <Ionicons name="walk-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{item.distance_km} km</Text>
            </View>
          ) : null}
        </View>
        {item.description ? (
          <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
    </Pressable>
    );
  };

  const renderPOI = (item: POIItem) => {
    const cat = CATEGORY_CONFIG[item.type];
    return (
      <Pressable
        style={({ pressed }) => [styles.circuitCard, pressed && styles.cardPressed]}
        onPress={() => router.push(`/poi/${item.id}?from=circuits`)}
      >
        <View style={[styles.categoryAccent, { backgroundColor: cat.color }]} />
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.circuitImage} />
        ) : (
          <View style={[styles.circuitImage, styles.imagePlaceholder]}>
            <Ionicons name={cat.icon as any} size={32} color={cat.color} />
          </View>
        )}
        <View style={styles.circuitInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.circuitTitle} numberOfLines={1}>{item.title}</Text>
            <View style={[styles.categoryTag, { backgroundColor: cat.color + '18' }]}>
              <Ionicons name={cat.icon as any} size={11} color={cat.color} />
              <Text style={[styles.categoryTagText, { color: cat.color }]}>{cat.label}</Text>
            </View>
          </View>
          {item.country ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={14} color={Colors.primary} />
              <Text style={styles.locationText} numberOfLines={1}>{item.country}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.poiBadge}>
              <Ionicons name="bookmark" size={11} color={Colors.primary} />
              <Text style={styles.poiBadgeText}>My Place</Text>
            </View>
            <Pressable
              style={[styles.visibilityBadge, item.is_published && styles.visibilityBadgePublished]}
              onPress={(e) => { e.stopPropagation(); handleTogglePublish(item); }}
              hitSlop={8}
            >
              <Ionicons
                name={item.is_published ? 'globe-outline' : 'lock-closed-outline'}
                size={11}
                color={item.is_published ? '#4BAF79' : Colors.textSecondary}
              />
              <Text style={[styles.visibilityBadgeText, item.is_published && styles.visibilityBadgeTextPublished]}>
                {item.is_published ? 'Published' : 'Private'}
              </Text>
            </Pressable>
          </View>
          {item.taken_at ? (
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.takenAtText}>
                {new Date(item.taken_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>🏞️</Text>
        <Text style={styles.emptyTitle}>No circuits yet</Text>
        <Text style={styles.emptyText}>Public circuits will appear here.</Text>
      </View>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Journal</Text>
        <Text style={styles.headerDesc}>Your places and circuits</Text>
        <Text style={styles.subtitle}>{filteredItems.length} of {totalCount} item{totalCount !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterPillText, filter === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {countryOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}
        >
          {countryOptions.map((c) => (
            <Pressable
              key={c}
              style={[styles.filterPill, countryFilter === c && styles.filterPillActive]}
              onPress={() => setCountryFilter(c)}
            >
              <Text style={[styles.filterPillText, countryFilter === c && styles.filterPillTextActive]}>
                {c === 'all' ? '🌍 All Countries' : c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {yearOptions.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}
        >
          {yearOptions.map((y) => (
            <Pressable
              key={y}
              style={[styles.filterPill, yearFilter === y && styles.filterPillActive]}
              onPress={() => setYearFilter(y)}
            >
              <Text style={[styles.filterPillText, yearFilter === y && styles.filterPillTextActive]}>
                {y === 'all' ? '📅 All Years' : y}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {(loading || poisLoading) && circuits.length === 0 && pois.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.data.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={totalCount === 0 ? styles.emptyList : styles.list}
          onEndReached={loadMorePOIs}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={loading || poisRefreshing}
              onRefresh={() => { fetchCircuits(true); refreshPOIs(); }}
              tintColor={Colors.primary}
            />
          }
          ListFooterComponent={
            poisLoading && pois.length > 0
              ? () => <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 16 }} />
              : null
          }
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.hero,
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
    marginTop: Spacing.xs,
  },
  filterBar: {
    marginBottom: Spacing.md,
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
  emptyList: {
    flex: 1,
  },
  circuitCard: {
    flexDirection: 'column',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  categoryAccent: {
    height: 4,
    width: '100%',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  circuitImage: {
    width: '100%',
    height: 140,
  },
  imagePlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circuitInfo: {
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
  circuitTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  descText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  poiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  poiBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.border + '60',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  visibilityBadgePublished: {
    backgroundColor: '#4BAF7918',
  },
  visibilityBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  visibilityBadgeTextPublished: {
    color: '#4BAF79',
  },
  takenAtText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
});
