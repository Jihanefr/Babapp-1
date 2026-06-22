import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../constants';
import { CATEGORY_CONFIG, type CircuitCategory } from '../lib/circuitCategories';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, type: CircuitCategory) => Promise<void>;
}

const TYPE_OPTIONS: { key: CircuitCategory; label: string; icon: string; color: string }[] = [
  { key: 'see', ...CATEGORY_CONFIG.see },
  { key: 'eat', ...CATEGORY_CONFIG.eat },
  { key: 'stay', ...CATEGORY_CONFIG.stay },
  { key: 'do', ...CATEGORY_CONFIG.do },
];

export default function SavePlaceModal({ visible, onClose, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CircuitCategory>('see');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Please enter a name for this place.');
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed, type);
      setTitle('');
      setType('see');
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to save place. Please try again.');
    }
    setSaving(false);
  };

  const handleClose = () => {
    setTitle('');
    setType('see');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Save as Place</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Amazing viewpoint"
            placeholderTextColor={Colors.textLight}
            autoFocus
            maxLength={100}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.typeBtn,
                    { borderColor: opt.color },
                    active && { backgroundColor: opt.color + '18' },
                  ]}
                  onPress={() => setType(opt.key)}
                >
                  <Ionicons name={opt.icon as any} size={18} color={opt.color} />
                  <Text style={[styles.typeBtnText, { color: opt.color }]}>{opt.label}</Text>
                  {active && <Ionicons name="checkmark-circle" size={16} color={opt.color} />}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Place'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: '88%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: '#F9FAFB',
  },
  typeRow: {
    gap: 8,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 0,
  },
  typeBtnText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
