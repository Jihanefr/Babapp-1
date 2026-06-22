import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import type { TripRating } from '../services/tripRatings';
import { computeRatingSummary } from '../services/tripRatings';

interface Props {
  tripOwnerId: string;
  currentUserId: string | null;
  ratings: TripRating[];
  userRating: TripRating | null;
  saving: boolean;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onRemove: () => void;
}

function StarRow({
  value,
  interactive,
  size = 20,
  onChange,
}: {
  value: number;
  interactive?: boolean;
  size?: number;
  onChange?: (v: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => onChange?.(star)}
          disabled={!interactive}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={size}
            color={star <= value ? '#F59E0B' : Colors.textLight}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function TripRatingSection({
  tripOwnerId,
  currentUserId,
  ratings,
  userRating,
  saving,
  onSubmit,
  onRemove,
}: Props) {
  const [draft, setDraft] = useState(userRating?.rating ?? 0);
  const [comment, setComment] = useState(userRating?.comment ?? '');

  const { average, count } = computeRatingSummary(ratings);
  const isOwner = currentUserId === tripOwnerId;
  const canRate = !!currentUserId && !isOwner;

  const handleSubmit = async () => {
    if (draft === 0) return;
    await onSubmit(draft, comment);
  };

  return (
    <View>
      {/* ── Summary ── */}
      <View style={styles.summaryCard}>
        {count > 0 ? (
          <>
            <Text style={styles.averageNumber}>{average.toFixed(1)}</Text>
            <StarRow value={Math.round(average)} size={22} />
            <Text style={styles.ratingCount}>
              {count} {count === 1 ? 'rating' : 'ratings'}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="star-outline" size={32} color={Colors.textLight} />
            <Text style={styles.noRatingsText}>No ratings yet</Text>
            {canRate ? (
              <Text style={styles.noRatingsSub}>Be the first to rate this trip</Text>
            ) : null}
          </>
        )}
      </View>

      {/* ── Rating widget (non-owners only) ── */}
      {canRate ? (
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>
            {userRating ? 'Update your rating' : 'Rate this trip'}
          </Text>
          <StarRow value={draft} interactive size={32} onChange={setDraft} />
          <TextInput
            style={styles.commentInput}
            placeholder="Leave a comment (optional)…"
            placeholderTextColor={Colors.textLight}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
          />
          <View style={styles.rateActions}>
            {userRating ? (
              <TouchableOpacity style={styles.removeBtn} onPress={onRemove} disabled={saving}>
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.submitBtn, (draft === 0 || saving) && styles.submitBtnDisabled, userRating ? { flex: 1 } : { alignSelf: 'flex-end', minWidth: 100 }]}
              onPress={handleSubmit}
              disabled={draft === 0 || saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.submitBtnText}>{userRating ? 'Update' : 'Submit'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : isOwner ? (
        <View style={styles.ownerNote}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.ownerNoteText}>You can't rate your own trip</Text>
        </View>
      ) : null}

      {/* ── Recent ratings list ── */}
      {ratings.length > 0 ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Reviews</Text>
          {ratings.slice(0, 10).map((r) => (
            <View key={r.id} style={styles.ratingRow}>
              <View style={styles.ratingRowHeader}>
                <View style={styles.authorBadge}>
                  <Text style={styles.authorInitial}>
                    {(r.author_name ?? 'T')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorName}>{r.author_name ?? 'Traveller'}</Text>
                  <StarRow value={r.rating} size={13} />
                </View>
                <Text style={styles.ratingDate}>
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              {r.comment ? (
                <Text style={styles.ratingComment}>{r.comment}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Summary ── */
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  averageNumber: {
    fontSize: 40,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    lineHeight: 44,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingCount: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  noRatingsText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  noRatingsSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  /* ── Rate card ── */
  rateCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  rateTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  rateActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  removeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },

  /* ── Owner note ── */
  ownerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  ownerNoteText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  /* ── Reviews list ── */
  listCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  listTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  ratingRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  ratingRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  authorBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorInitial: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  authorName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  ratingDate: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
  },
  ratingComment: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
    paddingLeft: 44,
  },
});
