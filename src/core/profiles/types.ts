/**
 * Profile v2 data model.
 *
 * A Profile is the single configuration surface that replaces per-provider
 * config scattered across settings. Each profile bundles auth, model selection,
 * and optional embedding config into one portable unit.
 */

export type ProfileKind = 'anthropic-direct' | 'openrouter' | 'litellm' | 'custom';

export interface Profile {
  id: string;
  name: string;
  kind: ProfileKind;
  enabled: boolean;
  createdAt: number;
  baseUrl: string;
  apiKey: string | null;
  authToken: string | null;
  primaryModel: string;
  fastModel: string;
  customHeaders: Record<string, string>;
  embeddingEndpoint: string | null;
  embeddingApiKey: string | null;
  embeddingModel: string | null;
  icon: string | null;
  description: string | null;
}

export interface ProfileSettings {
  profiles: Profile[];
  activeAgentProfileId: string | null;
  activeEmbeddingProfileId: string | null;
  sdkSettings: SdkSettings;
}

export interface SdkSettings {
  cliPathOverride: string | null;
  subprocessPoolSize: number;
  warmupOnLoad: boolean;
}

export const DEFAULT_SDK_SETTINGS: SdkSettings = {
  cliPathOverride: null,
  subprocessPoolSize: 1,
  warmupOnLoad: true,
};
