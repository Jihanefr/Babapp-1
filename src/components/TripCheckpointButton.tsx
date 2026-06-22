import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants';

interface Props {
  onCheckpoint: (coords: { latitude: number; longitude: number; label: string }) => Promise<void>;
}

export function TripCheckpointButton({ onCheckpoint }: Props) {
  const [saving, setSaving] = useState(false);

  const handlePress = async () => {
    setSaving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location required',
          'Enable location access in Settings to drop a checkpoint.',
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const now = new Date();
      const label = `Checkpoint · ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

      await onCheckpoint({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        label,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not get your current location. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.btn, saving && styles.btnDisabled]}
      onPress={handlePress}
      disabled={saving}
      activeOpacity={0.8}
    >
      {saving
        ? <ActivityIndicator size="small" color={Colors.white} />
        : <Ionicons name="flag-outline" size={16} color={Colors.white} />}
      <Text style={styles.btnText}>{saving ? 'Getting location…' : 'Drop Checkpoint'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F59E0B',
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
});
