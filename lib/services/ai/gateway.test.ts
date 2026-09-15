// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embedOne, chatCompletion, chatCompletionStream } from './gateway';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('AI_GATEWAY_API_KEY', 'fictitious-gateway-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('gateway transport contracts without external requests', () => {
  it('requires a nonempty credential before calling the provider', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', ' ');
    await expect(embedOne('Fictitious material')).rejects.toThrow('AI_GATEWAY_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts the finite 1536-dimensional embedding required by the local schema', async () => {
    const vector = Array(1536).fill(0.01);
    fetchMock.mockResolvedValue(Response.json({ data: [{ embedding: vector }] }));
    expect(await embedOne('Fictitious material')).toEqual(vector);
    expect(fetchMock).toHaveBeenCalledWith('https://ai-gateway.vercel.sh/v1/embeddings', expect.objectContaining({ method: 'POST' }));
  });
  it.each([[], [0.1, 0.2], Array(1536).fill('invalid'), null])('rejects vectors incompatible with pgvector', async embedding => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ embedding }] }));
    await expect(embedOne('Fictitious material')).rejects.toThrow('invalid embedding');
  });
  it.each([
    ['embedding', () => embedOne('Fictitious material')],
    ['chat', () => chatCompletion({ model: 'test/model', messages: [] })],
    ['stream', () => chatCompletionStream({ model: 'test/model', messages: [] })],
  ] as const)('%s errors omit the upstream response body', async (_name, call) => {
    const upstreamBody = 'private provider response';
    fetchMock.mockResolvedValue(new Response(upstreamBody, { status: 429 }));
    const error = await call().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('429');
    expect((error as Error).message).not.toContain(upstreamBody);
  });
});
