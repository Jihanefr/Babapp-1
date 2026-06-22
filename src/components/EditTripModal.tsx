import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants';
import type { Trip } from '../contexts/TripsContext';

interface Props {
  visible: boolean;
  trip: Trip;
  onClose: () => void;
  onSave: (updates: Partial<Trip>) => Promise<void>;
}

function Label({ text, optional }: { text: string; optional?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {optional ? <Text style={styles.optional}> (optional)</Text> : null}
    </Text>
  );
}

function Input({
  value, onChangeText, placeholder, multiline, numberOfLines,
}: {
  value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textLight}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : 'auto'}
    />
  );
}

function formatDateForInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function parseInputDate(str: string): string | null {
  if (!str.trim()) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function EditTripModal({ visible, trip, onClose, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && trip) {
      setTitle(trip.title ?? '');
      setDescription(trip.description ?? '');
      setLocation(trip.location ?? '');
      setStartDate(formatDateForInput(trip.start_date));
      setEndDate(formatDateForInput(trip.end_date));
      setBudget(trip.budget ?? '');
      setIsPublic(trip.is_public ?? false);
    }
  }, [visible, trip]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a title for the trip.');
      return;
    }
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_date: parseInputDate(startDate),
      end_date: parseInputDate(endDate),
      budget: budget.trim() || null,
      is_public: isPublic,
      trip_type: isPublic ? 'sharing' : trip.trip_type,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="create-outline" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.headerTitle}>Edit Trip</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Label text="Trip title" />
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Trip to Italy 2026" />

          <Label text="Destination" optional />
          <Input value={location} onChangeText={setLocation} placeholder="e.g. Italy" />

          <Label text="Description / Story" optional />
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description or story…"
            multiline
            numberOfLines={4}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Label text="Departure" optional />
              <Input value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
            </View>
            <View style={styles.half}>
              <Label text="Return" optional />
              <Input value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          <Label text="Budget" optional />
          <Input value={budget} onChangeText={setBudget} placeholder="e.g. €2,000" />

          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Ionicons
                name="globe-outline"
                size={18}
                color={isPublic ? Colors.primary : Colors.textLight}
              />
              <Text style={styles.toggleLabel}>Make trip public</Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  content: { paddingBottom: 16 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  half: { flex: 1 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 5,
    marginTop: Spacing.sm,
  },
  optional: { fontWeight: '400' as const, color: Colors.textLight },
  input: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMulti: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 11,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
});
