"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FAVORITES } from "./defaultFavorites";

const STORAGE_KEY = "playo-slots:favorites:v1";

/** Favourite venues, identified by name (Playo doesn't always expose a stable id up front).
 * First-time visitors (no localStorage entry yet) see the hardcoded defaults.
 * Once they add/remove anything, their own list takes over permanently on that device. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [customized, setCustomized] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setFavorites(JSON.parse(raw));
        setCustomized(true);
      } else {
        setFavorites(DEFAULT_FAVORITES.map((f) => f.name));
        setCustomized(false);
      }
    } catch {
      setFavorites(DEFAULT_FAVORITES.map((f) => f.name));
    }
    setLoaded(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setFavorites(next);
    setCustomized(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const toggle = useCallback(
    (venueName: string) => {
      persist(
        favorites.includes(venueName)
          ? favorites.filter((v) => v !== venueName)
          : [...favorites, venueName]
      );
    },
    [favorites, persist]
  );

  const isFavorite = useCallback((venueName: string) => favorites.includes(venueName), [favorites]);

  return { favorites, isFavorite, toggle, customized, loaded };
}
