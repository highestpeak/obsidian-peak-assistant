import assert from 'node:assert/strict';
import {
	buildUnifiedModelChoices,
	resolveEmbeddingDefault,
	resolveOperationRouteCandidate,
} from '@/core/providers/model-selection';
import { ModelType, type ModelMetaData } from '@/core/providers/types';
import type { Profile } from '@/core/profiles/types';

const profiles: Profile[] = [
	{
		id: 'openai-1', name: 'OpenAI', kind: 'openai', enabled: true, createdAt: 1,
		baseUrl: 'https://api.openai.com/v1', apiKey: 'secret', primaryModel: 'chat-a',
		fastModel: 'chat-a', customHeaders: {}, embeddingEndpoint: null,
		embeddingApiKey: null, embeddingModel: null, icon: null, description: null,
	},
	{
		id: 'ollama-1', name: 'Ollama', kind: 'ollama', enabled: true, createdAt: 2,
		baseUrl: 'http://localhost:11434', apiKey: null, primaryModel: 'local-no-tools',
		fastModel: 'local-no-tools', customHeaders: {}, embeddingEndpoint: null,
		embeddingApiKey: null, embeddingModel: null, icon: null, description: null,
	},
];

const models: Record<string, ModelMetaData[]> = {
	openai: [
		{ id: 'chat-a', displayName: 'Chat A', capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false } },
		{ id: 'chat-b', displayName: 'Chat B', capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false } },
	],
	'ollama:ollama-1': [
		{ id: 'local-no-tools', displayName: 'Local no tools', capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false } },
	],
};

const registry = {
	getModelsForProvider(providerId: string) {
		return models[providerId] ?? [];
	},
};

const all = buildUnifiedModelChoices(registry, profiles, {});
assert.equal(all.length, 3, 'all models from every configured provider are listed');

const tools = buildUnifiedModelChoices(registry, profiles, { tools: true });
assert.equal(tools.length, 3, 'incompatible models stay visible');
assert.equal(tools.filter((choice) => choice.selectable).length, 2);
assert.match(
	tools.find((choice) => choice.modelId === 'local-no-tools')?.unavailableReason ?? '',
	/tool/i,
	'incompatible Agent models explain why they cannot be selected',
);

const embeddingCandidates = [
	...buildUnifiedModelChoices(registry, profiles, { modelType: ModelType.EMBEDDING }),
	{
		profileId: 'ollama-1',
		profileName: 'Ollama',
		profileKind: 'ollama' as const,
		providerCatalogId: 'ollama',
		modelId: 'nomic-embed-text:latest',
		displayName: 'nomic-embed-text:latest',
		capabilities: undefined,
		modelType: ModelType.EMBEDDING,
		selectable: true,
		unavailableReason: null,
	},
];
const recoveredEmbedding = resolveEmbeddingDefault(
	{ profileId: 'ollama-1', modelId: 'local-no-tools' },
	embeddingCandidates,
);
assert.equal(
	recoveredEmbedding,
	null,
	'an invalid historical binding must not replace the configured model',
);

const ambiguousEmbedding = resolveEmbeddingDefault(null, [
	...embeddingCandidates,
	{ ...embeddingCandidates.at(-1)!, modelId: 'embeddinggemma', displayName: 'embeddinggemma' },
]);
assert.equal(ambiguousEmbedding, null, 'multiple embedding candidates require an explicit binding or future priority policy');

const routeCandidates = [
	{ profileId: 'ollama-1', model: 'llama3.1', selectable: true },
	{ profileId: 'ollama-1', model: 'nomic-embed-text:latest', selectable: true },
];
assert.equal(
	resolveOperationRouteCandidate(
		ModelType.LLM,
		{ profileId: 'ollama-1', modelId: 'llama3.1' },
		routeCandidates,
	),
	routeCandidates[0],
	'a configured text binding resolves through the rendered candidate model field',
);
assert.deepEqual(
	resolveOperationRouteCandidate(
		ModelType.EMBEDDING,
		{ profileId: 'ollama-1', modelId: 'missing-old-chat-model' },
		[{ profileId: 'ollama-1', model: 'nomic-embed-text:latest', selectable: true }],
	),
	null,
	'a sole embedding candidate is not permission to replace an invalid binding',
);
assert.equal(
	resolveOperationRouteCandidate(
		ModelType.EMBEDDING,
		{ profileId: 'ollama-1', modelId: 'retired-embedding-model' },
		[
			{ profileId: 'ollama-1', model: 'nomic-embed-text:latest', selectable: true },
			{ profileId: 'lmstudio-1', model: 'text-embedding-nomic-embed-text-v1.5', selectable: true },
		],
	),
	null,
	'a provider match is not permission to replace a stale configured model',
);

console.log('unified-model-selection: all assertions passed');
