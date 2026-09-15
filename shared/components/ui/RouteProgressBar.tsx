'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { EASE } from '@/shared/motion/constants';

// NOTE: uses next/navigation's raw usePathname — NOT the next-intl
// wrapper from @/core/i18n/routing — because this component is mounted
// in RootLayout, ABOVE the next-intl provider tree. We only need to
// detect "the URL changed", not locale-aware path resolution.

// Fixed 2px bar at the very top of the viewport that flashes during
// route navigation. Not wired to real loading state — it's a perceived
// smoothness affordance, like nprogress.
//
// Two render modes, picked by the tenant in /admin/branding:
//   - solid    → flat --color-primary fill, with a single-colour shadow
//   - gradient → background-image driven by --loading-bar-gradient
//                (set in app/layout.tsx from tenant_settings.loading_bar_colors).
//                Animates by sliding the background horizontally so the
//                stops move across the bar during the transition.
//
// z-[60] puts it above the sticky <header> (z-40) and admin drawer
// (z-50) so it's visible even mid-navigation.
export function RouteProgressBar({
  style = 'gradient',
}: {
  style?: 'solid' | 'gradient';
}) {
  const pathname = usePathname();
  const isGradient = style === 'gradient';

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] pointer-events-none h-0.5">
      <motion.div
        key={pathname}
        initial={{ width: '0%', opacity: 1 }}
        animate={{ width: ['0%', '85%', '100%'], opacity: [1, 1, 0] }}
        transition={{
          duration: 0.6,
          times: [0, 0.7, 1],
          ease: EASE.out,
        }}
        className={
          isGradient
            ? 'route-progress-bar--gradient h-full'
            : 'h-full bg-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary)]'
        }
        style={
          isGradient
            ? {
                // 300% width so we have travel distance for the
                // background-position keyframe to slide through.
                backgroundImage: 'var(--loading-bar-gradient)',
                backgroundSize: '300% 100%',
                backgroundRepeat: 'no-repeat',
                // Soft white halo — gradient fill has multiple hues,
                // so colour-matching the shadow doesn't make sense.
                boxShadow: '0 0 10px rgba(255,255,255,0.55)',
              }
            : undefined
        }
        aria-hidden
      />

      {/* The background animation finishes with the route transition. */}
      {isGradient && (
        <style>{`
          @keyframes route-progress-wash {
            0%   { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }
          .route-progress-bar--gradient {
            animation: route-progress-wash 0.6s linear;
          }
          @media (prefers-reduced-motion: reduce) {
            .route-progress-bar--gradient { animation: none; }
          }
        `}</style>
      )}
    </div>
  );
}
