import { useState, useCallback, useRef } from 'react';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type PageFetcher<T> = (cursor: string | null, limit: number) => Promise<Page<T>>;

interface UsePaginatedResult<T> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  loadNext: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export function usePaginated<T>(
  fetcher: PageFetcher<T>,
  limit = 20,
): UsePaginatedResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const loadNext = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetcher(cursorRef.current, limit);
      setItems((prev) => [...prev, ...page.items]);
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetcher, hasMore, limit]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    cursorRef.current = null;
    setHasMore(true);
    try {
      const page = await fetcher(null, limit);
      setItems(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } finally {
      setRefreshing(false);
    }
  }, [fetcher, limit]);

  const reset = useCallback(() => {
    setItems([]);
    cursorRef.current = null;
    setHasMore(true);
    setLoading(false);
    setRefreshing(false);
  }, []);

  return { items, loading, refreshing, hasMore, loadNext, refresh, reset };
}
