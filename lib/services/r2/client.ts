import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 speaks the S3 API. We reuse the standard AWS S3 client
 * pointed at the tenant's R2 endpoint. Credentials + endpoint come from
 * env — the module is a thin getter that memoises the client so we
 * don't re-create it for every request.
 */
let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.',
    );
  }

  cachedClient = new S3Client({
    // "auto" region keeps the SDK from signing with a specific region that
    // R2 doesn't care about — R2 ignores the region in the request.
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME is not set.');
  }
  return bucket;
}

/** True when every R2 env var is present. */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim(),
  );
}
