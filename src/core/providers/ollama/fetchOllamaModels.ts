import { getProviderCorsBypassFetch } from '@/core/providers/vercel/provider-factory';

/**
 * Fetch installed models from a running Ollama instance.
 * Returns model names on success, empty array on failure (silent).
 */
export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		const controller = new AbortController();
		timeout = setTimeout(() => controller.abort(), 3000);

		const res = await (getProviderCorsBypassFetch() ?? fetch)(`${baseUrl}/api/tags`, { signal: controller.signal });

		if (!res.ok) return [];

		const data = (await res.json()) as { models?: Array<{ name?: string }> };
		return (data.models ?? [])
			.map((m) => m.name)
			.filter((name): name is string => typeof name === 'string' && name.length > 0);
	} catch {
		return [];
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
