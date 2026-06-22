import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import type { TripNote } from '../services/tripNotes';

interface Props {
  notes: TripNote[];
  loading: boolean;
  saving: boolean;
  removingId: string | null;
  onAdd: (content: string) => Promise<void>;
  onRemove: (note: TripNote) => void;
}

export function TripNotesSection({ notes, loading, saving, removingId, onAdd, onRemove }: Props) {
  const [draft, setDraft] = useState('');

  const handleAdd = async () => {
    if (!draft.trim()) return;
    await onAdd(draft.trim());
    setDraft('');
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View>
      {/* ── Quick note input ── */}
      <View style={styles.inputCard}>
        <TextInput
          style={styles.textInput}
          placeholder="Write a note…"
          placeholderTextColor={Colors.textLight}
          value={draft}
          onChangeText={setDraft}
          multiline
          numberOfLines={3}
        />
        <TouchableOpacity
          style={[styles.addBtn, (!draft.trim() || saving) && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!draft.trim() || saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="send" size={18} color={Colors.white} />}
        </TouchableOpacity>
      </View>

      {/* ── Notes list ── */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
      ) : notes.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="journal-outline" size={36} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptySub}>
            Jot down thoughts, reminders, or experiences during your trip.
          </Text>
        </View>
      ) : (
        notes.map((note) => (
          <View key={note.id} style={styles.noteCard}>
            <View style={styles.noteBody}>
              <Text style={styles.noteContent}>{note.content}</Text>
              <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(note)}
              disabled={removingId === note.id}
            >
              {removingId === note.id
                ? <ActivityIndicator size="small" color={Colors.error} />
                : <Ionicons name="trash-outline" size={18} color={Colors.error} />}
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    ...Shadow.card,
  },
  textInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    minHeight: 64,
    textAlignVertical: 'top',
    paddingTop: 4,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  noteBody: {
    flex: 1,
  },
  noteContent: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  noteDate: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 6,
  },
  removeBtn: {
    padding: Spacing.xs,
    marginTop: 2,
  },
});
