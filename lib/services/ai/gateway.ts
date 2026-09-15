/**
 * Thin client for the Vercel AI Gateway.
 *
 * We use the gateway instead of talking to Anthropic / OpenAI directly so that
 * (a) a single env var (AI_GATEWAY_API_KEY) covers every provider, and
 * (b) observability / model fallback / spend tracking all live in one place.
 *
 * Model strings use the provider/model form documented at
 * https://vercel.com/docs/ai-gateway/models.
 */

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) throw new Error('AI_GATEWAY_API_KEY is not set');
  return key;
}

export async function embedOne(input: string): Promise<number[]> {
  const res = await fetch(`${GATEWAY_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway embeddings failed (${res.status})`);
  }
  const json = await res.json();
  const embedding: unknown = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 1536 ||
      !embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('AI gateway returned an invalid embedding');
  }
  return embedding as number[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionArgs {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** If true, caller receives a ReadableStream of SSE bytes. */
  stream?: boolean;
}

/**
 * Non-streaming chat completion. Returns the full response JSON.
 */
export async function chatCompletion(args: ChatCompletionArgs) {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      max_tokens: args.maxTokens ?? 1000,
      temperature: args.temperature ?? 0.7,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway chat failed (${res.status})`);
  }
  return await res.json();
}

/**
 * Streaming chat completion. Returns the raw fetch Response so the caller can
 * pipe `res.body` straight to a Next.js streaming response (SSE format).
 */
export async function chatCompletionStream(args: ChatCompletionArgs): Promise<Response> {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      max_tokens: args.maxTokens ?? 1000,
      temperature: args.temperature ?? 0.7,
      stream: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway chat stream failed (${res.status})`);
  }
  return res;
}
