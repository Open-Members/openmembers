/**
 * Deterministic course → color mapping. Lets the calendar differentiate
 * events across multiple courses without the admin having to configure
 * anything. The hash is stable: same course id always lands on the same
 * swatch across sessions and users.
 *
 * Palette is tuned for dark-mode-first — muted saturation so the pills
 * stay readable on the card backgrounds, with a `ring` variant we use
 * around focused or hovered events.
 */
export type CourseSwatch = {
  /** Solid background for pills + dots. Use inline style `backgroundColor`. */
  bg: string;
  /** Foreground color for text inside pills. */
  fg: string;
  /** Subtle tinted surface — same hue at ~14% opacity, works as popover accent. */
  soft: string;
  /** Border tone when the pill sits on its own soft surface. */
  border: string;
};

const PALETTE: CourseSwatch[] = [
  { bg: '#f59e0b', fg: '#1a1200', soft: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.45)' },  // amber
  { bg: '#14b8a6', fg: '#041816', soft: 'rgba(20, 184, 166, 0.14)', border: 'rgba(20, 184, 166, 0.45)' },  // teal
  { bg: '#f43f5e', fg: '#1a0307', soft: 'rgba(244, 63, 94, 0.14)',  border: 'rgba(244, 63, 94, 0.45)'  },  // rose
  { bg: '#8b5cf6', fg: '#12061f', soft: 'rgba(139, 92, 246, 0.14)', border: 'rgba(139, 92, 246, 0.45)' },  // violet
  { bg: '#22c55e', fg: '#031a09', soft: 'rgba(34, 197, 94, 0.14)',  border: 'rgba(34, 197, 94, 0.45)'  },  // green
  { bg: '#3b82f6', fg: '#02091c', soft: 'rgba(59, 130, 246, 0.14)', border: 'rgba(59, 130, 246, 0.45)' },  // blue
  { bg: '#ec4899', fg: '#1a0210', soft: 'rgba(236, 72, 153, 0.14)', border: 'rgba(236, 72, 153, 0.45)' },  // pink
  { bg: '#a3e635', fg: '#0d1603', soft: 'rgba(163, 230, 53, 0.14)', border: 'rgba(163, 230, 53, 0.45)' },  // lime
];

/** Stable 32-bit FNV-1a hash. Small, fast, collision-tolerant for our volume. */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function swatchForCourse(courseId: string): CourseSwatch {
  const idx = hashString(courseId) % PALETTE.length;
  return PALETTE[idx];
}
