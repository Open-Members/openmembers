import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export const MAX_CERTIFICATE_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const DNS_TIMEOUT_MS = 2_000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

type TrustedOrigin = {
  origin: string;
  allowConfiguredLoopback: boolean;
};

type PinnedAddress = {
  address: string;
  family: 4 | 6;
};

type ResolvedImageUrl = {
  url: URL;
  pinnedAddresses: PinnedAddress[] | null;
};

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

function fail(code: string): never {
  throw new Error(code);
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function embeddedIpv4Address(address: string): string | null {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const dotted = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dotted && isIP(dotted) === 4) return dotted;

  const hexadecimal = normalized.match(
    /^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u,
  );
  if (!hexadecimal) return null;
  const high = Number.parseInt(hexadecimal[1], 16);
  const low = Number.parseInt(hexadecimal[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedV4 = embeddedIpv4Address(normalized);
  if (mappedV4 && isIP(mappedV4) === 4) {
    return mappedV4.split('.')[0] === '127';
  }
  if (isIP(normalized) === 4) return normalized.split('.')[0] === '127';
  return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isLoopbackAddress(hostname)
  );
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data.ec2.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa')
  );
}

function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedV4 = embeddedIpv4Address(normalized);
  if (mappedV4 && isIP(mappedV4) === 4) {
    return blockedAddresses.check(mappedV4, 'ipv4');
  }
  const family = isIP(normalized);
  if (family === 4) return blockedAddresses.check(normalized, 'ipv4');
  if (family === 6) return blockedAddresses.check(normalized, 'ipv6');
  return true;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('certificateImageDnsTimeout')),
          milliseconds,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolvePublicDestination(url: URL): Promise<PinnedAddress[]> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('certificateImageProtocolInvalid');
  }
  if (url.username || url.password) fail('certificateImageCredentialsInvalid');

  const hostname = normalizedHostname(url);
  if (!hostname || isBlockedHostname(hostname)) {
    fail('certificateImageDestinationBlocked');
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) fail('certificateImageDestinationBlocked');
    return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  }

  let addresses: LookupAddress[];
  try {
    addresses = await withTimeout(
      lookup(hostname, { all: true, verbatim: true }),
      DNS_TIMEOUT_MS,
    );
  } catch {
    fail('certificateImageDestinationUnavailable');
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedAddress(address))
  ) {
    fail('certificateImageDestinationBlocked');
  }
  return addresses
    .filter(
      (entry): entry is typeof entry & { family: 4 | 6 } =>
        entry.family === 4 || entry.family === 6,
    )
    .map(({ address, family }) => ({ address, family }));
}

function configuredOrigin(
  value: string | undefined,
  allowConfiguredLoopback: boolean,
): TrustedOrigin | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === 'http:' &&
      allowConfiguredLoopback &&
      isLoopbackHostname(normalizedHostname(url));
    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return { origin: url.origin, allowConfiguredLoopback };
  } catch {
    return null;
  }
}

function trustedOrigins(): TrustedOrigin[] {
  const origins = [
    configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL, true),
    configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, true),
    ...(process.env.CERTIFICATE_IMAGE_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((entry) => configuredOrigin(entry.trim(), false)),
  ].filter((entry): entry is TrustedOrigin => entry !== null);
  return origins.filter(
    (entry, index) =>
      origins.findIndex((candidate) => candidate.origin === entry.origin) ===
      index,
  );
}

function internalOrigin(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    fail('certificateImageInternalOriginInvalid');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    fail('certificateImageInternalOriginInvalid');
  }
  return url;
}

/** Rewrite only an already trusted public origin to its explicit server route. */
function internalImageUrl(url: URL): URL {
  const mappings = [
    [
      configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, true),
      process.env.SUPABASE_INTERNAL_URL,
    ],
    [
      configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL, true),
      process.env.OPENMEMBERS_INTERNAL_URL,
    ],
  ] as const;

  for (const [publicOrigin, internalValue] of mappings) {
    if (!publicOrigin || publicOrigin.origin !== url.origin || !internalValue) {
      continue;
    }
    const internal = internalOrigin(internalValue);
    if (!internal) continue;
    return new URL(`${url.pathname}${url.search}${url.hash}`, internal);
  }
  return url;
}

async function resolveTrustedDestination(
  url: URL,
): Promise<PinnedAddress[] | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('certificateImageProtocolInvalid');
  }
  if (url.username || url.password) fail('certificateImageCredentialsInvalid');

  const trusted = trustedOrigins().find((entry) => entry.origin === url.origin);
  if (!trusted) fail('certificateImageOriginNotAllowed');
  const hostname = normalizedHostname(url);
  if (trusted.allowConfiguredLoopback && isLoopbackHostname(hostname)) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      fail('certificateImageProtocolInvalid');
    }
    return null;
  }
  if (url.protocol !== 'https:') fail('certificateImageProtocolInvalid');
  return resolvePublicDestination(url);
}

