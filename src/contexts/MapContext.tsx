import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Region } from 'react-native-maps';

export type ExploreMode = 'circuits' | 'photos';

interface MapContextType {
  region: Region | null;
  setRegion: (region: Region | null) => void;
  mode: ExploreMode;
  setMode: (mode: ExploreMode) => void;
  /** Photo to fly to on the map (id + coords). Cleared after consumption. */
  focusedPhoto: { id: string; latitude: number; longitude: number } | null;
  focusPhoto: (id: string, latitude: number, longitude: number) => void;
  clearFocusedPhoto: () => void;
  /** Source POI when navigating from journal → map, for back-pill */
  fromPoi: { id: string; title: string } | null;
  setFromPoi: (poi: { id: string; title: string } | null) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region | null>(null);
  const [mode, setMode] = useState<ExploreMode>('circuits');
  const [focusedPhoto, setFocusedPhoto] = useState<{ id: string; latitude: number; longitude: number } | null>(null);
  const [fromPoi, setFromPoi] = useState<{ id: string; title: string } | null>(null);

  const setRegion = (newRegion: Region | null) => {
    setRegionState(newRegion);
  };

  const focusPhoto = (id: string, latitude: number, longitude: number) => {
    setMode('photos');
    setFocusedPhoto({ id, latitude, longitude });
  };

  const clearFocusedPhoto = () => setFocusedPhoto(null);

  return (
    <MapContext.Provider value={{ region, setRegion, mode, setMode, focusedPhoto, focusPhoto, clearFocusedPhoto, fromPoi, setFromPoi }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMap() {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMap must be used within a MapProvider');
  }
  return context;
}
