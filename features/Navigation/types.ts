/**
 * Curated set of Lucide icons the admin can pick from for custom user-menu
 * entries. Keeping this closed prevents typos and lets the renderer avoid
 * dynamic `lucide-react` imports (tree-shake friendly).
 *
 * If you add an icon here, also register it in the MenuIcon renderer and
 * the MenuIconPicker grid.
 */
export const MENU_ICON_NAMES = [
  'MessageCircle',
  'HelpCircle',
  'LifeBuoy',
  'Phone',
  'Mail',
  'Book',
  'Video',
  'FileText',
  'Calendar',
  'CreditCard',
  'Gift',
  'Bell',
  'Users',
  'Globe',
  'Download',
  'Heart',
  'Bookmark',
  'Star',
  'ShieldCheck',
  'ExternalLink',
] as const;

export type MenuIconName = (typeof MENU_ICON_NAMES)[number];

export type CustomMenuItem = {
  id: string;
  label: string;
  url: string;
  iconName: MenuIconName | null;
  sortOrder: number;
  isEnabled: boolean;
};

/**
 * A URL is "external" when it has a protocol (http/https) or a
 * supported contact scheme (mailto:, tel:). External links
 * open in a new tab. Everything else is treated as an internal path.
 */
export function isExternalUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url.trim());
}
