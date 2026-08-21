/**
 * Read the models currently exposed by an LM Studio local server. LM Studio
 * implements the OpenAI-compatible GET /v1/models contract; this is a
 * discovery read only and never changes the server or its loaded models.
 */
export async function fetchLMStudioModels(baseUrl: string): Promise<string[]> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3_000);
		const endpoint = `${baseUrl.trim().replace(/\/+$/, '')}/models`;
		const response = await fetch(endpoint, { signal: controller.signal });
		clearTimeout(timeout);
		if (!response.ok) return [];
		const payload = await response.json() as { data?: Array<{ id?: string; name?: string }> };
		return (payload.data ?? [])
			.map((model) => model.id ?? model.name)
			.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
	} catch {
		return [];
	}
}
