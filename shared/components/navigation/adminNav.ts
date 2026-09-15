import {
  LayoutDashboard,
  Library,
  UsersRound,
  Package,
  LayoutTemplate,
  Medal,
  Megaphone,
  Plug,
  Paintbrush,
  MenuSquare,
  LifeBuoy,
  Radio,
  BarChart3,
  Mail,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavHref =
  | '/admin'
  | '/admin/reports'
  | '/admin/content'
  | '/admin/live-classes'
  | '/admin/certificates'
  | '/admin/users'
  | '/admin/offers'
  | '/admin/announcements'
  | '/admin/emails'
  | '/admin/support'
  | '/admin/home'
  | '/admin/menu'
  | '/admin/branding'
  | '/admin/integrations';

export interface AdminNavItem {
  href: AdminNavHref;
  icon: LucideIcon;
  labelKey: string;
}

export interface AdminNavGroup {
  labelKey: string;
  items: readonly AdminNavItem[];
}

export const adminCommandGroups = ['navigate', 'quickActions'] as const;
export type AdminCommandGroup = (typeof adminCommandGroups)[number];

// Single source of truth for admin navigation. Consumed by the desktop
// AdminSidebar and the mobile drawer in TopNav.
export const adminNavGroups: readonly AdminNavGroup[] = [
  {
    labelKey: 'adminGroups.overview',
    items: [
      { href: '/admin', icon: LayoutDashboard, labelKey: 'adminItems.overview' },
      { href: '/admin/reports', icon: BarChart3, labelKey: 'adminItems.reports' },
    ],
  },
  {
    labelKey: 'adminGroups.learning',
    items: [
      { href: '/admin/content', icon: Library, labelKey: 'adminItems.content' },
      { href: '/admin/live-classes', icon: Radio, labelKey: 'adminItems.liveClasses' },
      { href: '/admin/certificates', icon: Medal, labelKey: 'adminItems.certificates' },
    ],
  },
  {
    labelKey: 'adminGroups.audience',
    items: [
      { href: '/admin/users', icon: UsersRound, labelKey: 'adminItems.users' },
      { href: '/admin/offers', icon: Package, labelKey: 'adminItems.offers' },
      { href: '/admin/announcements', icon: Megaphone, labelKey: 'adminItems.announcements' },
      { href: '/admin/emails', icon: Mail, labelKey: 'adminItems.emails' },
      { href: '/admin/support', icon: LifeBuoy, labelKey: 'adminItems.support' },
    ],
  },
  {
    labelKey: 'adminGroups.storefront',
    items: [
      { href: '/admin/home', icon: LayoutTemplate, labelKey: 'adminItems.home' },
      { href: '/admin/menu', icon: MenuSquare, labelKey: 'adminItems.menu' },
      { href: '/admin/branding', icon: Paintbrush, labelKey: 'adminItems.branding' },
      { href: '/admin/integrations', icon: Plug, labelKey: 'adminItems.integrations' },
    ],
  },
];

export function isAdminLinkActive(pathname: string, href: AdminNavHref): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}
