/**
 * Color contrast utilities for deriving readable foregrounds on tenant-chosen
 * primary/accent colors. Based on WCAG 2.1 relative luminance.
 */

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  const match = value.trim().match(HEX_RE);
  if (!match) return fallback;
  return `#${match[1].toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Picks black or white foreground for legibility on the given background hex.
 * Threshold 0.179 matches WCAG guidance.
 */
export function getReadableForeground(hex: string): '#000000' | '#ffffff' {
  const rgb = hexToRgb(hex);
  return relativeLuminance(rgb) > 0.179 ? '#000000' : '#ffffff';
}
