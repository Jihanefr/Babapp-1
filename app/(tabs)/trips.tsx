import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper, Button } from '../../src/components';
import { useTrips, type Trip } from '../../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../src/constants';

export default function TripsScreen() {
  const { trips, loading, fetchTrips } = useTrips();

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderTrip = ({ item }: { item: Trip }) => (
    <Pressable
      style={({ pressed }) => [styles.tripCard, pressed && styles.cardPressed]}
      onPress={() => router.push(`/trip/${item.id}`)}
    >
      {item.cover_image_url ? (
        <Image source={{ uri: item.cover_image_url }} style={styles.tripImage} />
      ) : (
        <View style={[styles.tripImage, styles.tripImagePlaceholder]}>
          <Ionicons name="image-outline" size={32} color={Colors.textLight} />
        </View>
      )}
      <View style={styles.tripInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.tripTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.typeBadge, item.trip_type === 'sharing' && styles.typeBadgeSharing]}>
            <Text style={styles.typeBadgeText}>
              {item.trip_type === 'planning' ? '📋 Planning' : '✈️ Sharing'}
            </Text>
          </View>
        </View>
        {item.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={Colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
          </View>
        ) : null}
        {item.start_date ? (
          <Text style={styles.dateText}>
            {formatDate(item.start_date)}
            {item.end_date ? ` — ${formatDate(item.end_date)}` : ''}
          </Text>
        ) : null}
        {item.description ? (
          <Text style={styles.descriptionText} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>✈️</Text>
        <Text style={styles.emptyTitle}>No trips yet</Text>
        <Text style={styles.emptyText}>Create your first trip to get started!</Text>
      </View>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Trips</Text>
          <Text style={styles.headerDesc}>Multi-day travel plans</Text>
          <Text style={styles.subtitle}>{trips.length} trip{trips.length !== 1 ? 's' : ''}</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/create-trip')}
        >
          <Ionicons name="add" size={28} color={Colors.white} />
        </Pressable>
      </View>

      {loading && trips.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={trips.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => fetchTrips(true)} tintColor={Colors.primary} />
          }
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    color: Colors.textLight,
    marginTop: 2,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.button,
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
  tripCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.card,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  tripImage: {
    width: '100%',
    height: 160,
  },
  tripImagePlaceholder: {
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripInfo: {
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  tripTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: Colors.primary + '18',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeSharing: {
    backgroundColor: Colors.accent + '22',
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    marginLeft: 4,
  },
  dateText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  descriptionText: {
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
});
