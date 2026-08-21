/**
 * Preset factories for common profile configurations.
 *
 * Each factory returns a complete Profile with sensible defaults for
 * its provider kind. The caller typically overrides apiKey
 * after creation.
 */

import { DEFAULT_SIMULATOR_PROFILE_CONFIG, type Profile, type ProfileKind } from './types';
import { SIMULATOR_DEFAULTS } from '@/core/providers/simulator';

function generateId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const BUILT_IN_SIMULATOR_PROFILE_ID = 'builtin-ai-search-simulator';

const PRESET_FACTORIES: Record<ProfileKind, (overrides?: Partial<Profile>) => Profile> = {
  anthropic: (overrides) => ({
    id: generateId(),
    name: 'Anthropic',
    kind: 'anthropic',
    enabled: true,
    createdAt: Date.now(),
    // MUST include `/v1` — the AI SDK's Anthropic provider appends `/messages`
    // to this baseUrl verbatim, so bare `https://api.anthropic.com` yields
    // `POST /messages` → 404. `provider-factory.ts` normalises the legacy
    // (no-/v1) value defensively for profiles saved before this fix.
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: null,
    primaryModel: 'claude-sonnet-4-6',
    fastModel: 'claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Direct Anthropic API access',
    ...overrides,
  }),

  openai: (overrides) => ({
    id: generateId(),
    name: 'OpenAI',
    kind: 'openai',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://api.openai.com/v1',
    apiKey: null,
    primaryModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    customHeaders: {},
    embeddingEndpoint: 'https://api.openai.com/v1',
    embeddingApiKey: null,
    embeddingModel: 'text-embedding-3-small',
    icon: null,
    description: 'OpenAI API access',
    ...overrides,
  }),

  google: (overrides) => ({
    id: generateId(),
    name: 'Google AI',
    kind: 'google',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: null,
    primaryModel: 'gemini-2.5-pro',
    fastModel: 'gemini-2.5-flash',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Google AI (Gemini) API access',
    ...overrides,
  }),

  perplexity: (overrides) => ({
    id: generateId(),
    name: 'Perplexity',
    kind: 'perplexity',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://api.perplexity.ai',
    apiKey: null,
    primaryModel: 'sonar-pro',
    fastModel: 'sonar',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Perplexity AI search-augmented models',
    ...overrides,
  }),

  ollama: (overrides) => ({
    id: generateId(),
    name: 'Ollama',
    kind: 'ollama',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'http://localhost:11434',
    apiKey: null,
    primaryModel: 'llama3.1',
    fastModel: 'llama3.1',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Local Ollama instance',
    ...overrides,
  }),

  lmstudio: (overrides) => ({
    id: generateId(),
    name: 'LM Studio',
    kind: 'lmstudio',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: null,
    primaryModel: '',
    fastModel: '',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Local LM Studio server',
    ...overrides,
  }),

  openrouter: (overrides) => ({
    id: generateId(),
    name: 'OpenRouter',
    kind: 'openrouter',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: null,
    primaryModel: 'anthropic/claude-sonnet-4-6',
    fastModel: 'anthropic/claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'OpenRouter multi-provider gateway',
    ...overrides,
  }),

  codex: (overrides) => ({
		id: generateId(), name: 'Codex', kind: 'codex', enabled: true, createdAt: Date.now(),
		baseUrl: 'http://127.0.0.1:8787/v1', apiKey: null,
		primaryModel: 'gpt-5', fastModel: 'gpt-5-mini', customHeaders: {},
		embeddingEndpoint: null, embeddingApiKey: null, embeddingModel: null,
		icon: null, description: 'Codex through the Peak execution gateway', ...overrides,
	}),

  'claude-code': (overrides) => ({
		id: generateId(), name: 'Claude Code', kind: 'claude-code', enabled: true, createdAt: Date.now(),
		baseUrl: 'http://127.0.0.1:8787/v1', apiKey: null,
		primaryModel: 'claude-sonnet-4-6', fastModel: 'claude-haiku-4-5', customHeaders: {},
		embeddingEndpoint: null, embeddingApiKey: null, embeddingModel: null,
		icon: null, description: 'Claude Code through the Peak execution gateway', ...overrides,
	}),

  litellm: (overrides) => ({
    id: generateId(),
    name: 'LiteLLM Proxy',
    kind: 'litellm',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'http://localhost:4000',
    apiKey: null,
    primaryModel: 'claude-sonnet-4-6',
    fastModel: 'claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Self-hosted LiteLLM proxy',
    ...overrides,
  }),

  custom: (overrides) => ({
    id: generateId(),
    name: 'Custom Provider',
    kind: 'custom',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: '',
    apiKey: null,
    primaryModel: '',
    fastModel: '',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: null,
    ...overrides,
  }),

  simulator: (overrides) => ({
    id: generateId(),
    name: SIMULATOR_DEFAULTS.ui.providerName,
    kind: 'simulator',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: SIMULATOR_DEFAULTS.endpoint.defaultBaseUrl,
    apiKey: null,
    primaryModel: 'ai-search-simulator',
    fastModel: 'ai-search-simulator',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: SIMULATOR_DEFAULTS.ui.presetDescription,
    simulatorConfig: { ...DEFAULT_SIMULATOR_PROFILE_CONFIG },
    ...overrides,
  }),
};

/**
 * Create a preset Profile for the given kind, optionally applying overrides.
 */
export function createPresetProfile(kind: ProfileKind, overrides?: Partial<Profile>): Profile {
  return PRESET_FACTORIES[kind](overrides);
}

export function createBuiltInSimulatorProfile(): Profile {
  return createPresetProfile('simulator', {
    id: BUILT_IN_SIMULATOR_PROFILE_ID,
    createdAt: 0,
  });
}
