import 'server-only';

type FetchImplementation = typeof globalThis.fetch;

function configuredOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an HTTP(S) origin without credentials`);
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`${label} must not include a path`);
  }
  return url.origin;
}

function rewriteUrl(
  value: string | URL,
  publicOrigin: string,
  internalOrigin: string,
): string | URL {
  let requested: URL;
  try {
    requested = new URL(value);
  } catch {
    return value;
  }
  if (requested.origin !== publicOrigin) return value;
  return new URL(
    `${requested.pathname}${requested.search}${requested.hash}`,
    internalOrigin,
  );
}

/**
 * Keep Supabase configured with its public URL while routing server-side
 * requests through an installation-local origin available to the container.
 */
export function createOriginRewritingFetch({
  publicUrl,
  internalUrl,
  fetchImpl = globalThis.fetch,
}: {
  publicUrl: string;
  internalUrl: string;
  fetchImpl?: FetchImplementation;
}): FetchImplementation {
  const publicOrigin = configuredOrigin(publicUrl, 'NEXT_PUBLIC_SUPABASE_URL');
  const internalOrigin = configuredOrigin(internalUrl, 'SUPABASE_INTERNAL_URL');

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request) {
      const destination = rewriteUrl(input.url, publicOrigin, internalOrigin);
      const request =
        destination === input.url ? input : new Request(destination, input);
      return fetchImpl(request, init);
    }
    return fetchImpl(rewriteUrl(input, publicOrigin, internalOrigin), init);
  }) as FetchImplementation;
}

export function createSupabaseServerFetch(
  fetchImpl: FetchImplementation = globalThis.fetch,
): FetchImplementation {
  const internalUrl = process.env.SUPABASE_INTERNAL_URL?.trim();
  if (!internalUrl) return fetchImpl;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!publicUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is required when SUPABASE_INTERNAL_URL is set',
    );
  }
  return createOriginRewritingFetch({ publicUrl, internalUrl, fetchImpl });
}