async function resolveImageUrl(value: string): Promise<ResolvedImageUrl> {
  const raw = value.trim();
  if (!raw || raw.length > 2_048 || /[\u0000-\u001f\u007f\\]/u.test(raw)) {
    fail('certificateImageUrlInvalid');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    const baseValue = process.env.NEXT_PUBLIC_SITE_URL;
    if (!baseValue) fail('certificateImageRelativeUrlUnavailable');
    let base: URL;
    try {
      base = new URL(baseValue);
    } catch {
      fail('certificateImageRelativeUrlUnavailable');
    }
    const siteOrigin = configuredOrigin(baseValue, true);
    if (!siteOrigin || base.origin !== siteOrigin.origin) {
      fail('certificateImageRelativeUrlUnavailable');
    }
    url = new URL(raw, base);
    if (url.origin !== base.origin) fail('certificateImageDestinationBlocked');
  }

  const pinnedAddresses = await resolveTrustedDestination(url);
  const requestUrl = internalImageUrl(url);
  return {
    url: requestUrl,
    pinnedAddresses: requestUrl === url ? pinnedAddresses : null,
  };
}

export type CertificateImage = {
  bytes: Uint8Array;
  contentType: 'image/png' | 'image/jpeg';
};

function normalizeFamily(value: unknown): 0 | 4 | 6 {
  if (value === 4 || value === 'IPv4') return 4;
  if (value === 6 || value === 'IPv6') return 6;
  return 0;
}

function createPinnedLookup(addresses: PinnedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const family = normalizeFamily(options.family);
    const candidates = family
      ? addresses.filter((entry) => entry.family === family)
      : addresses;
    if (candidates.length === 0) {
      const error = new Error('certificateImagePinnedAddressUnavailable') as
        NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '', 0);
      return;
    }
    if (options.all) {
      callback(null, candidates, undefined);
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

function singleHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function requestCertificateImage(
  destination: ResolvedImageUrl,
): Promise<CertificateImage> {
  const { url, pinnedAddresses } = destination;
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const rejectStable = () => reject(new Error('certificateImageFetchFailed'));
    let request;
    try {
      request = transport(
        url,
        {
          method: 'GET',
          headers: { Accept: 'image/png, image/jpeg' },
          lookup: pinnedAddresses
            ? createPinnedLookup(pinnedAddresses)
            : undefined,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
        (response) => {
          void (async () => {
            try {
              const status = response.statusCode ?? 0;
              if (status < 200 || status >= 300) {
                response.resume();
                fail('certificateImageFetchFailed');
              }

              const contentType = singleHeader(
                response.headers,
                'content-type',
              )
                ?.split(';', 1)[0]
                .trim()
                .toLowerCase();
              if (!contentType || !IMAGE_TYPES.has(contentType)) {
                response.resume();
                fail('certificateImageTypeInvalid');
              }

              const declaredLength = singleHeader(
                response.headers,
                'content-length',
              );
              if (declaredLength !== undefined) {
                if (!/^\d+$/u.test(declaredLength)) {
                  response.destroy();
                  fail('certificateImageLengthInvalid');
                }
                if (Number(declaredLength) > MAX_CERTIFICATE_IMAGE_BYTES) {
                  response.destroy();
                  fail('certificateImageTooLarge');
                }
              }

              const chunks: Buffer[] = [];
              let received = 0;
              for await (const value of response) {
                const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
                received += chunk.byteLength;
                if (received > MAX_CERTIFICATE_IMAGE_BYTES) {
                  response.destroy();
                  fail('certificateImageTooLarge');
                }
                chunks.push(chunk);
              }
              if (received === 0) fail('certificateImageFetchFailed');

              resolve({
                bytes: new Uint8Array(Buffer.concat(chunks, received)),
                contentType: contentType as CertificateImage['contentType'],
              });
            } catch (error) {
              reject(
                error instanceof Error &&
                  error.message.startsWith('certificateImage')
                  ? error
                  : new Error('certificateImageFetchFailed'),
              );
            }
          })();
        },
      );
    } catch {
      rejectStable();
      return;
    }
    request.once('error', rejectStable);
    request.end();
  });
}

/** Fetch a small trusted PNG/JPEG using the address validated before connect. */
export async function fetchCertificateImage(value: string): Promise<CertificateImage> {
  return requestCertificateImage(await resolveImageUrl(value));
}
