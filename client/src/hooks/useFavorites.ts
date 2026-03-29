import { useState, useCallback, useEffect } from 'react';

interface UseFavoritesReturn {
  favorites: string[];
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
}

export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pa-favorites');
      const parsed = stored ? JSON.parse(stored) : [];
      setFavorites(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavorites([]);
    }
    setInitialized(true);
  }, []);

  const toggleFavorite = useCallback((slug: string) => {
    setFavorites((prev) => {
      const newFavorites = prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug];
      try {
        localStorage.setItem('pa-favorites', JSON.stringify(newFavorites));
      } catch {
        // localStorage might be unavailable or full
      }
      return newFavorites;
    });
  }, []);

  const isFavorite = useCallback((slug: string) => {
    return favorites.includes(slug);
  }, [favorites]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
  };
}
