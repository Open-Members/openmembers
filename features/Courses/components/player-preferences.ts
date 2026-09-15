'use client';

import { useCallback, useSyncExternalStore } from 'react';

const PREFERENCE_EVENT = 'openmembers:player-preference-change';
const unavailableStorageValues = new Map<string, string>();

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(PREFERENCE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(PREFERENCE_EVENT, callback);
  };
}

/** A consistent server snapshot plus same-tab and cross-tab preference updates. */
export function usePlayerPreference(key: string, fallback: string) {
  const getSnapshot = useCallback(() => {
    if (unavailableStorageValues.has(key)) {
      return unavailableStorageValues.get(key) ?? fallback;
    }
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return unavailableStorageValues.get(key) ?? fallback;
    }
  }, [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setValue = useCallback((next: string) => {
    try {
      window.localStorage.setItem(key, next);
      unavailableStorageValues.delete(key);
    } catch {
      unavailableStorageValues.set(key, next);
    }
    window.dispatchEvent(new Event(PREFERENCE_EVENT));
  }, [key]);
  return [value, setValue] as const;
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Browser-only capabilities remain hidden until the server snapshot is hydrated. */
export function usePlayerHydrated() {
  return useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
}
