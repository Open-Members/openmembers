import Stripe from 'stripe';

// ─── Lazy Stripe client ──────────────────────────────────────────────────────
//
// The Stripe client cannot be instantiated at module-evaluation time: Next.js
// statically evaluates route handlers during `next build`'s "Collecting page
// data" phase, and eager init would crash the build whenever the secret is
// missing (e.g. on CI without the env var, or before Stripe is configured).
//
// The Proxy below defers instantiation to the first property access, which
// only happens inside the route handlers at request time. Consumers keep
// writing `import { stripe } from '@/core/stripe/server'` — no call-site
// changes needed.

let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _stripe = new Stripe(key);
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripeClient();
    const value = client[prop as keyof Stripe];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

// Price IDs — set these in .env after creating products in Stripe Dashboard
export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  annual: process.env.STRIPE_PRICE_ANNUAL!,
} as const;
