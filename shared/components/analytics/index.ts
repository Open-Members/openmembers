export { MetaPixel } from './MetaPixel';
export { GoogleAnalytics } from './GoogleAnalytics';
export { PurchaseTracker } from './PurchaseTracker';

/**
 * Window globals exposed by the pixel + GA4 init scripts. Importing this
 * type augments globalThis so callsites can call window.fbq / window.gtag
 * without TypeScript complaining.
 */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}
