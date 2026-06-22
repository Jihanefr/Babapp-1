import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const CIRCUITS_CACHE_KEY = '@circuits_all';
const CIRCUITS_CACHE_TTL_MS = 5 * 60 * 1000;

export interface Circuit {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  difficulty: string | null;
  duration_hours: number | null;
  distance_km: number | null;
  latitude: number | null;
  longitude: number | null;
  cover_image_url: string | null;
  created_at: string;
}

export interface CircuitImage {
  id: string;
  circuit_id: string;
  image_url: string;
  caption: string | null;
  order_index: number;
}

interface CircuitsContextType {
  circuits: Circuit[];
  loading: boolean;
  fetchCircuits: (force?: boolean) => Promise<void>;
  getCircuitImages: (circuitId: string) => Promise<CircuitImage[]>;
  uploadCircuitImage: (circuitId: string, uri: string, caption?: string) => Promise<{ error: Error | null }>;
}

const CircuitsContext = createContext<CircuitsContextType | undefined>(undefined);

export function CircuitsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(false);
  const hasDataRef = useRef(false);
  const lastFetchRef = useRef(0);

  const fetchCircuits = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchRef.current > 0 && now - lastFetchRef.current < CIRCUITS_CACHE_TTL_MS) return;

    // Show cached data immediately on first load
    if (!hasDataRef.current) {
      try {
        const raw = await AsyncStorage.getItem(CIRCUITS_CACHE_KEY);
        if (raw) {
          const cached: Circuit[] = JSON.parse(raw);
          if (cached.length > 0) {
            setCircuits(cached);
            hasDataRef.current = true;
          }
        }
      } catch {}
    }

    if (!hasDataRef.current) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('circuits')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Circuits] Fetch error:', error.message, error.details);
      }
      if (data) {
        setCircuits(data);
        hasDataRef.current = true;
        lastFetchRef.current = Date.now();
        try { await AsyncStorage.setItem(CIRCUITS_CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    } catch (err) {
      console.error('[Circuits] Network error:', err);
    }
    setLoading(false);
  }, []);

  const getCircuitImages = async (circuitId: string): Promise<CircuitImage[]> => {
    const { data, error } = await supabase
      .from('circuit_images')
      .select('*')
      .eq('circuit_id', circuitId)
      .order('order_index', { ascending: true });

    if (data && !error) {
      return data;
    }
    return [];
  };

  const uploadCircuitImage = async (circuitId: string, uri: string, caption?: string): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const fileExt = uri.split('.').pop() ?? 'jpg';
      const fileName = `${circuitId}-${Date.now()}.${fileExt}`;
      const filePath = `${circuitId}/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('circuit-images')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        return { error: uploadError as unknown as Error };
      }

      const { data: urlData } = supabase.storage.from('circuit-images').getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from('circuit_images')
        .insert({
          circuit_id: circuitId,
          image_url: urlData.publicUrl,
          caption: caption || null,
          order_index: 0,
        });

      if (insertError) {
        return { error: insertError as unknown as Error };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  useEffect(() => {
    fetchCircuits();
  }, [fetchCircuits]);

  return (
    <CircuitsContext.Provider
      value={{ circuits, loading, fetchCircuits, getCircuitImages, uploadCircuitImage }}
    >
      {children}
    </CircuitsContext.Provider>
  );
}

export function useCircuits() {
  const context = useContext(CircuitsContext);
  if (context === undefined) {
    throw new Error('useCircuits must be used within a CircuitsProvider');
  }
  return context;
}
