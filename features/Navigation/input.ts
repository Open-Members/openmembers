import { z } from 'zod';
import { normalizePublicUrl } from '@/core/security/public-url';
import { MENU_ICON_NAMES } from './types';

const menuInput = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().transform(value => normalizePublicUrl(value, { allowContact: true }))
    .refine(value => value !== null),
  iconName: z.enum(MENU_ICON_NAMES).nullable(),
  isEnabled: z.boolean(),
});

export function validateCustomMenuInput(input: unknown) {
  const parsed = menuInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (field === 'label') {
      return { error: issue?.code === 'too_big' ? 'labelTooLong' : 'labelRequired' } as const;
    }
    if (field === 'url') return { error: 'invalidUrl' } as const;
    return { error: 'invalidInput' } as const;
  }
  return { ...parsed.data, url: parsed.data.url! };
}
