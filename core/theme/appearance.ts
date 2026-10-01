import { z } from 'zod';
import { normalizePublicUrl } from '@/core/security/public-url';

export const fontFamilySchema = z.enum(['system', 'serif', 'mono', 'inter', 'montserrat', 'lora']);
export type FontFamily = z.infer<typeof fontFamilySchema>;
export const headingFontSchema = fontFamilySchema.or(z.literal('inherit')).nullable();
export const buttonShapeSchema = z.enum(['square', 'rounded', 'pill']).nullable();
export const BUTTON_RADII = { square: '0px', rounded: '12px', pill: '9999px' } as const;
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .transform((value) => value.toLowerCase());
const imageUrl = z
  .string()
  .max(2048)
  .refine((value) => normalizePublicUrl(value) !== null, 'Use a safe public image URL')
  .transform((value) => normalizePublicUrl(value)!);

export const entryBackgroundSchema = z
  .discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('color'), color }),
    z.strictObject({
      mode: z.literal('image'),
      imageUrl,
      position: z.enum(['center', 'top', 'bottom']).default('center'),
      overlayOpacity: z.number().int().min(0).max(100).default(70),
    }),
  ])
  .nullable();

export type EntryBackground = z.infer<typeof entryBackgroundSchema>;
export type EntryScreen = 'home' | 'login' | 'register';
export const ENTRY_BACKGROUND_FIELDS = {
  home: 'public_home_background',
  login: 'login_background',
  register: 'register_background',
} as const;
export const APPEARANCE_COLUMNS = [
  'heading_font_family',
  'button_shape',
  'public_home_title',
  'public_home_description',
  'public_home_background',
  'login_background',
  'register_background',
] as const;

/** Copy values, never a reference to another screen's editable state. */
export function copyEntryBackground(background: EntryBackground): EntryBackground {
  return background === null ? null : { ...background };
}
