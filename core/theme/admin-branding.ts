import { z } from 'zod';
import { brandingSchema } from './branding';

const fields = brandingSchema.shape;
const adminBrandingSchema = z.strictObject({
  siteName: fields.site_name,
  logoLightUrl: fields.logo_light_url.optional(),
  logoDarkUrl: fields.logo_dark_url.optional(),
  faviconUrl: fields.favicon_url.optional(),
  ogImageUrl: fields.og_image_url.optional(),
  primaryColor: fields.primary_color,
  accentColor: fields.accent_color,
  secondaryColor: fields.secondary_color.optional(),
  fontFamily: fields.font_family.optional(),
  headingFontFamily: fields.heading_font_family.optional(),
  buttonShape: fields.button_shape.optional(),
  publicHomeTitle: fields.public_home_title.optional(),
  publicHomeDescription: fields.public_home_description.optional(),
  publicHomeBackground: fields.public_home_background.optional(),
  loginBackground: fields.login_background.optional(),
  registerBackground: fields.register_background.optional(),
  homeHeroBannerUrl: fields.home_hero_banner_url.optional(),
  homeHeroTrailerYoutubeId: fields.home_hero_trailer_youtube_id.optional(),
  homeHeroTitle: fields.home_hero_title.optional(),
  homeHeroSubtitle: fields.home_hero_subtitle.optional(),
  homeHeroOverlayOpacity: fields.home_hero_overlay_opacity.optional(),
  homeHeroShowText: fields.home_hero_show_text.optional(),
  loadingBarStyle: fields.loading_bar_style.optional(),
  loadingBarColors: fields.loading_bar_colors.optional(),
});

export function parseAdminBranding(input: unknown) {
  const result = adminBrandingSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: `Invalid branding field: ${issue.path.join('.') || 'configuration'}. ${issue.code}` } as const;
  }
  const settings = result.data;
  return { data: {
    site_name: settings.siteName,
    // After saving, the two visible fields fully determine the logo. A hidden
    // legacy logo must not reappear when the administrator removes both images.
    logo_url: null,
    logo_light_url: settings.logoLightUrl ?? null,
    logo_dark_url: settings.logoDarkUrl ?? null,
    favicon_url: settings.faviconUrl ?? null,
    og_image_url: settings.ogImageUrl ?? null,
    primary_color: settings.primaryColor,
    accent_color: settings.accentColor,
    ...(settings.secondaryColor !== undefined && { secondary_color: settings.secondaryColor }),
    ...(settings.fontFamily !== undefined && { font_family: settings.fontFamily }),
    ...(settings.headingFontFamily !== undefined && { heading_font_family: settings.headingFontFamily }),
    ...(settings.buttonShape !== undefined && { button_shape: settings.buttonShape }),
    ...(settings.publicHomeTitle !== undefined && { public_home_title: settings.publicHomeTitle }),
    ...(settings.publicHomeDescription !== undefined && { public_home_description: settings.publicHomeDescription }),
    ...(settings.publicHomeBackground !== undefined && { public_home_background: settings.publicHomeBackground }),
    ...(settings.loginBackground !== undefined && { login_background: settings.loginBackground }),
    ...(settings.registerBackground !== undefined && { register_background: settings.registerBackground }),
    home_hero_banner_url: settings.homeHeroBannerUrl ?? null,
    home_hero_trailer_youtube_id: settings.homeHeroTrailerYoutubeId ?? null,
    home_hero_title: settings.homeHeroTitle ?? null,
    home_hero_subtitle: settings.homeHeroSubtitle ?? null,
    ...(settings.homeHeroOverlayOpacity !== undefined && { home_hero_overlay_opacity: settings.homeHeroOverlayOpacity }),
    ...(settings.homeHeroShowText !== undefined && { home_hero_show_text: settings.homeHeroShowText }),
    ...(settings.loadingBarStyle !== undefined && { loading_bar_style: settings.loadingBarStyle }),
    ...(settings.loadingBarColors !== undefined && { loading_bar_colors: settings.loadingBarColors }),
  } } as const;
}
