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
 * Read the active profile from plugin settings. Falls back to DEFAULT_SDK_PROFILE
 * merged with any user-provided fields.
 *
 * The settings path is hardcoded at `vaultSearch.sdkProfile` for now. Full
 * Profile Registry will replace this.
 */
export function readProfileFromSettings(settings: unknown): SdkProfile {
	const s = settings as { vaultSearch?: { sdkProfile?: Partial<SdkProfile> } } | undefined;
	const raw = s?.vaultSearch?.sdkProfile ?? {};
	return {
		...DEFAULT_SDK_PROFILE,
		...raw,
	};
}
