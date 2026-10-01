import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntryBackground } from '@/core/theme/appearance';

export const BACKGROUND_FOLDER = 'branding/backgrounds';
export const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;
export const BACKGROUND_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function assertBackgroundUpload(mime: string, size: number) {
  if (
    !BACKGROUND_MIME_TYPES.some((allowed) => allowed === mime) ||
    !Number.isFinite(size) ||
    size <= 0 ||
    size > BACKGROUND_MAX_BYTES
  ) {
    throw new Error('Backgrounds require PNG, JPEG or WebP up to 5 MB.');
  }
}

export async function validateBackgroundAsset(client: SupabaseClient, url: string): Promise<void> {
  const bucket = client.storage.from('platform-assets');
  const prefix = bucket.getPublicUrl(`${BACKGROUND_FOLDER}/`).data.publicUrl;
  if (!url.startsWith(prefix)) throw new Error('Invalid background asset.');
  const name = url.slice(prefix.length);
  if (!/^[\w.-]+$/u.test(name) || name.includes('..')) throw new Error('Invalid background path.');
  const path = `${BACKGROUND_FOLDER}/${name}`;
  const { data: info, error } = await bucket.info(path);
  if (error || !info) throw new Error('Background asset unavailable.');
  const mime = String(info.contentType ?? '');
  assertBackgroundUpload(mime, Number(info.size));
  const { data, error: downloadError } = await bucket.download(path);
  if (downloadError || !data) throw new Error('Background asset unavailable.');
  assertBackgroundUpload(mime, data.size);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(mime === 'image/png' ? png : mime === 'image/jpeg' ? jpeg : webp))
    throw new Error('Invalid background image content.');
}

export async function validateBackgroundAssets(
  client: SupabaseClient,
  backgrounds: (EntryBackground | undefined)[],
  configuredImageUrls: ReadonlySet<string> = new Set(),
) {
  const urls = new Set(
    backgrounds
      .filter((background) => background?.mode === 'image')
      .map((background) => (background as Extract<EntryBackground, { mode: 'image' }>).imageUrl),
  );
  // Only the server's validated installation file supplies this allowlist.
  // New uploaded references still require owned Storage objects and content checks.
  await Promise.all(
    [...urls]
      .filter((url) => !configuredImageUrls.has(url))
      .map((url) => validateBackgroundAsset(client, url)),
  );
}
