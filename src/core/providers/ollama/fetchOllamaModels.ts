/**
 * Fetch installed models from a running Ollama instance.
 * Returns model names on success, empty array on failure (silent).
 */
export async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);

		const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
		clearTimeout(timeout);

		if (!res.ok) return [];

		const data = (await res.json()) as { models?: Array<{ name?: string }> };
		return (data.models ?? [])
			.map((m) => m.name)
			.filter((name): name is string => typeof name === 'string' && name.length > 0);
	} catch {
		return [];
	}
}
