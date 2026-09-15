'use client';

import { MotionConfig } from 'motion/react';
import { EASE } from './constants';

// Global motion provider.
//
// `reducedMotion="user"` hooks straight into `prefers-reduced-motion`
// at the OS level — every `motion.*` component in the tree silently
// short-circuits for users who've opted out of animation. This pairs
// with the CSS-level reduction already in `app/globals.css`.
//
// Default transition is the app's baseline spring: hover, layout
// changes and any motion that doesn't specify its own transition
// inherits this. Override per-component with `transition={…}` when
// something needs a different feel.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={EASE.spring}>
      {children}
    </MotionConfig>
  );
}
