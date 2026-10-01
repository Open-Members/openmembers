import { z } from 'zod';
import { normalizePublicUrl } from '@/core/security/public-url';
import { APPEARANCE_COLUMNS, buttonShapeSchema, entryBackgroundSchema, fontFamilySchema, headingFontSchema } from './appearance';

export const FONT_CATALOG = {
  system: { label: 'System sans-serif', css: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  serif: { label: 'System serif', css: 'ui-serif, Georgia, "Times New Roman", serif' },
  mono: { label: 'System monospace', css: 'ui-monospace, "SFMono-Regular", Consolas, monospace' },
  inter: { label: 'Inter', css: '"Open Members Inter", ui-sans-serif, system-ui, sans-serif' },
  montserrat: { label: 'Montserrat', css: '"Open Members Montserrat", ui-sans-serif, system-ui, sans-serif' },
  lora: { label: 'Lora', css: '"Open Members Lora", ui-serif, Georgia, serif' },
} as const;

export const DEFAULT_LOADING_BAR_COLORS = ['#0235a8', '#f20505'] as const;
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/u, 'Use a six-digit hex color').transform((value) => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Control characters are not allowed');
const nullableText = (max: number) => text(max).nullable();
export const assetUrlSchema = z.string().max(2048).refine((value) => normalizePublicUrl(value) !== null, 'Use an HTTPS URL or a safe absolute path; HTTP is allowed only on localhost').transform((value) => normalizePublicUrl(value)!).nullable();

/** Only presentation fields may be configured in the distributable JSON. */
export const brandingSchema = z.strictObject({
  site_name: text(120),
  logo_url: assetUrlSchema,
  logo_light_url: assetUrlSchema,
  logo_dark_url: assetUrlSchema,
  favicon_url: assetUrlSchema,
  og_image_url: assetUrlSchema,
  primary_color: hexColorSchema,
  accent_color: hexColorSchema,
  secondary_color: hexColorSchema.nullable(),
  font_family: fontFamilySchema,
  heading_font_family: headingFontSchema,
  button_shape: buttonShapeSchema,
  public_home_title: nullableText(180),
  public_home_description: nullableText(1200),
  public_home_background: entryBackgroundSchema,
  login_background: entryBackgroundSchema,
  register_background: entryBackgroundSchema,
  home_hero_banner_url: assetUrlSchema,
  home_hero_trailer_youtube_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u, 'Use a YouTube video ID').nullable(),
  home_hero_title: nullableText(180),
  home_hero_subtitle: nullableText(600),
  home_hero_overlay_opacity: z.number().int().min(0).max(100),
  home_hero_show_text: z.boolean(),
  loading_bar_style: z.enum(['solid', 'gradient']),
  loading_bar_colors: z.array(hexColorSchema).min(2).max(6),
});

export type BrandingSettings = z.infer<typeof brandingSchema>;
export type LoadingBarStyle = BrandingSettings['loading_bar_style'];
export type TenantSettings = BrandingSettings & {
  custom_domain: string | null;
  email_from_address: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  support_inbox_email: string | null;
};

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  site_name: 'Open Members',
  logo_url: null,
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: '/icon.svg',
  og_image_url: null,
  primary_color: '#0235a8',
  accent_color: '#f20505',
  secondary_color: null,
  font_family: 'system',
  heading_font_family: null,
  button_shape: null,
  public_home_title: null,
  public_home_description: null,
  public_home_background: null,
  login_background: null,
  register_background: null,
  custom_domain: null,
  home_hero_banner_url: null,
  home_hero_trailer_youtube_id: null,
  home_hero_title: null,
  home_hero_subtitle: null,
  home_hero_overlay_opacity: 70,
  home_hero_show_text: true,
  loading_bar_style: 'gradient',
  loading_bar_colors: [...DEFAULT_LOADING_BAR_COLORS],
  email_from_address: null,
  email_from_name: null,
  email_reply_to: null,
  support_inbox_email: null,
};

/** Normalize each known field independently; unknown DB columns never escape. */
export function resolveTenantSettings(fileBranding: Partial<BrandingSettings> = {}, databaseRow: unknown = null): TenantSettings {
  const result: TenantSettings = { ...DEFAULT_TENANT_SETTINGS, loading_bar_colors: [...DEFAULT_LOADING_BAR_COLORS] };
  let hasLoadingColors = false;
  for (const source of [fileBranding, databaseRow]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const row = source as Record<string, unknown>;
    for (const [key, schema] of Object.entries(brandingSchema.shape)) {
      if (!(key in row)) continue;
      const parsed = schema.safeParse(row[key]);
      if (parsed.success) {
        Object.assign(result, { [key]: parsed.data });
        if (key === 'loading_bar_colors') hasLoadingColors = true;
      }
    }
  }
  if (databaseRow && typeof databaseRow === 'object' && !Array.isArray(databaseRow)) {
    const row = databaseRow as Record<string, unknown>;
    for (const key of ['email_from_address', 'email_reply_to', 'support_inbox_email'] as const) {
      const parsed = z.email().max(320).nullable().safeParse(row[key]);
      if (parsed.success) result[key] = parsed.data;
    }
    for (const key of ['email_from_name', 'custom_domain'] as const) {
      const parsed = nullableText(255).safeParse(row[key]);
      if (parsed.success) result[key] = parsed.data;
    }
  }
  if (!hasLoadingColors) result.loading_bar_colors = [result.primary_color, result.accent_color];
  return result;
}

export const TENANT_SETTINGS_COLUMNS = [...Object.keys(brandingSchema.shape), 'custom_domain', 'email_from_address', 'email_from_name', 'email_reply_to', 'support_inbox_email'].join(', ');
export const LEGACY_TENANT_SETTINGS_COLUMNS = TENANT_SETTINGS_COLUMNS.split(', ').filter((column) => !APPEARANCE_COLUMNS.some((newColumn) => newColumn === column)).join(', ');
