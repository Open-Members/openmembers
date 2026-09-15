import { describe, expect, it } from 'vitest';
import { parseInstallationConfig } from '@/core/config/installation';
import { resolveTenantSettings } from './branding';
import { createInstallationManifest, createInstallationMetadata, createThemeCss } from './presentation';

describe('installation presentation', () => {
  const metadataBase = new URL('http://localhost:3000');
  const defaultDescription = 'Access your courses and learning materials.';
  const config = parseInstallationConfig({
    branding: { site_name: 'Jardim Escola', primary_color: '#047857', accent_color: '#d97706', font_family: 'serif', favicon_url: '/garden.svg', og_image_url: 'https://assets.example.test/garden.png' },
    metadata: { description: 'Cursos para cultivar ideias.', shortName: 'Jardim' },
  });
  const settings = resolveTenantSettings(config.branding);

  it('derives the full palette, interaction colors and loading gradient from the selected colors', () => {
    const css = createThemeCss(settings);
    expect(css).toContain('--color-primary:#047857;');
    expect(css).toContain('--color-primary-500:#047857;');
    expect(css).toContain('--color-primary-700:color-mix(in srgb, #047857, black 30%)');
    expect(css).toContain('--color-primary-hover:var(--color-primary-700)');
    expect(css).toContain('--loading-bar-gradient:linear-gradient(90deg, #047857, #d97706, #047857)');
    expect(css).toContain('--font-sans:ui-serif, Georgia');
    expect(css).not.toContain('#0235a8');
    expect(css).not.toContain('#f20505');
  });

  it('does not embed invalid style values supplied by a legacy record', () => {
    const css = createThemeCss({ ...settings, primary_color: '</style><script>bad</script>' });
    expect(css).not.toContain('</style>');
    expect(css).not.toContain('<script>');
  });

  it('uses a dark foreground for a light brand color', () => {
    expect(createThemeCss({ ...settings, primary_color: '#ffff00' })).toContain('--color-primary-foreground:#000000');
  });

  it('exposes the chosen name, description and share image in metadata', () => {
    expect(createInstallationMetadata(settings, config, metadataBase, defaultDescription)).toMatchObject({
      title: 'Jardim Escola', applicationName: 'Jardim Escola', description: 'Cursos para cultivar ideias.',
      icons: { icon: '/garden.svg' }, openGraph: { siteName: 'Jardim Escola', images: [{ url: 'https://assets.example.test/garden.png' }] },
    });
  });

  it('uses the same identity in the installable manifest', () => {
    expect(createInstallationManifest(settings, config, defaultDescription)).toMatchObject({
      name: 'Jardim Escola', short_name: 'Jardim', description: 'Cursos para cultivar ideias.', theme_color: '#047857', icons: [{ src: '/garden.svg', sizes: 'any', type: 'image/svg+xml' }],
    });
  });

  it('resolves relative social previews against the explicit canonical origin', () => {
    const metadata = createInstallationMetadata({ ...settings, og_image_url: '/garden-preview.png' }, config, new URL('https://members.example.test'), defaultDescription);
    expect(new URL(metadata.metadataBase!.toString()).origin).toBe('https://members.example.test');
    expect(new URL('/garden-preview.png', metadata.metadataBase!).href).toBe('https://members.example.test/garden-preview.png');
  });

  it('does not invent an image format or size for an uploaded raster icon', () => {
    const manifest = createInstallationManifest({ ...settings, favicon_url: 'https://assets.example.test/custom.png' }, parseInstallationConfig({}), defaultDescription);
    expect(manifest.short_name).toBe('Jardim Escola');
    expect(manifest.icons?.[0]).toEqual({ src: 'https://assets.example.test/custom.png', purpose: 'any' });
  });

  it.each([
    'Access your courses and learning materials.',
    'Acesse seus cursos e materiais de aprendizagem.',
    'Accede a tus cursos y materiales de aprendizaje.',
  ])('localizes absent metadata and manifest copy: %s', (description) => {
    const defaults = parseInstallationConfig({});
    expect(createInstallationMetadata(settings, defaults, metadataBase, description)).toMatchObject({
      description, openGraph: { description },
    });
    expect(createInstallationManifest(settings, defaults, description).description).toBe(description);
  });

  it('preserves authored copy even when it equals the former English default', () => {
    const authored = parseInstallationConfig({ metadata: { description: defaultDescription } });
    const translated = 'Acesse seus cursos e materiais de aprendizagem.';
    expect(createInstallationMetadata(settings, authored, metadataBase, translated)).toMatchObject({
      description: defaultDescription, openGraph: { description: defaultDescription },
    });
    expect(createInstallationManifest(settings, authored, translated).description).toBe(defaultDescription);
  });
});
