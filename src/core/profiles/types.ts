/**
 * Profile v2 data model.
 *
 * A Profile is the single configuration surface that replaces per-provider
 * config scattered across settings. Each profile bundles auth, model selection,
 * and optional embedding config into one portable unit.
 */

export type ProfileKind = 'anthropic' | 'openai' | 'google' | 'perplexity' | 'ollama' | 'openrouter' | 'litellm' | 'custom' | 'simulator';

export type SimulatorScenarioId =
  | 'happy-path'
  | 'slow-streaming'
  | 'planning-failure'
  | 'empty-vault'
  | 'vault-tool-recovery'
  | 'report-partial-failure'
  | 'report-total-failure'
  | 'escalation-request';

export type SimulatorSpeed = 'instant' | 'normal' | 'slow';

export interface SimulatorProfileConfig {
  scenario: SimulatorScenarioId;
  speed: SimulatorSpeed;
  strict: boolean;
}

export const DEFAULT_SIMULATOR_PROFILE_CONFIG: SimulatorProfileConfig = {
  scenario: 'happy-path',
  speed: 'normal',
  strict: true,
};

export interface Profile {
  id: string;
  name: string;
  kind: ProfileKind;
  enabled: boolean;
  createdAt: number;
  baseUrl: string;
  apiKey: string | null;
  primaryModel: string;
  fastModel: string;
  customHeaders: Record<string, string>;
  embeddingEndpoint: string | null;
  embeddingApiKey: string | null;
  embeddingModel: string | null;
  icon: string | null;
  description: string | null;
  /** Present only for the standalone localhost Simulator provider. */
  simulatorConfig?: SimulatorProfileConfig;
}

export interface RoleConfig {
  profileId: string;
  modelId: string;
}

/**
 * User-defined OpenAI-compatible endpoint (LM Studio, LiteLLM, vLLM, etc.).
 * Each endpoint can auto-discover models via GET /v1/models.
 */
export interface OpenAICompatibleEndpoint {
  id: string;
  name: string;
  icon?: string;
  baseUrl: string;
  apiKey?: string;
  preset?: 'lmstudio' | 'litellm' | 'vllm' | 'custom';
  enabled: boolean;
  /** Per-model capability/display overrides */
  modelConfigs?: Record<string, {
    displayName?: string;
    icon?: string;
    tokenLimitsOverride?: import('@/core/providers/types').ModelTokenLimits;
    capabilitiesOverride?: Partial<import('@/core/providers/types').ModelCapabilities>;
  }>;
}

export interface ProfileSettings {
  profiles: Profile[];
  activeAgentConfig: RoleConfig | null;
  activeAgentFastConfig: RoleConfig | null;
  activeChatConfig: RoleConfig | null;
  activeCopilotConfig: RoleConfig | null;
  activeEmbeddingConfig: RoleConfig | null;
  activeWebSearchConfig: RoleConfig | null;
  /** User-defined OpenAI-compatible endpoints (LM Studio, LiteLLM, vLLM, custom). */
  customEndpoints?: OpenAICompatibleEndpoint[];
}
