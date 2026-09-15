'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Fires the Meta `Purchase` standard event on the post-checkout thank-you page.
 *
 * Reads value + currency from the URL query string so external checkouts
 * (Stripe / Hotmart / Guru) can pass the conversion value back, e.g.
 *   /thank-you?value=97&currency=BRL
 *
 * The base pixel (window.fbq) is initialised by <MetaPixel /> with the
 * `afterInteractive` strategy, so it may not exist yet when this effect first
 * runs — we poll briefly until it is ready, then fire exactly once.
 */
export function PurchaseTracker() {
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
    if (!pixelId || !/^\d+$/.test(pixelId) || fired.current) return;

    const rawValue = params.get('value');
    const currency = (params.get('currency') ?? 'BRL').toUpperCase();

    const payload: { currency: string; value?: number } = { currency };
    if (rawValue != null) {
      // Accept both "97.00" and "97,00".
      const value = Number(rawValue.replace(',', '.'));
      if (Number.isFinite(value)) payload.value = value;
    }

    const tryFire = () => {
      if (fired.current) return true;
      if (typeof window.fbq === 'function') {
        fired.current = true;
        window.fbq('track', 'Purchase', payload);
        return true;
      }
      return false;
    };

    if (tryFire()) return;

    // Pixel not ready yet — retry for up to ~10s, then give up.
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      if (tryFire() || attempts > 40) window.clearInterval(id);
    }, 250);

    return () => window.clearInterval(id);
  }, [params]);

  return null;
}
