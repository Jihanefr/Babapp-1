import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import type { TripPlanningItem, PlanningItemType } from '../services/tripPlanningItems';

export const PLANNING_TYPE_CONFIG: Record<
  PlanningItemType,
  { label: string; icon: string; color: string }
> = {
  flight:        { label: 'Flights',       icon: 'airplane-outline',  color: '#3B82F6' },
  accommodation: { label: 'Accommodation', icon: 'bed-outline',        color: '#10B981' },
  activity:      { label: 'Activities',    icon: 'bicycle-outline',    color: '#F59E0B' },
  transport:     { label: 'Transport',     icon: 'car-outline',        color: '#8B5CF6' },
  other:         { label: 'Other',         icon: 'list-outline',       color: '#6B7280' },
};

const PLANNING_TYPE_ORDER: PlanningItemType[] = [
  'flight', 'accommodation', 'activity', 'transport', 'other',
];

interface Props {
  items: TripPlanningItem[];
  loading: boolean;
  removingId: string | null;
  onAdd: () => void;
  onRemove: (item: TripPlanningItem) => void;
  onEdit?: (item: TripPlanningItem) => void;
}

export function TripPlanningSection({ items, loading, removingId, onAdd, onRemove, onEdit }: Props) {
  const grouped = PLANNING_TYPE_ORDER.reduce<Record<PlanningItemType, TripPlanningItem[]>>(
    (acc, type) => {
      acc[type] = items.filter((i) => i.item_type === type);
      return acc;
    },
    { flight: [], accommodation: [], activity: [], transport: [], other: [] },
  );

  const formatDateTime = (dt: string | null) => {
    if (!dt) return null;
    try {
      return new Date(dt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dt;
    }
  };

  return (
    <View>
      <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.addBtnText}>Add Planning Item</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="clipboard-outline" size={36} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>Nothing planned yet</Text>
          <Text style={styles.emptySub}>
            Add flights, accommodation, and activities to organise your trip.
          </Text>
        </View>
      ) : (
        PLANNING_TYPE_ORDER.map((type) => {
          const typeItems = grouped[type];
          if (typeItems.length === 0) return null;
          const cfg = PLANNING_TYPE_CONFIG[type];
          return (
            <View key={type} style={styles.typeBlock}>
              <View style={[styles.typeHeader, { borderLeftColor: cfg.color }]}>
                <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={styles.typeCount}>{typeItems.length}</Text>
              </View>
              {typeItems.map((item) => {
                const m = item.metadata ?? {};
                return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={[styles.itemIconWrap, { backgroundColor: cfg.color + '1A' }]}>
                    <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                  </View>
                  <View style={styles.itemInfo}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                      {m.booked ? (
                        <View style={styles.bookedBadge}>
                          <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                          <Text style={styles.bookedText}>Booked</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* FLIGHT extras */}
                    {item.item_type === 'flight' && (m.from_airport || m.to_airport) ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="airplane-outline" size={12} color={cfg.color} />
                        <Text style={styles.itemMetaText}>
                          {[m.from_airport, m.to_airport].filter(Boolean).join(' → ')}
                          {m.airline ? `  ·  ${m.airline}` : ''}
                          {m.flight_number ? ` ${m.flight_number}` : ''}
                        </Text>
                      </View>
                    ) : null}
                    {item.item_type === 'flight' && m.seat ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="person-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText}>Seat {String(m.seat)}</Text>
                      </View>
                    ) : null}

                    {/* ACCOMMODATION extras */}
                    {item.item_type === 'accommodation' && m.accommodation_type ? (
                      <View style={[styles.accomTypeBadge, { borderColor: cfg.color + '66' }]}>
                        <Text style={[styles.accomTypeText, { color: cfg.color }]}>
                          {String(m.accommodation_type).charAt(0).toUpperCase() + String(m.accommodation_type).slice(1)}
                        </Text>
                      </View>
                    ) : null}
                    {item.item_type === 'accommodation' && m.address ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText} numberOfLines={1}>{String(m.address)}</Text>
                      </View>
                    ) : null}
                    {item.item_type === 'accommodation' && m.nights ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="moon-outline" size={12} color={cfg.color} />
                        <Text style={styles.itemMetaText}>{String(m.nights)} night{Number(m.nights) !== 1 ? 's' : ''}</Text>
                      </View>
                    ) : null}

                    {/* ACTIVITY extras */}
                    {item.item_type === 'activity' && m.venue ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="business-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText} numberOfLines={1}>{String(m.venue)}</Text>
                      </View>
                    ) : null}
                    {item.item_type === 'activity' && m.address ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText} numberOfLines={1}>{String(m.address)}</Text>
                      </View>
                    ) : null}

                    {/* TRANSPORT extras */}
                    {item.item_type === 'transport' && (m.from_location || m.to_location) ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="navigate-outline" size={12} color={cfg.color} />
                        <Text style={styles.itemMetaText} numberOfLines={1}>
                          {[m.from_location, m.to_location].filter(Boolean).join(' → ')}
                        </Text>
                      </View>
                    ) : null}
                    {item.item_type === 'transport' && m.mode ? (
                      <View style={[styles.accomTypeBadge, { borderColor: cfg.color + '66' }]}>
                        <Text style={[styles.accomTypeText, { color: cfg.color }]}>
                          {String(m.mode).charAt(0).toUpperCase() + String(m.mode).slice(1)}
                        </Text>
                      </View>
                    ) : null}

                    {/* Default location fallback for 'other' */}
                    {item.item_type === 'other' && item.location ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText} numberOfLines={1}>{item.location}</Text>
                      </View>
                    ) : null}

                    {/* Date/time row */}
                    {item.start_datetime ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText}>
                          {formatDateTime(item.start_datetime)}
                          {item.end_datetime ? ` → ${formatDateTime(item.end_datetime)}` : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/* Confirmation # */}
                    {m.confirmation ? (
                      <View style={styles.itemMeta}>
                        <Ionicons name="ticket-outline" size={12} color={Colors.textSecondary} />
                        <Text style={styles.itemMetaText}>Ref: {String(m.confirmation)}</Text>
                      </View>
                    ) : null}

                    {item.description ? (
                      <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.itemActions}>
                    {onEdit ? (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => onEdit(item)}
                        disabled={removingId === item.id}
                      >
                        <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => onRemove(item)}
                      disabled={removingId === item.id}
                    >
                      {removingId === item.id
                        ? <ActivityIndicator size="small" color={Colors.error} />
                        : <Ionicons name="trash-outline" size={18} color={Colors.error} />}
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  addBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    ...Shadow.card,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  typeBlock: {
    marginBottom: Spacing.md,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderLeftWidth: 3,
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  typeLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  itemMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  itemDesc: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 3,
    fontStyle: 'italic',
  },
  itemActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  editBtn: {
    padding: Spacing.xs,
  },
  removeBtn: {
    padding: Spacing.xs,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bookedText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: '#10B981',
  },
  accomTypeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
  },
  accomTypeText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
  },
});
