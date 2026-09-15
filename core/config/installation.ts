import { z } from 'zod';
import { brandingSchema } from '@/core/theme/branding';
import { normalizePublicUrl } from '@/core/security/public-url';

const content = (max: number) => z.string().trim().min(1).max(max);
const link = (allowContact = false) => z.string().max(2048).refine((value) => normalizePublicUrl(value, { allowContact }) !== null, 'Use an HTTPS URL or a safe absolute path').transform((value) => normalizePublicUrl(value, { allowContact })!).nullable().default(null);

export const installationConfigSchema = z.strictObject({
  branding: brandingSchema.partial().default({}),
  public: z.strictObject({
    title: content(180).nullable().default(null),
    description: content(1200).nullable().default(null),
  }).prefault({}),
  metadata: z.strictObject({
    // Null marks a product default, resolved in the request's language.
    // Explicit copy is authored content even when it matches a former default.
    description: content(300).nullable().default(null),
    shortName: content(40).nullable().default(null),
  }).prefault({}),
  links: z.strictObject({
    support: link(true),
    community: link(),
    help: link(true),
    terms: link(),
    privacy: link(),
  }).prefault({}),
});

export type InstallationConfig = z.infer<typeof installationConfigSchema>;

export function parseInstallationConfig(value: unknown): InstallationConfig {
  const result = installationConfigSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'configuration'}: ${issue.code}`).join('; ');
    // Report paths/codes only, never input values or a JSON fragment.
    throw new Error(`Invalid Open Members installation configuration (${issues}). Check openmembers.config.example.json.`);
  }
  return result.data;
}

export const DEFAULT_INSTALLATION_CONFIG = parseInstallationConfig({});
