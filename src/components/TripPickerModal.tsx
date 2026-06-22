import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import { useTrips, useAuth } from '../contexts';
import { addTripItem, type TripItemCategory, type TripItemSourceType } from '../services/tripItems';
import { supabase } from '../lib/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
  poiId: string;
  poiCategory: TripItemCategory;
  sourceType: TripItemSourceType;
}

export default function TripPickerModal({ visible, onClose, poiId, poiCategory, sourceType }: Props) {
  const { trips } = useTrips();
  const { user } = useAuth();
  const [addedTripIds, setAddedTripIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    setChecking(true);
    supabase
      .from('trip_items')
      .select('trip_id')
      .eq('source_item_id', poiId)
      .eq('added_by_user_id', user.id)
      .then(({ data }) => {
        if (data) setAddedTripIds(new Set(data.map((r: { trip_id: string }) => r.trip_id)));
        setChecking(false);
      });
  }, [visible, poiId, user]);

  const handleAdd = async (tripId: string) => {
    if (!user || addedTripIds.has(tripId) || savingId) return;
    setSavingId(tripId);
    const { duplicate } = await addTripItem({
      tripId,
      userId: user.id,
      sourceType,
      sourceItemId: poiId,
      category: poiCategory,
    });
    if (!duplicate) {
      setAddedTripIds((prev) => new Set([...prev, tripId]));
    }
    setSavingId(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Add to Trip</Text>
        <Text style={styles.subtitle}>Choose a trip to save this place in</Text>

        {trips.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="map-outline" size={44} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyText}>Create a trip from the Trips tab first.</Text>
          </View>
        ) : checking ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xxl }} />
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(t) => t.id}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: Spacing.sm }}
            renderItem={({ item: trip }) => {
              const added = addedTripIds.has(trip.id);
              const saving = savingId === trip.id;
              const isPlanning = trip.trip_type === 'planning';
              return (
                <TouchableOpacity
                  style={[styles.tripRow, added && styles.tripRowAdded]}
                  onPress={() => handleAdd(trip.id)}
                  disabled={added || !!savingId}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.tripIcon,
                    { backgroundColor: isPlanning ? Colors.primary + '18' : Colors.accent + '18' },
                  ]}>
                    <Ionicons
                      name={isPlanning ? 'map-outline' : 'images-outline'}
                      size={20}
                      color={isPlanning ? Colors.primary : Colors.accent}
                    />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripName} numberOfLines={1}>{trip.title}</Text>
                    {trip.location ? (
                      <Text style={styles.tripLocation} numberOfLines={1}>{trip.location}</Text>
                    ) : null}
                  </View>
                  {saving ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : added ? (
                    <View style={styles.addedBadge}>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                      <Text style={styles.addedText}>Added</Text>
                    </View>
                  ) : (
                    <View style={styles.addBtn}>
                      <Ionicons name="add" size={20} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
    ...Shadow.card,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  list: {
    maxHeight: 340,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    ...Shadow.card,
  },
  tripRowAdded: {
    opacity: 0.7,
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripInfo: {
    flex: 1,
  },
  tripName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  tripLocation: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addedText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
});
