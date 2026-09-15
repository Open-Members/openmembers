export const MAX_REQUEST_BODY_BYTES = 1_048_576;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Payload too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

/** Preserve raw bytes for signatures while bounding application-owned buffering. */
export async function readLimitedRequestBody(request: Request): Promise<Uint8Array> {
  const declaredLength = request.headers.get('content-length')?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
    // Cancellation can depend on remote teardown; never hold the response open for it.
    void request.body?.cancel().catch(() => {});
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  let bytes: Uint8Array | undefined;
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return bytes?.subarray(0, length) ?? new Uint8Array();
      if (value.byteLength > MAX_REQUEST_BODY_BYTES - length) throw new RequestBodyTooLargeError();
      if (value.byteLength === 0) continue;
      bytes ??= new Uint8Array(MAX_REQUEST_BODY_BYTES);
      bytes.set(value, length);
      length += value.byteLength;
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
