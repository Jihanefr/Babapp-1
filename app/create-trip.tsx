import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper, Button, Input } from '../src/components';
import { useTrips } from '../src/contexts';
import type { TripType } from '../src/contexts';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../src/constants';

const MAX_PHOTOS = 5;

export default function CreateTripScreen() {
  const { createTrip, uploadTripPhotos } = useTrips();

  const [tripType, setTripType] = useState<TripType>('planning');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Planning-specific
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  // Sharing-specific
  const [story, setStory] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const pickCoverPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const addPhoto = async () => {
    if (photoUris.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUris((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a trip title.');
      return;
    }
    if (startDate.trim() && endDate.trim() && endDate.trim() < startDate.trim()) {
      Alert.alert('Error', 'End date cannot be before start date.');
      return;
    }

    setSaving(true);

    const { data, error } = await createTrip({
      title: title.trim(),
      description: tripType === 'planning' ? (notes.trim() || null) : (story.trim() || null),
      location: location.trim() || null,
      start_date: startDate.trim() || null,
      end_date: endDate.trim() || null,
      cover_image_url: null,
      photo_urls: [],
      budget: tripType === 'planning' ? (budget.trim() || null) : null,
      trip_type: tripType,
      is_public: false,
    });

    if (error || !data) {
      setSaving(false);
      Alert.alert('Error', error?.message ?? 'Failed to create trip.');
      return;
    }

    // Upload photos
    const urisToUpload = tripType === 'sharing' ? photoUris : (coverUri ? [coverUri] : []);
    if (urisToUpload.length > 0) {
      await uploadTripPhotos(data.id, urisToUpload);
    }

    setSaving(false);
    router.navigate('/(tabs)/trips');
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.navigate('/(tabs)/trips')} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle}>New Trip</Text>
            <View style={styles.backButton} />
          </View>

          {/* Trip type selector */}
          <View style={styles.tripTypeRow}>
            <Pressable
              style={[styles.typeBtn, tripType === 'planning' && styles.typeBtnActive]}
              onPress={() => setTripType('planning')}
            >
              <Ionicons name="map-outline" size={20} color={tripType === 'planning' ? Colors.white : Colors.textSecondary} />
              <View>
                <Text style={[styles.typeBtnLabel, tripType === 'planning' && styles.typeBtnLabelActive]}>Planning</Text>
                <Text style={[styles.typeBtnSub, tripType === 'planning' && styles.typeBtnSubActive]}>Prepare your trip</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, tripType === 'sharing' && styles.typeBtnSharing]}
              onPress={() => setTripType('sharing')}
            >
              <Ionicons name="images-outline" size={20} color={tripType === 'sharing' ? Colors.white : Colors.textSecondary} />
              <View>
                <Text style={[styles.typeBtnLabel, tripType === 'sharing' && styles.typeBtnLabelActive]}>Sharing</Text>
                <Text style={[styles.typeBtnSub, tripType === 'sharing' && styles.typeBtnSubActive]}>Document your travel</Text>
              </View>
            </Pressable>
          </View>

          {/* Common fields */}
          <View style={styles.form}>
            <Input label="Title *" placeholder={tripType === 'planning' ? 'e.g. Japan 2026' : 'e.g. Morocco Summer'} value={title} onChangeText={setTitle} />
            <Input label="Destination" placeholder="City, Country" value={location} onChangeText={setLocation} />
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Input label="Start Date" placeholder="YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
              </View>
              <View style={styles.dateSpacer} />
              <View style={styles.dateField}>
                <Input label="End Date" placeholder="YYYY-MM-DD" value={endDate} onChangeText={setEndDate} />
              </View>
            </View>
          </View>

          {/* Planning-specific */}
          {tripType === 'planning' && (
            <View style={styles.form}>
              <Input label="Budget (optional)" placeholder="e.g. ~$2,000 or Low / Medium / High" value={budget} onChangeText={setBudget} />
              <Text style={styles.fieldLabel}>Notes / What to prepare</Text>
              <Input
                label=""
                placeholder="Things to pack, book, research..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={5}
                style={styles.multilineInput}
              />
              <Text style={styles.fieldLabel}>Cover Photo (optional)</Text>
              <Pressable onPress={pickCoverPhoto} style={styles.singlePhotoPicker}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={styles.singlePhotoImage} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={32} color={Colors.textLight} />
                    <Text style={styles.photoPlaceholderText}>Tap to add cover photo</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}

          {/* Sharing-specific */}
          {tripType === 'sharing' && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>Your Story</Text>
              <Input
                label=""
                placeholder="Share your travel experience..."
                value={story}
                onChangeText={setStory}
                multiline
                numberOfLines={5}
                style={styles.multilineInput}
              />
              <View style={styles.photosHeader}>
                <Text style={styles.fieldLabel}>Photos ({photoUris.length}/{MAX_PHOTOS})</Text>
                {photoUris.length < MAX_PHOTOS && (
                  <TouchableOpacity onPress={addPhoto} style={styles.addPhotoBtn}>
                    <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                    <Text style={styles.addPhotoBtnText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
              {photoUris.length === 0 ? (
                <Pressable onPress={addPhoto} style={styles.photoPlaceholderLarge}>
                  <Ionicons name="images-outline" size={40} color={Colors.textLight} />
                  <Text style={styles.photoPlaceholderText}>Tap to add travel photos</Text>
                  <Text style={styles.photoPlaceholderSub}>Up to {MAX_PHOTOS} photos</Text>
                </Pressable>
              ) : (
                <View style={styles.photoGrid}>
                  {photoUris.map((uri, index) => (
                    <View key={index} style={styles.photoGridItem}>
                      <Image source={{ uri }} style={styles.photoGridImage} />
                      <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removePhoto(index)}>
                        <Ionicons name="close-circle" size={22} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photoUris.length < MAX_PHOTOS && (
                    <TouchableOpacity style={styles.photoGridAdd} onPress={addPhoto}>
                      <Ionicons name="add" size={28} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          <Button title="Create Trip" onPress={handleCreate} loading={saving} style={styles.createButton} />
          <Button title="Cancel" onPress={() => router.navigate('/(tabs)/trips')} variant="outline" style={styles.cancelButton} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const PHOTO_ITEM_SIZE = 100;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  form: {
    marginBottom: Spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
  },
  dateField: {
    flex: 1,
  },
  dateSpacer: {
    width: Spacing.md,
  },
  createButton: {
    marginBottom: Spacing.sm,
  },
  cancelButton: {
    marginBottom: Spacing.xxl,
  },
  tripTypeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  typeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeBtnSharing: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  typeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: Colors.white,
  },
  typeBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  typeBtnLabelActive: {
    color: Colors.white,
  },
  typeBtnSub: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 1,
  },
  typeBtnSubActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  multilineInput: {
    height: 110,
    textAlignVertical: 'top',
    paddingTop: Spacing.sm,
  },
  singlePhotoPicker: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  singlePhotoImage: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.lg,
  },
  photoPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPhotoBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  photoPlaceholderLarge: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  photoPlaceholderText: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
    marginTop: Spacing.sm,
  },
  photoPlaceholderSub: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 2,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  photoGridItem: {
    width: PHOTO_ITEM_SIZE,
    height: PHOTO_ITEM_SIZE,
    borderRadius: BorderRadius.md,
    overflow: 'visible',
  },
  photoGridImage: {
    width: PHOTO_ITEM_SIZE,
    height: PHOTO_ITEM_SIZE,
    borderRadius: BorderRadius.md,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Colors.white,
    borderRadius: 11,
  },
  photoGridAdd: {
    width: PHOTO_ITEM_SIZE,
    height: PHOTO_ITEM_SIZE,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
