import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { type EmbeddingCallConfig, toEmbeddingConfig } from '@/core/profiles/materialize';

/**
 * Narrow port for reporting one embedding-call's usage to a sink (e.g. the
 * app-shell event bus). T11K B3: replaces the previous direct
 * `AppContext.getInstance().eventBus.dispatch(...)` reach so core has no
 * upward dependency on the app shell.
 */
export interface EmbeddingUsageReporter {
	report(usage: {
		feature: 'indexing';
		action: 'embed';
		provider: string;
		model: string;
		inputTokens: number;
		durationMs: number;
	}): void;
}

let reporter: EmbeddingUsageReporter | null = null;

/**
 * Bind the usage reporter at app boot. App-shell wiring is in `main.ts`.
 *
 * Module-level state is acceptable here as a single-writer **registration
 * sink** (set once at boot, read at runtime) — not a mutable default or a
 * cross-feature singleton. The reporter is optional so embeds still work
 * before binding or in tests.
 */
export function setEmbeddingUsageReporter(r: EmbeddingUsageReporter | null): void {
	reporter = r;
}

/**
 * Embed multiple texts using the active embedding profile.
 * Uses OpenAI-format embeddings API (compatible with OpenAI, Ollama, LM Studio, etc.).
 *
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors (one per input text)
 * @throws If no embedding profile is configured, or the API call fails
 */
export async function embedTexts(texts: string[], route?: EmbeddingCallConfig): Promise<number[][]> {
  const startMs = Date.now();
	const registry = ProfileRegistry.getInstance();
	const profile = registry.getActiveEmbeddingProfile();
	if (!route && !profile) throw new Error('No embedding profile configured');
	const config = route ?? (profile ? toEmbeddingConfig(profile) : null);
	if (!config)
		throw new Error('Embedding endpoint not configured on active profile');

	const response = await requestEmbeddings(texts, config);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Embedding API error ${response.status}: ${body.slice(0, 200)}`,
    );
  }

	const data = await response.json();
	const promptTokens: number = data.usage?.prompt_tokens ?? 0;
	const embeddings = readEmbeddings(data, config.transport);

  if (promptTokens > 0 && reporter) {
    try {
      reporter.report({
        feature: 'indexing',
        action: 'embed',
			provider: config.provider,
        model: config.model,
        inputTokens: promptTokens,
        durationMs: Date.now() - startMs,
      });
    } catch {
      // Reporter sink errors must not surface to the caller.
    }
  }

  return embeddings;
}

async function requestEmbeddings(texts: string[], config: EmbeddingCallConfig): Promise<Response> {
	if (config.transport === 'ollama') {
		return fetch(`${config.endpoint}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: config.model, input: texts }),
		});
	}
	if (config.transport === 'gemini') {
		return fetch(`${config.endpoint}/models/${encodeURIComponent(config.model)}:batchEmbedContents?key=${encodeURIComponent(config.apiKey)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				requests: texts.map((text) => ({
					model: `models/${config.model}`,
					content: { parts: [{ text }] },
				})),
			}),
		});
	}
	return fetch(`${config.endpoint}/embeddings`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
		},
		body: JSON.stringify({ model: config.model, input: texts }),
	});
}

function readEmbeddings(data: any, transport: EmbeddingCallConfig['transport']): number[][] {
	if (transport === 'ollama') return data.embeddings as number[][];
	if (transport === 'gemini') return (data.embeddings as Array<{ values: number[] }>).map((item) => item.values);
	return (data.data as Array<{ embedding: number[] }>).map((item) => item.embedding);
}

/**
 * Embed a single text. Convenience wrapper around `embedTexts`.
 */
export async function embedText(text: string): Promise<number[]> {
  const [result] = await embedTexts([text]);
  return result;
}
