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
 * Precedence:
 *   1. `settings.vaultSearch.sdkProfile` (explicit opt-in, wins if fully specified)
 *   2. `settings.ai.llmProviderConfigs.claude.apiKey` — construct anthropic-direct
 *   3. `settings.ai.llmProviderConfigs.openrouter.apiKey` — construct openrouter
 *
 * This way a user who has already configured Claude OR OpenRouter for chat
 * mode gets V2 vault search working automatically, zero additional setup.
 * Full Profile Registry (v2 spec) will replace this reader with a proper
 * per-feature profile selector.
 *
 * For the OpenRouter fallback we swap the default model slugs to OpenRouter's
 * namespaced format (`anthropic/claude-*`) since the plain `claude-*` names
 * only work against the first-party Anthropic API.
 */
export function readProfileFromSettings(settings: unknown): SdkProfile {
	const s = settings as {
		vaultSearch?: { sdkProfile?: Partial<SdkProfile> };
		ai?: {
			llmProviderConfigs?: Record<
				string,
				{ apiKey?: string; baseUrl?: string }
			>;
		};
	} | undefined;

	const raw = s?.vaultSearch?.sdkProfile ?? {};
	const providerConfigs = s?.ai?.llmProviderConfigs;
	const existingClaude = providerConfigs?.claude;
	const existingOpenRouter = providerConfigs?.openrouter;

	// Start from defaults + any user-specified vaultSearch overrides
	const merged: SdkProfile = {
		...DEFAULT_SDK_PROFILE,
		...raw,
	};

	// If user has explicit credentials in vaultSearch profile, use them as-is
	if (merged.apiKey || merged.authToken) {
		return merged;
	}

	// Fallback 0.5: analysisModel provider preference
	const analysisModel = (s as any)?.ai?.analysisModel as { provider?: string; modelId?: string } | undefined;
	if (analysisModel?.provider && providerConfigs) {
		const providerKey = analysisModel.provider;
		const providerCfg = providerConfigs[providerKey];
		if (providerCfg?.apiKey) {
			if (providerKey === 'openrouter' || providerKey.includes('openrouter')) {
				merged.kind = 'openrouter';
				merged.baseUrl = raw.baseUrl ?? providerCfg.baseUrl ?? 'https://openrouter.ai/api';
				merged.authToken = providerCfg.apiKey;
				merged.apiKey = null;
				if (!raw.primaryModel) merged.primaryModel = 'anthropic/claude-haiku-4-5';
				if (!raw.fastModel) merged.fastModel = 'anthropic/claude-haiku-4-5';
				return merged;
			}
			if (providerKey === 'claude' || providerKey === 'anthropic') {
				merged.kind = raw.kind ?? 'anthropic-direct';
				merged.apiKey = providerCfg.apiKey;
				if (providerCfg.baseUrl && !raw.baseUrl) merged.baseUrl = providerCfg.baseUrl;
				return merged;
			}
		}
	}

	// Fallback 1: existing Claude chat config → anthropic-direct
	if (existingClaude?.apiKey) {
		merged.kind = raw.kind ?? 'anthropic-direct';
		merged.apiKey = existingClaude.apiKey;
		if (existingClaude.baseUrl && !raw.baseUrl) {
			merged.baseUrl = existingClaude.baseUrl;
		}
		return merged;
	}

	// Fallback 2: existing OpenRouter chat config → openrouter profile with
	// Anthropic Skin. Model names must be OpenRouter slugs (anthropic/claude-*).
	if (existingOpenRouter?.apiKey) {
		merged.kind = 'openrouter';
		merged.baseUrl = raw.baseUrl ?? 'https://openrouter.ai/api';
		merged.authToken = existingOpenRouter.apiKey;
		merged.apiKey = null;
		// Only rewrite model slugs if the user hasn't overridden them explicitly.
		if (!raw.primaryModel) {
			merged.primaryModel = 'anthropic/claude-haiku-4-5';
		}
		if (!raw.fastModel) {
			merged.fastModel = 'anthropic/claude-haiku-4-5';
		}
		return merged;
	}

	return merged;
}
