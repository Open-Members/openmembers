import type { Metadata, MetadataRoute } from 'next';
import type { InstallationConfig } from '@/core/config/installation';
import { FONT_CATALOG, resolveTenantSettings, type TenantSettings } from './branding';
import { getReadableForeground } from './contrast';

/** Every color value is normalized before it enters a style element. */
export function createThemeCss(input: TenantSettings): string {
  const settings = resolveTenantSettings(input);
  const declarations: string[] = [];
  for (const [name, color] of [['primary', settings.primary_color], ['accent', settings.accent_color]] as const) {
    declarations.push(`--color-${name}:${color}`, `--color-${name}-foreground:${getReadableForeground(color)}`);
    for (const [shade, amount] of [[50, 94], [100, 84], [200, 68], [300, 48], [400, 24]] as const) {
      declarations.push(`--color-${name}-${shade}:color-mix(in srgb, ${color}, white ${amount}%)`);
    }
    declarations.push(`--color-${name}-500:${color}`);
    for (const [shade, amount] of [[600, 16], [700, 30], [800, 46], [900, 64]] as const) {
      declarations.push(`--color-${name}-${shade}:color-mix(in srgb, ${color}, black ${amount}%)`);
    }
    declarations.push(`--color-${name}-dark:var(--color-${name}-600)`, `--color-${name}-hover:var(--color-${name}-700)`);
  }
  const colors = settings.loading_bar_colors;
  declarations.push(`--loading-bar-gradient:linear-gradient(90deg, ${[...colors, colors[0]].join(', ')})`);
  declarations.push(`--font-sans:${FONT_CATALOG[settings.font_family].css}`);
  declarations.push(`--color-secondary:${settings.secondary_color ?? settings.accent_color}`);
  const darkTints = (['primary', 'accent'] as const).flatMap((name) => [
    `--color-${name}-50:color-mix(in srgb, var(--color-${name}) 14%, var(--color-background))`,
    `--color-${name}-100:color-mix(in srgb, var(--color-${name}) 22%, var(--color-background))`,
    `--color-${name}-200:color-mix(in srgb, var(--color-${name}) 38%, var(--color-background))`,
  ]);
  return `:root,.dark{${declarations.join(';')};}.dark{${darkTints.join(';')};}`;
}

export function createInstallationMetadata(settings: TenantSettings, config: InstallationConfig, metadataBase: URL, defaultDescription: string): Metadata {
  const description = config.metadata.description ?? defaultDescription;
  return {
    metadataBase,
    title: settings.site_name,
    description,
    applicationName: settings.site_name,
    icons: { icon: settings.favicon_url || '/icon.svg' },
    openGraph: {
      title: settings.site_name,
      siteName: settings.site_name,
      description,
      ...(settings.og_image_url ? { images: [{ url: settings.og_image_url }] } : {}),
    },
  };
}

export function createInstallationManifest(settings: TenantSettings, config: InstallationConfig, defaultDescription: string): MetadataRoute.Manifest {
  const icon = settings.favicon_url || '/icon.svg';
  const isSvg = new URL(icon, 'https://installation.example').pathname.toLowerCase().endsWith('.svg');
  return {
    name: settings.site_name,
    short_name: config.metadata.shortName || settings.site_name,
    description: config.metadata.description ?? defaultDescription,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: settings.primary_color,
    icons: [{ src: icon, ...(isSvg ? { sizes: 'any', type: 'image/svg+xml' } : {}), purpose: 'any' }],
  };
}
