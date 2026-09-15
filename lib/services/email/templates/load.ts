import { createAdminClient } from '@/core/supabase/admin';
import type { Locale } from '@/core/i18n/config';
import {
  getEmailTemplateDefaults,
  type EmailTemplateContent,
  type EmailTemplateKey,
} from './localization';

function isContentObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeKnownContent<T extends object>(
  defaults: T,
  override: Partial<T> | null,
): T {
  if (!override) return { ...defaults };

  const merged = { ...defaults } as Record<string, unknown>;
  const defaultFields = defaults as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (!Object.hasOwn(defaultFields, key)) continue;
    if (typeof defaultFields[key] === 'string' && typeof value !== 'string') {
      throw new Error('invalidContent');
    }
    merged[key] = value;
  }
  return merged as T;
}

/**
 * Reads only the authored row. A missing row is a normal `null`; an unavailable
 * or malformed row is an operational failure and must stop delivery.
 */
export async function loadTemplateOverride<T extends object>(
  templateKey: string,
): Promise<Partial<T> | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('content')
    .eq('template_key', templateKey)
    .maybeSingle();

  if (error) throw new Error('loadFailed');
  if (!data) return null;
  if (!isContentObject(data.content)) throw new Error('invalidContent');
  return data.content as Partial<T>;
}

/** Pure merge: row presence is authorship, including text equal to EN defaults. */
export function resolveTemplateContent<K extends EmailTemplateKey>(
  templateKey: K,
  locale: Locale,
  override: Partial<EmailTemplateContent<K>> | null,
): EmailTemplateContent<K> {
  return mergeKnownContent(
    getEmailTemplateDefaults(templateKey, locale),
    override,
  );
}

export async function loadLocalizedTemplateContent<K extends EmailTemplateKey>(
  templateKey: K,
  locale: Locale,
): Promise<EmailTemplateContent<K>> {
  const override = await loadTemplateOverride<EmailTemplateContent<K>>(templateKey);
  return resolveTemplateContent(templateKey, locale, override);
}

/**
 * Load admin-customised content for a template, merged on top of the
 * hardcoded defaults. Missing DB row ⇒ defaults are returned unchanged.
 *
 * The merge is shallow: the admin edits individual fields, and any field
 * they haven't touched keeps its default value. That way, adding a new
 * field in code doesn't require re-saving every tenant's overrides.
 */
export async function loadTemplateContent<T>(
  templateKey: string,
  defaults: T,
): Promise<T> {
  const override = await loadTemplateOverride<object>(templateKey);
  return mergeKnownContent(defaults as object, override) as T;
}

/** Admin reads need to distinguish a missing override from a failed query. */
export async function loadTemplateContentForAdmin<T>(
  templateKey: string,
  defaults: T,
): Promise<{ content: T; hasOverride: boolean; overrideFields: string[] }> {
  const override = await loadTemplateOverride<object>(templateKey);
  if (!override) {
    return { content: defaults, hasOverride: false, overrideFields: [] };
  }
  const defaultFields = defaults as Record<string, unknown>;
  return {
    content: mergeKnownContent(defaults as object, override) as T,
    hasOverride: true,
    overrideFields: Object.keys(override).filter((key) =>
      Object.hasOwn(defaultFields, key),
    ),
  };
}

export async function saveTemplateContent(
  templateKey: string,
  content: Record<string, unknown>,
): Promise<{ error?: string }> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('email_templates')
      .upsert(
        { template_key: templateKey, content, updated_at: new Date().toISOString() },
        { onConflict: 'template_key' },
      )
      .select('template_key')
      .single();
    if (error || !data) return { error: 'operationFailed' };
    return {};
  } catch {
    return { error: 'operationFailed' };
  }
}

export async function resetTemplateContent(templateKey: string): Promise<{ error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('template_key', templateKey)
      .select('template_key');
    if (error) return { error: 'operationFailed' };
    return {};
  } catch {
    return { error: 'operationFailed' };
  }
}
