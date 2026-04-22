/**
 * Preset factories for common profile configurations.
 *
 * Each factory returns a complete Profile with sensible defaults for
 * its provider kind. The caller typically overrides apiKey / authToken
 * after creation.
 */

import type { Profile, ProfileKind } from './types';

function generateId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const PRESET_FACTORIES: Record<ProfileKind, (overrides?: Partial<Profile>) => Profile> = {
  'anthropic-direct': (overrides) => ({
    id: generateId(),
    name: 'Anthropic Direct',
    kind: 'anthropic-direct',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://api.anthropic.com',
    apiKey: null,
    authToken: null,
    primaryModel: 'claude-opus-4-6',
    fastModel: 'claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'Direct Anthropic API access',
    ...overrides,
  }),

  openrouter: (overrides) => ({
    id: generateId(),
    name: 'OpenRouter',
    kind: 'openrouter',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'https://openrouter.ai/api',
    apiKey: null,
    authToken: null,
    primaryModel: 'anthropic/claude-opus-4-6',
    fastModel: 'anthropic/claude-haiku-4-5',
    customHeaders: {},
    embeddingEndpoint: null,
    embeddingApiKey: null,
    embeddingModel: null,
    icon: null,
    description: 'OpenRouter multi-provider gateway',
    ...overrides,
  }),

  litellm: (overrides) => ({
    id: generateId(),
    name: 'LiteLLM Proxy',
    kind: 'litellm',
    enabled: true,
    createdAt: Date.now(),
    baseUrl: 'http://localhost:4000',
    apiKey: null,
    authToken: null,
    primaryModel: 'claude-opus-4-6',
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
    authToken: null,
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
};

/**
 * Create a preset Profile for the given kind, optionally applying overrides.
 */
export function createPresetProfile(kind: ProfileKind, overrides?: Partial<Profile>): Profile {
  return PRESET_FACTORIES[kind](overrides);
}
