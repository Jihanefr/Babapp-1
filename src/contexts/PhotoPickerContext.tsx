import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { GeoPhoto } from '../hooks';

interface PhotoPickerContextType {
  /** The POI ID we're picking photos for, or null if not picking */
  pickingForPoi: string | null;
  /** Currently selected photos */
  selectedPhotos: GeoPhoto[];
  /** Whether picked photos are waiting to be consumed */
  hasPickedPhotos: boolean;
  /** Start picking mode for a given POI */
  startPicking: (poiId: string) => void;
  /** Toggle a photo in/out of the selection */
  togglePhoto: (photo: GeoPhoto) => void;
  /** Check if a photo is selected */
  isSelected: (photoId: string) => boolean;
  /** Finish picking — stores selected photos in ref for immediate access */
  finishPicking: () => void;
  /** Consume picked photos (read and clear) — synchronous via ref */
  consumePickedPhotos: () => GeoPhoto[];
  /** Cancel picking and reset */
  cancelPicking: () => void;
}

const PhotoPickerContext = createContext<PhotoPickerContextType | undefined>(undefined);

export function PhotoPickerProvider({ children }: { children: React.ReactNode }) {
  const [pickingForPoi, setPickingForPoi] = useState<string | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<GeoPhoto[]>([]);
  const [hasPickedPhotos, setHasPickedPhotos] = useState(false);
  const pickedRef = useRef<GeoPhoto[]>([]);

  const startPicking = useCallback((poiId: string) => {
    setPickingForPoi(poiId);
    setSelectedPhotos([]);
    pickedRef.current = [];
    setHasPickedPhotos(false);
  }, []);

  const togglePhoto = useCallback((photo: GeoPhoto) => {
    setSelectedPhotos((prev) => {
      const exists = prev.find((p) => p.id === photo.id);
      if (exists) return prev.filter((p) => p.id !== photo.id);
      return [...prev, photo];
    });
  }, []);

  const isSelected = useCallback(
    (photoId: string) => selectedPhotos.some((p) => p.id === photoId),
    [selectedPhotos],
  );

  const finishPicking = useCallback(() => {
    pickedRef.current = [...selectedPhotos];
    setHasPickedPhotos(true);
    setPickingForPoi(null);
    setSelectedPhotos([]);
  }, [selectedPhotos]);

  const consumePickedPhotos = useCallback(() => {
    const result = [...pickedRef.current];
    pickedRef.current = [];
    setHasPickedPhotos(false);
    return result;
  }, []);

  const cancelPicking = useCallback(() => {
    setPickingForPoi(null);
    setSelectedPhotos([]);
    pickedRef.current = [];
    setHasPickedPhotos(false);
  }, []);

  return (
    <PhotoPickerContext.Provider
      value={{ pickingForPoi, selectedPhotos, hasPickedPhotos, startPicking, togglePhoto, isSelected, finishPicking, consumePickedPhotos, cancelPicking }}
    >
      {children}
    </PhotoPickerContext.Provider>
  );
}

export function usePhotoPicker() {
  const ctx = useContext(PhotoPickerContext);
  if (!ctx) throw new Error('usePhotoPicker must be used within PhotoPickerProvider');
  return ctx;
}
