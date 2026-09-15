import {
  MessageCircle,
  HelpCircle,
  LifeBuoy,
  Phone,
  Mail,
  Book,
  Video,
  FileText,
  Calendar,
  CreditCard,
  Gift,
  Bell,
  Users,
  Globe,
  Download,
  Heart,
  Bookmark,
  Star,
  ShieldCheck,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import type { MenuIconName } from '../types';

const ICONS: Record<MenuIconName, LucideIcon> = {
  MessageCircle,
  HelpCircle,
  LifeBuoy,
  Phone,
  Mail,
  Book,
  Video,
  FileText,
  Calendar,
  CreditCard,
  Gift,
  Bell,
  Users,
  Globe,
  Download,
  Heart,
  Bookmark,
  Star,
  ShieldCheck,
  ExternalLink,
};

export function MenuIcon({
  name,
  className,
  fallback,
}: {
  name: MenuIconName | null;
  className?: string;
  fallback?: LucideIcon;
}) {
  const Icon = name ? ICONS[name] : fallback ?? ExternalLink;
  return <Icon className={className} />;
}

export { ICONS as MENU_ICON_COMPONENTS };
