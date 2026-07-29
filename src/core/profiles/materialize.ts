/**
 * Materialize a Profile into environment variable bundles consumed by
 * Claude Agent SDK or embedding endpoints.
 */

import type { Profile } from './types';
import {
	simulatorAgentSdkBaseUrl,
	SIMULATOR_DEFAULTS,
	simulatorRequestHeaders,
} from '@/core/providers/simulator';

/**
 * Materialize a Profile into the env-var bundle that Claude Agent SDK's
 * `query({ options: { env } })` expects.
 *
 * Throws if credentials are missing (caller must surface this to the user).
 */
export function toAgentSdkEnv(
  profile: Profile,
  agentModelId: string,
  agentFastModelId: string,
): Record<string, string> {
  if (!profile.apiKey && profile.kind !== 'simulator') {
    throw new Error('Profile is missing API key');
  }

  // OpenRouter profiles migrated from legacy settings may have empty baseUrl;
  // fall back to the canonical endpoint to avoid sending credentials to the wrong API.
  const baseUrl = profile.kind === 'simulator'
    ? simulatorAgentSdkBaseUrl(profile.baseUrl)
    : profile.baseUrl
      || (profile.kind === 'openrouter' ? 'https://openrouter.ai/api/v1' : '');
  const apiKey = profile.kind === 'simulator'
    ? SIMULATOR_DEFAULTS.endpoint.apiKey
    : profile.apiKey!;
  const primaryModel = profile.kind === 'simulator'
    ? SIMULATOR_DEFAULTS.endpoint.agentSdkModel
    : agentModelId;
  const fastModel = profile.kind === 'simulator'
    ? SIMULATOR_DEFAULTS.endpoint.agentSdkFastModel
    : agentFastModelId;

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: primaryModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: fastModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: primaryModel,
  };

  if (profile.kind === 'openrouter') {
    // OpenRouter: API key is sent as Bearer token via ANTHROPIC_AUTH_TOKEN.
    // ANTHROPIC_API_KEY must be explicitly empty so the CLI doesn't reject the missing key.
    env.ANTHROPIC_API_KEY = '';
    env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  } else {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  const customHeaders = profile.kind === 'simulator'
    ? { ...profile.customHeaders, ...simulatorRequestHeaders(profile.simulatorConfig) }
    : profile.customHeaders;
  if (Object.keys(customHeaders).length > 0) {
    env.ANTHROPIC_CUSTOM_HEADERS = serializeAgentSdkHeaders(customHeaders);
  }

  return env;
}

function serializeAgentSdkHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => {
      if (
        name.includes('\n')
        || name.includes('\r')
        || value.includes('\n')
        || value.includes('\r')
      ) {
        throw new Error('Agent SDK custom headers cannot contain line breaks');
      }
      return `${name}: ${value}`;
    })
    .join('\n');
}

/**
 * Extract embedding config from a Profile. Returns null if the profile
 * has no embedding endpoint or model configured.
 */
export function toEmbeddingConfig(
  profile: Profile,
): { endpoint: string; apiKey: string; model: string } | null {
  if (!profile.embeddingEndpoint || !profile.embeddingModel) return null;
  return {
    endpoint: profile.embeddingEndpoint,
    apiKey: profile.embeddingApiKey ?? profile.apiKey ?? '',
    model: profile.embeddingModel,
  };
}
