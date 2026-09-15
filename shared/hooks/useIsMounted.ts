'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Check from asynchronous event callbacks before updating component state. */
export function useIsMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useCallback(() => mounted.current, []);
}
