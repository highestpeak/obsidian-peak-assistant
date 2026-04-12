/**
 * Minimal SDK Profile for the 1-day vault search migration.
 *
 * NOTE: this is not the full Profile Registry described in the v2 spec. It is
 * a deliberately small slice that reads plugin settings and materializes them
 * into the env-var bundle that Claude Agent SDK's query() accepts.
 *
 * The full Profile Registry (with UI, multiple profiles, per-feature selection)
 * will be built in a later phase per 2026-04-11-provider-system-v2-design.md.
 */

export type SdkProfileKind = 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';

export interface SdkProfile {
	kind: SdkProfileKind;
	baseUrl: string;
	apiKey: string | null;
	authToken: string | null;
	primaryModel: string;
	fastModel: string;
	customHeaders?: Record<string, string>;
}

export const DEFAULT_SDK_PROFILE: SdkProfile = {
	kind: 'anthropic-direct',
	baseUrl: 'https://api.anthropic.com',
	apiKey: null, // must be filled from settings at runtime
	authToken: null,
	primaryModel: 'claude-opus-4-6',
	fastModel: 'claude-haiku-4-5',
};

/**
 * Pure function. Materializes a Profile into the env-var bundle that
 * Claude Agent SDK's query({ options: { env } }) expects.
 *
 * Throws if credentials are missing (the caller must surface this to the user).
 */
export function toAgentSdkEnv(profile: SdkProfile): Record<string, string> {
	const hasAuth = Boolean(profile.apiKey || profile.authToken);
	if (!hasAuth) {
		throw new Error(
			'SdkProfile is missing credentials: at least one of apiKey or authToken must be set'
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

	if (profile.customHeaders && Object.keys(profile.customHeaders).length > 0) {
		env.ANTHROPIC_CUSTOM_HEADERS = JSON.stringify(profile.customHeaders);
	}

	return env;
}

/**
 * Read the active profile from plugin settings.
 *
 * Precedence (first non-empty wins for credentials):
 *   1. `settings.vaultSearch.sdkProfile.apiKey / .authToken` (explicit opt-in)
 *   2. `settings.ai.llmProviderConfigs.claude.apiKey` (existing chat-mode config)
 *
 * Non-credential fields (baseUrl, primaryModel, fastModel) also fall through
 * from vaultSearch.sdkProfile → DEFAULT_SDK_PROFILE.
 *
 * This means a user who has already configured Claude for chat mode gets
 * V2 vault search working automatically, with zero additional setup.
 *
 * Full Profile Registry (v2 spec) will replace this reader with a proper
 * per-feature profile selector.
 */
export function readProfileFromSettings(settings: unknown): SdkProfile {
	const s = settings as {
		vaultSearch?: { sdkProfile?: Partial<SdkProfile> };
		ai?: { llmProviderConfigs?: Record<string, { apiKey?: string; baseUrl?: string }> };
	} | undefined;

	const raw = s?.vaultSearch?.sdkProfile ?? {};
	const existingClaudeConfig = s?.ai?.llmProviderConfigs?.claude;

	const merged: SdkProfile = {
		...DEFAULT_SDK_PROFILE,
		...raw,
	};

	// Credential fallback: if vaultSearch profile has no apiKey/authToken AND
	// the user already has Claude configured for chat, reuse that key.
	if (
		!merged.apiKey &&
		!merged.authToken &&
		merged.kind === 'anthropic-direct' &&
		existingClaudeConfig?.apiKey
	) {
		merged.apiKey = existingClaudeConfig.apiKey;
		// Also adopt a non-default baseUrl if the existing config specifies one
		// (some users point Claude at an enterprise proxy).
		if (existingClaudeConfig.baseUrl && !raw.baseUrl) {
			merged.baseUrl = existingClaudeConfig.baseUrl;
		}
	}

	return merged;
}
