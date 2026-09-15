// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_REQUEST_BODY_BYTES, readLimitedRequestBody, RequestBodyTooLargeError } from './request-body';

function streamed(chunks: Uint8Array[], headers?: HeadersInit, onCancel?: () => void | Promise<void>) {
  let index = 0;
  const cancel = vi.fn(onCancel);
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (index === chunks.length) controller.close();
    else controller.enqueue(chunks[index++]);
  });
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  const request = new Request('https://example.test/webhook', { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
  return { request, cancel, pull };
}

describe('bounded raw request body', () => {
  it('accepts absent and empty bodies', async () => {
    expect(await readLimitedRequestBody(new Request('https://example.test', { method: 'POST' }))).toEqual(new Uint8Array());
    const { request, cancel } = streamed([]);
    expect(await readLimitedRequestBody(request)).toEqual(new Uint8Array());
    expect(request.body?.locked).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('preserves fragmented UTF-8, BOM, whitespace and view offsets as exact bytes', async () => {
    const bytes = new TextEncoder().encode('\uFEFF { "text": "ação — español 🎓" }\n');
    const padded = new Uint8Array(bytes.length + 6).fill(255);
    padded.set(bytes, 3);
    const { request } = streamed([
      new Uint8Array(),
      ...Array.from({ length: bytes.length }, (_, index) => padded.subarray(index + 3, index + 4)),
    ]);
    expect(await readLimitedRequestBody(request)).toEqual(bytes);
    expect(request.body?.locked).toBe(false);
  });

  it('accepts exactly 1 MiB and uses bytes rather than decoded character count', async () => {
    const chunk = new TextEncoder().encode('é'.repeat(MAX_REQUEST_BODY_BYTES / 4));
    const { request, cancel } = streamed([chunk, chunk]);
    const result = await readLimitedRequestBody(request);
    expect(result.byteLength).toBe(MAX_REQUEST_BODY_BYTES);
    expect(new TextDecoder().decode(result)).toBe('é'.repeat(MAX_REQUEST_BODY_BYTES / 2));
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([undefined, '1', 'invalid', '-1', '1.5'])('enforces actual bytes despite Content-Length %s', async contentLength => {
    const { request, cancel, pull } = streamed([
      new Uint8Array(MAX_REQUEST_BODY_BYTES), new Uint8Array(1), new Uint8Array(MAX_REQUEST_BODY_BYTES),
    ], contentLength === undefined ? undefined : { 'content-length': contentLength });
    await expect(readLimitedRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });

  it.each([String(MAX_REQUEST_BODY_BYTES + 1), '9999999999999999999999999999999'])('rejects declared excess %s before a body read', async contentLength => {
    const { request, cancel, pull } = streamed([new Uint8Array(1)], { 'content-length': contentLength });
    await expect(readLimitedRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([false, true])('does not wait for cancellation teardown (early guard: %s)', async early => {
    const { request, cancel } = streamed([new Uint8Array(MAX_REQUEST_BODY_BYTES + 1)],
      early ? { 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) } : undefined,
      () => new Promise(() => {}));
    await expect(readLimitedRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  }, 1000);

  it.each([false, true])('handles rejected cancellation (early guard: %s)', async early => {
    const { request } = streamed([new Uint8Array(MAX_REQUEST_BODY_BYTES + 1)],
      early ? { 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) } : undefined,
      () => Promise.reject(new Error('teardown failed')));
    await expect(readLimitedRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('propagates read failures and releases the reader', async () => {
    const failure = new Error('stream disconnected');
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(failure); } }, { highWaterMark: 0 });
    const request = new Request('https://example.test', { method: 'POST', body, duplex: 'half' } as RequestInit);
    await expect(readLimitedRequestBody(request)).rejects.toBe(failure);
    expect(request.body?.locked).toBe(false);
  });
});
