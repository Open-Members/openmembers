import crypto from 'node:crypto';

/**
 * Human-typeable temporary password. Avoids ambiguous chars (0/O, l/1, I)
 * so users can read it from email or an admin screen with minimal error.
 * 10 chars — well above Supabase's 6-char minimum.
 */
export function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}
