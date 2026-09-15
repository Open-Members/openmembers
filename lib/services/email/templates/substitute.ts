/**
 * Replaces `{{varName}}` placeholders in a string with values from `vars`.
 * Unknown placeholders render as empty string so admin-authored content
 * never leaks raw `{{x}}` markers into a student's inbox.
 */
export function substituteVars(
  input: string,
  vars: Record<string, string | null | undefined>,
): string {
  return input.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

/**
 * Apply var substitution to every string field in a content object.
 * Non-string fields pass through untouched. Preserves the caller's
 * type via a cast — content shapes in this codebase are string-only
 * by convention, so callers can trust the return type.
 */
export function applyVarsToContent<T>(
  content: T,
  vars: Record<string, string | null | undefined>,
): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    out[key] = typeof value === 'string' ? substituteVars(value, vars) : value;
  }
  return out as T;
}
