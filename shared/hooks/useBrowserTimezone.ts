'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

function getSnapshot(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function getServerSnapshot(): null {
  return null;
}

/** Read the browser's zone after hydration and refresh when the page regains focus. */
export function useBrowserTimezone() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
