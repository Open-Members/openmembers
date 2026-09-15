import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_SETTINGS, resolveTenantSettings, TENANT_SETTINGS_COLUMNS } from './branding';
import { parseAdminBranding } from './admin-branding';

describe('resolved installation branding', () => {
  it('applies valid database preferences after file configuration and defaults', () => {
    const settings = resolveTenantSettings(
      { site_name: 'File school', primary_color: '#047857', font_family: 'serif', logo_light_url: '/brand.svg' },
      { site_name: 'Saved school', accent_color: '#D97706', logo_light_url: null },
    );
    expect(settings.site_name).toBe('Saved school');
    expect(settings.primary_color).toBe('#047857');
    expect(settings.accent_color).toBe('#d97706');
    expect(settings.font_family).toBe('serif');
    expect(settings.logo_light_url).toBeNull();
    expect(settings.loading_bar_colors).toEqual(['#047857', '#d97706']);
  });

  it('retains configured values when legacy database values are invalid', () => {
    const settings = resolveTenantSettings({ primary_color: '#047857', font_family: 'serif' }, {
      primary_color: 'red;background:url(https://unexpected.example)',
      favicon_url: 'javascript:alert(1)',
      font_family: 'Plus Jakarta Sans',
      home_hero_overlay_opacity: 200,
      loading_bar_colors: ['red'],
    });
    expect(settings.primary_color).toBe('#047857');
    expect(settings.font_family).toBe('serif');
    expect(settings.favicon_url).toBe('/icon.svg');
    expect(settings.home_hero_overlay_opacity).toBe(70);
    expect(settings.loading_bar_colors).toEqual(['#047857', '#f20505']);
  });

  it('preserves a valid explicit gradient and never mutates the default object', () => {
    const settings = resolveTenantSettings({}, { loading_bar_colors: ['#000000', '#FFFFFF'] });
    expect(settings.loading_bar_colors).toEqual(['#000000', '#ffffff']);
    settings.loading_bar_colors.push('#777777');
    expect(resolveTenantSettings().loading_bar_colors).toHaveLength(2);
    expect(DEFAULT_TENANT_SETTINGS.loading_bar_colors).toHaveLength(2);
  });

  it('projects only known settings and validates server-side email fields', () => {
    const settings = resolveTenantSettings({}, {
      email_from_address: 'sender@example.test',
      email_reply_to: 'not-an-email',
      certificate_body: 'private template',
      secret_column: 'private value',
    });
    expect(settings.email_from_address).toBe('sender@example.test');
    expect(settings.email_reply_to).toBeNull();
    expect(settings).not.toHaveProperty('secret_column');
    expect(settings).not.toHaveProperty('certificate_body');
    expect(TENANT_SETTINGS_COLUMNS).not.toContain('*');
    expect(TENANT_SETTINGS_COLUMNS).not.toContain('certificate_body');
  });
});

describe('admin branding input', () => {
  const input = { siteName: '  Jardim Escola  ', primaryColor: '#047857', accentColor: '#D97706' };

  it('normalizes valid preferences and removes the hidden legacy logo fallback', () => {
    const parsed = parseAdminBranding({ ...input, fontFamily: 'serif', logoLightUrl: '/branding.svg' });
    expect(parsed.data).toMatchObject({ site_name: 'Jardim Escola', accent_color: '#d97706', font_family: 'serif', logo_light_url: '/branding.svg', logo_url: null });
  });

  it.each([
    { siteName: 'x'.repeat(121) },
    { primaryColor: '</style>' },
    { faviconUrl: '//outside.example.test/icon.svg' },
    { logoDarkUrl: 'data:image/svg+xml,unsafe' },
    { ogImageUrl: 'https://user:pass@example.test/preview.png' },
    { homeHeroTitle: 'x'.repeat(181) },
    { homeHeroOverlayOpacity: Number.NaN },
    { homeHeroOverlayOpacity: 101 },
    { homeHeroShowText: 'false' },
    { fontFamily: 'url(https://font.example.test/font.woff)' },
    { loadingBarColors: ['#123456'] },
    { loadingBarColors: ['#123456', '</style>'] },
    { unexpected: true },
  ])('rejects invalid or extra admin fields %#', (override) => {
    expect(parseAdminBranding({ ...input, ...override })).toHaveProperty('error');
  });
});
