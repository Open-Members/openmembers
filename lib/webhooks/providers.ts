/**
 * Declarative catalog of supported payment-gateway integrations.
 *
 * The admin Integrations page reads from this list to build the provider
 * cards + setup dialog. Adding a new gateway (Hotmart, Kirvano, Eduzz…)
 * means a new row here + a new /api/webhooks/<id>/route.ts mirroring
 * the Guru one — nothing else in the admin UI needs to change.
 *
 * Copy for the setup dialog lives here on purpose — centralising the
 * field labels + "what is this" explanations keeps the dialog component
 * small and makes it trivial to add a new provider without hunting for
 * where to edit the help text.
 */
export type WebhookProviderId = 'stripe' | 'guru' | 'generic';

/**
 * How the provider authenticates incoming webhooks:
 *   - 'signature': admin pastes a signing secret; we verify HMAC per request.
 *     (Stripe, generic bearer.)
 *   - 'url-token': gateway only gives us a URL field; we mint a random token
 *     at setup, embed it in the URL, and treat the URL as the credential.
 *     (Guru — no HMAC exposed.)
 */
export type WebhookAuthMode = 'signature' | 'url-token';

export interface WebhookProviderSpec {
  id: WebhookProviderId;
  name: string;
  /** Short one-liner for the card. */
  tagline: string;
  /** Paragraph-length description shown in the setup dialog. */
  description: string;
  /** Path to the SVG logo under /public. */
  logoPath: string;
  /** Webhook path admins paste into the gateway dashboard. */
  webhookPath: string;
  /** External brand page so the admin can research if needed. */
  helpUrl: string;

  // ─── Auth model ─────────────────────────────────────────────────
  /** How the provider authenticates. Drives the admin setup dialog. */
  authMode: WebhookAuthMode;

  // ─── Signing secret (section 1) — signature mode only ──────────
  /** Label above the secret input. */
  secretLabel: string;
  /** Placeholder inside the secret input. */
  secretPlaceholder: string;
  /** "What is this?" explanation — kept short, human voice. */
  secretWhatIsIt: string;
  /** Step-by-step where-to-find instructions. */
  secretWhereToFind: string;

  // ─── Payload binding (url-token mode, defense-in-depth) ────────
  /** Label for the producer/account ID input (url-token providers). */
  producerIdLabel?: string;
  /** Placeholder inside the producer ID input. */
  producerIdPlaceholder?: string;
  /** Short "why we ask this" explanation shown near the field. */
  producerIdWhatIsIt?: string;
  /** Step-by-step where-to-find for the producer ID. */
  producerIdWhereToFind?: string;

  // ─── Per-product offer (section 2) ─────────────────────────────
  /** Label above the gateway-product-id input in the offer form. */
  productIdLabel: string;
  /** Placeholder inside the product id input. */
  productIdPlaceholder: string;
  /** Helper text shown below the product id input. */
  productIdInstructions: string;

  /** What we can do for this provider (shown as chips on the card). */
  capabilities: ReadonlyArray<string>;
}

export const WEBHOOK_PROVIDERS: ReadonlyArray<WebhookProviderSpec> = [
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'One-time and subscription billing — worldwide',
    description:
      'Connect your Stripe account for one-time payments and subscriptions.',
    logoPath: '/icon.svg',
    webhookPath: '/api/webhooks/stripe',
    helpUrl: 'https://dashboard.stripe.com/webhooks',
    authMode: 'signature',
    secretLabel: 'Stripe webhook signing secret',
    secretPlaceholder: 'whsec_aBcDeFgH...',
    secretWhatIsIt:
      'A secret code Stripe gives you when you register our URL in their dashboard. We use it to verify that webhook events really came from Stripe. This is NOT a product ID — that goes in the next section.',
    secretWhereToFind:
      'Stripe Dashboard → Developers → Webhooks → click your endpoint → scroll to "Signing secret" → Reveal. Paste the whsec_... string here.',
    productIdLabel: 'Stripe Price ID (price_...)',
    productIdPlaceholder: 'price_1Abc...',
    productIdInstructions:
      'In Stripe Dashboard → Products, open the product and copy its Price ID. Create one offer per price you sell (monthly vs annual = two separate offers).',
    capabilities: [
      'Purchases',
      'Subscriptions with auto-renewal',
      'Full refunds + chargebacks',
      'Offer mapping (one item per Checkout)',
    ],
  },
  {
    id: 'guru',
    name: 'D. Manager Guru',
    tagline: 'Brazilian infoproduct marketplace',
    description:
      'Popular gateway for PT-BR course creators. Configure under Digital Manager → Integrações → Postback.',
    logoPath: '/icon.svg',
    webhookPath: '/api/webhooks/guru',
    helpUrl: 'https://digitalmanager.guru',
    authMode: 'url-token',
    // Kept for type compatibility — the admin UI hides these when
    // authMode is 'url-token'.
    secretLabel: '',
    secretPlaceholder: '',
    secretWhatIsIt: '',
    secretWhereToFind: '',
    producerIdLabel: 'Your Guru producer ID',
    producerIdPlaceholder: '123456',
    producerIdWhatIsIt:
      'The numeric ID of your Guru account. Every purchase webhook carries it — we check the payload matches as an additional consistency check. Keep the URL secret; the producer ID is not a second credential.',
    producerIdWhereToFind:
      'In Digital Manager Guru, open Minha conta → Perfil. The "ID do produtor" (or similar) is the number shown there. You can also find it on any of your products — it appears in the URL of the product detail page.',
    productIdLabel: 'Guru Product ID',
    productIdPlaceholder: '1234567 or XXXX-YYYY',
    productIdInstructions:
      'In Digital Manager Guru, open your product page and copy the numeric ID from the URL or the product detail panel. Create one offer per product you sell.',
    capabilities: [
      'Purchases',
      'Subscriptions',
      'Refunds + chargebacks',
      'Multi-product mapping',
    ],
  },
  {
    id: 'generic',
    name: 'Generic webhook',
    tagline: 'Any gateway that can POST JSON',
    description:
      'A catch-all endpoint for platforms without a dedicated integration. Your payload needs at least email, transaction_id and (optionally) product_id.',
    logoPath: '/icon.svg',
    webhookPath: '/api/webhooks/generic',
    helpUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
    authMode: 'signature',
    secretLabel: 'Bearer token',
    secretPlaceholder: 'Long random string (at least 16 chars)',
    secretWhatIsIt:
      'Any long random string you pick. Your gateway must send it back in the Authorization: Bearer header on every webhook — that\'s how we know the request is yours.',
    secretWhereToFind:
      'Generate one locally (e.g. `openssl rand -hex 32`) and paste the result here. Then configure your gateway to send that same value in the Authorization header when it fires the webhook.',
    productIdLabel: 'Product identifier (free text)',
    productIdPlaceholder: 'sku-premium-annual',
    productIdInstructions:
      'Whatever string your gateway sends as product_id in the webhook body. If your payload has no product_id, leave mappings empty and all sales land on the fallback access level.',
    capabilities: [
      'Purchases',
      'Manual product mapping',
      'Use for providers without a native integration',
    ],
  },
];

export function findProvider(
  id: string,
): WebhookProviderSpec | undefined {
  return WEBHOOK_PROVIDERS.find((p) => p.id === id);
}
