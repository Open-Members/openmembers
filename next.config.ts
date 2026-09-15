import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./core/i18n/request.ts');

// Baseline security headers applied to every response. The proxy.ts
// sets the same values on matched routes; this block covers the rest. CSP is
// deliberately omitted — the root layout still ships inline <script>
// blocks that need a nonce strategy before strict CSP can ship without
// breaking the app. Keep aligned with proxy.ts.
const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // Standalone output produces a minimal self-contained server at
  // .next/standalone/ suitable for Docker deploys. No effect on dev.
  output: 'standalone',
  // Drop the X-Powered-By: Next.js banner — small footprint reduction,
  // costs nothing.
  poweredByHeader: false,
  serverExternalPackages: ['jsonwebtoken'],
  experimental: {
    serverActions: {
      // Matches MAX_MATERIAL_SIZE_BYTES in core/storage/materials.ts.
      // Server-side validation still enforces size + MIME.
      bodySizeLimit: '25mb',
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Allow YouTube thumbnails when configured by a course administrator.
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

// Sentry wraps the webpack config to register the error-reporting
// plugins across runtimes. Source-map upload stays gated on
// SENTRY_AUTH_TOKEN — leave it unset in dev; set it in CI/prod to get
// de-minified stack traces in the Sentry UI.
const configured = withNextIntl(nextConfig);
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(configured, { silent: !process.env.CI, telemetry: false })
  : configured;
