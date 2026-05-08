import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { toEmbeddingConfig } from '@/core/profiles/materialize';
import { AppContext } from '@/app/context/AppContext';
import { UsageRecordedViewEvent } from '@/core/eventBus';

/**
 * Embed multiple texts using the active embedding profile.
 * Uses OpenAI-format embeddings API (compatible with OpenAI, Ollama, LM Studio, etc.).
 *
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors (one per input text)
 * @throws If no embedding profile is configured, or the API call fails
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const startMs = Date.now();
  const registry = ProfileRegistry.getInstance();
  const profile =
    registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
  if (!profile) throw new Error('No embedding profile configured');

  const config = toEmbeddingConfig(profile);
  if (!config)
    throw new Error('Embedding endpoint not configured on active profile');

  const response = await fetch(`${config.endpoint}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Embedding API error ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const promptTokens: number = data.usage?.prompt_tokens ?? 0;
  const embeddings = (data.data as Array<{ embedding: number[] }>).map(
    (item) => item.embedding,
  );

  if (promptTokens > 0) {
    try {
      const durationMs = Date.now() - startMs;
      AppContext.getInstance().eventBus.dispatch(new UsageRecordedViewEvent({
        sessionId: crypto.randomUUID(),
        feature: 'indexing',
        action: 'embed',
        provider: profile.kind,
        model: config.model,
        inputTokens: promptTokens,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
        durationMs,
        isStreaming: false,
      }));
    } catch {
      // AppContext not yet initialized — skip emit silently
    }
  }

  return embeddings;
}

/**
 * Embed a single text. Convenience wrapper around `embedTexts`.
 */
export async function embedText(text: string): Promise<number[]> {
  const [result] = await embedTexts([text]);
  return result;
}
