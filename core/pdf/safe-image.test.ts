// @vitest-environment node

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:http', () => ({ request: mocks.httpRequest }));
vi.mock('node:https', () => ({ request: mocks.httpsRequest }));

import {
  fetchCertificateImage,
  MAX_CERTIFICATE_IMAGE_BYTES,
} from './safe-image';

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
    'base64',
  ),
);

type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
};

function enqueueResponse(
  requestMock: ReturnType<typeof vi.fn>,
  value: MockResponse = {},
) {
  requestMock.mockImplementationOnce(
    (
      _url: URL,
      _options: Record<string, unknown>,
      onResponse: (response: PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      }) => void,
    ) => {
      const request = new EventEmitter() as EventEmitter & {
        end: ReturnType<typeof vi.fn>;
      };
      request.end = vi.fn(() => {
        const response = new PassThrough() as PassThrough & {
          statusCode: number;
          headers: Record<string, string>;
        };
        response.statusCode = value.status ?? 200;
        response.headers = value.headers ?? { 'content-type': 'image/png' };
        onResponse(response);
        response.end(value.body ?? png);
      });
      return request;
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://assets.example.test');
  mocks.lookup.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('certificate image network policy', () => {
  it.each([
    'file:///etc/passwd',
    'http://127.0.0.1/secret.png',
    'http://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://[::1]/secret.png',
  ])('rejects blocked destination %s before connecting', async (url) => {
    await expect(fetchCertificateImage(url)).rejects.toThrow();
    expect(mocks.httpRequest).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it('rejects a hostname when any resolved address is private', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);
    await expect(
      fetchCertificateImage('https://assets.example.test/logo.png'),
    ).rejects.toThrow('certificateImageDestinationBlocked');
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it('rejects an external origin that was not explicitly configured', async () => {
    await expect(
      fetchCertificateImage('https://untrusted.example.test/logo.png'),
    ).rejects.toThrow('certificateImageOriginNotAllowed');
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it('rejects public HTTP even when configured as an additional origin', async () => {
    vi.stubEnv(
      'CERTIFICATE_IMAGE_ALLOWED_ORIGINS',
      'http://assets-http.example.test',
    );
    await expect(
      fetchCertificateImage('http://assets-http.example.test/logo.png'),
    ).rejects.toThrow('certificateImageOriginNotAllowed');
    expect(mocks.httpRequest).not.toHaveBeenCalled();
  });

  it('resolves relative URLs only against a public configured site', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://members.example.test');
    enqueueResponse(mocks.httpsRequest, {
      headers: {
        'content-type': 'image/png',
        'content-length': String(png.byteLength),
      },
    });

    await expect(fetchCertificateImage('/logo.png')).resolves.toMatchObject({
      bytes: png,
      contentType: 'image/png',
    });
    expect(mocks.httpsRequest).toHaveBeenCalledWith(
      new URL('https://members.example.test/logo.png'),
      expect.objectContaining({
        lookup: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
      expect.any(Function),
    );
  });

  it('pins the connection lookup to the address already validated', async () => {
    enqueueResponse(mocks.httpsRequest);
    await fetchCertificateImage('https://assets.example.test/logo.png');

    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    const options = mocks.httpsRequest.mock.calls[0][1] as {
      lookup: (
        hostname: string,
        options: { family: number; all: boolean },
        callback: (error: Error | null, address: string, family: number) => void,
      ) => void;
    };
    const callback = vi.fn();
    options.lookup(
      'assets.example.test',
      { family: 4, all: false },
      callback,
    );
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('allows the exact configured local Supabase origin without DNS lookup', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431');
    enqueueResponse(mocks.httpRequest);
    await expect(
      fetchCertificateImage(
        'http://127.0.0.1:55431/storage/v1/object/public/platform-assets/logo.png',
      ),
    ).resolves.toMatchObject({ contentType: 'image/png' });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpRequest).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ lookup: undefined }),
      expect.any(Function),
    );
  });

  it('routes a trusted public Supabase image through the configured server origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:56431');
    vi.stubEnv('SUPABASE_INTERNAL_URL', 'http://host.docker.internal:56431');
    enqueueResponse(mocks.httpRequest);

    await expect(
      fetchCertificateImage(
        'http://127.0.0.1:56431/storage/v1/object/public/platform-assets/logo.png?version=2',
      ),
    ).resolves.toMatchObject({ contentType: 'image/png' });

    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpRequest).toHaveBeenCalledWith(
      new URL(
        'http://host.docker.internal:56431/storage/v1/object/public/platform-assets/logo.png?version=2',
      ),
      expect.objectContaining({ lookup: undefined }),
      expect.any(Function),
    );
  });

  it('routes a relative site image through the configured internal application origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3201');
    vi.stubEnv('OPENMEMBERS_INTERNAL_URL', 'http://127.0.0.1:3000');
    enqueueResponse(mocks.httpRequest);

    await expect(fetchCertificateImage('/brand/logo.png')).resolves.toMatchObject({
      contentType: 'image/png',
    });

    expect(mocks.httpRequest).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:3000/brand/logo.png'),
      expect.objectContaining({ lookup: undefined }),
      expect.any(Function),
    );
  });

  it.each([
    'host.docker.internal:56431',
    'ftp://host.docker.internal',
    'http://user:pass@host.docker.internal',
    'http://host.docker.internal/private',
    'http://host.docker.internal/?token=private',
  ])('fails closed for an invalid internal image origin: %s', async (value) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:56431');
    vi.stubEnv('SUPABASE_INTERNAL_URL', value);

    await expect(
      fetchCertificateImage(
        'http://127.0.0.1:56431/storage/v1/object/public/platform-assets/logo.png',
      ),
    ).rejects.toThrow('certificateImageInternalOriginInvalid');
    expect(mocks.httpRequest).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it('does not treat an IPv4-mapped private IPv6 literal as public', async () => {
    vi.stubEnv(
      'CERTIFICATE_IMAGE_ALLOWED_ORIGINS',
      'https://[::ffff:7f00:1]',
    );
    await expect(
      fetchCertificateImage('https://[::ffff:7f00:1]/logo.png'),
    ).rejects.toThrow('certificateImageDestinationBlocked');
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it('accepts only PNG/JPEG and enforces declared byte limits', async () => {
    enqueueResponse(mocks.httpsRequest, {
      headers: { 'content-type': 'text/html' },
      body: 'private response',
    });
    await expect(
      fetchCertificateImage('https://assets.example.test/logo.png'),
    ).rejects.toThrow('certificateImageTypeInvalid');

    enqueueResponse(mocks.httpsRequest, {
      headers: {
        'content-type': 'image/png',
        'content-length': String(MAX_CERTIFICATE_IMAGE_BYTES + 1),
      },
    });
    await expect(
      fetchCertificateImage('https://assets.example.test/logo.png'),
    ).rejects.toThrow('certificateImageTooLarge');
  });

  it('enforces the byte limit while streaming an undeclared response', async () => {
    enqueueResponse(mocks.httpsRequest, {
      body: new Uint8Array(MAX_CERTIFICATE_IMAGE_BYTES + 1),
    });
    await expect(
      fetchCertificateImage('https://assets.example.test/logo.png'),
    ).rejects.toThrow('certificateImageTooLarge');
  });

  it('does not follow a redirect response', async () => {
    enqueueResponse(mocks.httpsRequest, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private' },
      body: '',
    });
    await expect(
      fetchCertificateImage('https://assets.example.test/logo.png'),
    ).rejects.toThrow('certificateImageFetchFailed');
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    expect(mocks.httpRequest).not.toHaveBeenCalled();
  });
});
