import assert from 'node:assert/strict';
import { buildUnifiedModelChoices } from '@/core/providers/model-selection';
import type { ModelMetaData } from '@/core/providers/types';
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
	ollama: [
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

console.log('unified-model-selection: all assertions passed');
