/**
 * Materialize a Profile into environment variable bundles consumed by
 * Claude Agent SDK or embedding endpoints.
 *
 * Extracted from the ad-hoc `toAgentSdkEnv` in vault-sdk/sdkProfile.ts
 * and generalized for all profile kinds.
 */

import type { Profile } from './types';

/**
 * Materialize a Profile into the env-var bundle that Claude Agent SDK's
 * `query({ options: { env } })` expects.
 *
 * Throws if credentials are missing (caller must surface this to the user).
 */
export function toAgentSdkEnv(profile: Profile): Record<string, string> {
  const hasAuth = Boolean(profile.apiKey || profile.authToken);
  if (!hasAuth) {
    throw new Error(
      'Profile is missing credentials: at least one of apiKey or authToken must be set',
    );
  }

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: profile.primaryModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.fastModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: profile.primaryModel,
  };

  if (profile.kind === 'openrouter') {
    // OpenRouter requires ANTHROPIC_API_KEY explicitly empty; auth via Bearer token.
    env.ANTHROPIC_API_KEY = '';
    env.ANTHROPIC_AUTH_TOKEN = profile.authToken ?? '';
  } else {
    if (profile.apiKey) env.ANTHROPIC_API_KEY = profile.apiKey;
    if (profile.authToken) env.ANTHROPIC_AUTH_TOKEN = profile.authToken;
  }

  if (Object.keys(profile.customHeaders).length > 0) {
    env.ANTHROPIC_CUSTOM_HEADERS = JSON.stringify(profile.customHeaders);
  }

  return env;
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
