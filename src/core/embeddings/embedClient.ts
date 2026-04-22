import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { toEmbeddingConfig } from '@/core/profiles/materialize';

/**
 * Embed multiple texts using the active embedding profile.
 * Uses OpenAI-format embeddings API (compatible with OpenAI, Ollama, LM Studio, etc.).
 *
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors (one per input text)
 * @throws If no embedding profile is configured, or the API call fails
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
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
  return (data.data as Array<{ embedding: number[] }>).map(
    (item) => item.embedding,
  );
}

/**
 * Embed a single text. Convenience wrapper around `embedTexts`.
 */
export async function embedText(text: string): Promise<number[]> {
  const [result] = await embedTexts([text]);
  return result;
}
