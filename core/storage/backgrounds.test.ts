import { describe, it, expect, vi } from 'vitest';
import { assertBackgroundUpload, validateBackgroundAsset } from './backgrounds';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('background asset policy', () => {
  it('allows only PNG, JPEG and WebP up to 5 MB', () => {
    expect(() => assertBackgroundUpload('image/png', 5 * 1024 * 1024)).not.toThrow();
    for (const [mime, size] of [
      ['image/svg+xml', 10],
      ['image/gif', 10],
      ['image/png', 5242881],
      ['image/png', 0],
      ['image/png', NaN],
    ] as const) {
      expect(() => assertBackgroundUpload(mime, size)).toThrow();
    }
  });

  function client(mime = 'image/png', size = 8, bytes = [137, 80, 78, 71, 13, 10, 26, 10]) {
    const bucket = {
      getPublicUrl: vi.fn(() => ({
        data: {
          publicUrl:
            'https://storage.test/storage/v1/object/public/platform-assets/branding/backgrounds/',
        },
      })),
      info: vi.fn(async () => ({ data: { contentType: mime, size, metadata: {} }, error: null })),
      download: vi.fn(async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null })),
    };
    return { supabase: { storage: { from: () => bucket } } as unknown as SupabaseClient, bucket };
  }
  it('rejects foreign paths and oversized objects before downloading', async () => {
    const { supabase, bucket } = client('image/png', 5242881);
    await expect(
      validateBackgroundAsset(supabase, 'https://external.test/a.png'),
    ).rejects.toThrow();
    expect(bucket.info).not.toHaveBeenCalled();
    await expect(
      validateBackgroundAsset(
        supabase,
        'https://storage.test/storage/v1/object/public/platform-assets/branding/backgrounds/a.png',
      ),
    ).rejects.toThrow();
    expect(bucket.download).not.toHaveBeenCalled();
  });
  it('checks file signatures rather than trusting the uploaded Content-Type', async () => {
    const url =
      'https://storage.test/storage/v1/object/public/platform-assets/branding/backgrounds/a.png';
    await expect(validateBackgroundAsset(client().supabase, url)).resolves.toBeUndefined();
    await expect(
      validateBackgroundAsset(client('image/png', 4, [60, 115, 118, 103]).supabase, url),
    ).rejects.toThrow();
  });
});
