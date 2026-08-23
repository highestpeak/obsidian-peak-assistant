import type { HttpClientPort } from '@/core/ports/HttpClientPort';
import { ModelType, type ModelCapabilities, type ModelMetaData } from '@/core/providers/types';

type OpenRouterModel = {
	id?: string;
	name?: string;
	created?: number;
	context_length?: number;
	architecture?: {
		input_modalities?: string[];
		output_modalities?: string[];
	};
	supported_parameters?: string[];
	pricing?: { prompt?: string; completion?: string };
	top_provider?: { max_completion_tokens?: number };
};

/** Fetch the exact catalog available to one OpenRouter key. No generation occurs. */
export async function fetchOpenRouterModels(
	http: HttpClientPort,
	profile: Pick<import('@/core/profiles/types').Profile, 'baseUrl' | 'apiKey'>,
): Promise<ModelMetaData[]> {
	const apiKey = profile.apiKey?.trim();
	if (!apiKey) throw new Error('OpenRouter API key is missing.');
	const endpoint = `${profile.baseUrl.trim().replace(/\/+$/, '')}/models/user?output_modalities=all`;
	const response = await http.request({
		url: endpoint,
		method: 'GET',
		headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
	});
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`OpenRouter model catalog returned HTTP ${response.status}.`);
	}
	let body: { data?: OpenRouterModel[] };
	try {
		body = JSON.parse(response.text) as { data?: OpenRouterModel[] };
	} catch {
		throw new Error('OpenRouter model catalog returned invalid JSON.');
	}
	if (!Array.isArray(body.data)) throw new Error('OpenRouter model catalog response has no data array.');
	return body.data.flatMap(toModelMetadata);
}

function toModelMetadata(model: OpenRouterModel): ModelMetaData[] {
	if (typeof model.id !== 'string' || !model.id.trim()) return [];
	const inputs = new Set(model.architecture?.input_modalities ?? []);
	const outputs = new Set(model.architecture?.output_modalities ?? []);
	const parameters = new Set(model.supported_parameters ?? []);
	const capabilities: ModelCapabilities = {
		vision: inputs.has('image'),
		pdfInput: inputs.has('file'),
		audioInput: inputs.has('audio'),
		videoInput: inputs.has('video'),
		tools: parameters.has('tools'),
		webSearch: parameters.has('web_search'),
		reasoning: parameters.has('reasoning') || parameters.has('include_reasoning'),
		imageGeneration: outputs.has('image'),
	};
	return [{
		id: model.id,
		displayName: model.name?.trim() || model.id,
		modelType: resolveModelType(outputs),
		releaseTimestamp: typeof model.created === 'number' ? model.created * 1000 : undefined,
		costInput: toPerMillionPrice(model.pricing?.prompt),
		costOutput: toPerMillionPrice(model.pricing?.completion),
		capabilities,
		tokenLimits: {
			maxTokens: model.context_length,
			maxInputTokens: model.context_length,
			maxOutputTokens: model.top_provider?.max_completion_tokens,
		},
	}];
}

function toPerMillionPrice(perToken: string | undefined): string | undefined {
	if (perToken === undefined) return undefined;
	const price = Number(perToken);
	return Number.isFinite(price) ? String(price * 1_000_000) : undefined;
}

function resolveModelType(outputs: Set<string>): ModelType {
	if (outputs.has('embeddings')) return ModelType.EMBEDDING;
	if (outputs.has('image') && !outputs.has('text')) return ModelType.IMAGE;
	if (outputs.has('audio') && !outputs.has('text')) return ModelType.SOUND;
	return ModelType.LLM;
}
