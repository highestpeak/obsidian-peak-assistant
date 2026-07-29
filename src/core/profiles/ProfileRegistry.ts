/**
 * Singleton registry that owns the lifecycle of all Profile instances.
 *
 * The registry is loaded once during plugin init (via `load()`), and
 * mutations (add/update/delete/setActive) automatically persist through
 * the provided callback.
 */

import type { Profile, ProfileSettings, RoleConfig, SdkSettings, OpenAICompatibleEndpoint } from './types';
import { DEFAULT_SDK_SETTINGS } from './types';
import type { ModelSlot } from '@/core/types/model-tier';
import { DEFAULT_SIMULATOR_PROFILE_CONFIG } from './types';

export type PersistFn = (settings: ProfileSettings) => void | Promise<void>;

export class ProfileRegistry {
  private static instance: ProfileRegistry | null = null;

  private profiles: Profile[] = [];
  private activeAgentConfig: RoleConfig | null = null;
  private activeAgentFastConfig: RoleConfig | null = null;
  private activeChatConfig: RoleConfig | null = null;
  private activeCopilotConfig: RoleConfig | null = null;
  private activeEmbeddingConfig: RoleConfig | null = null;
  private activeWebSearchConfig: RoleConfig | null = null;
  // Harness tier bindings (Settings → AI Setup: Fast Lookup / Research /
  // Use stronger model). Mirrored here by the app layer (see
  // `setTierConfigs`) so BOTH the harness (`bindings.ts`) and the SDK path
  // (`sdkAgentPool.queryWithProfile`) resolve models from ONE source via
  // `resolveSlot`, instead of the SDK path silently using only the legacy
  // agent/agent-fast roles. This is what makes "Research" the single source
  // of truth for all deep work.
  private tierFastConfig: RoleConfig | null = null;
  private tierResearchConfig: RoleConfig | null = null;
  private tierStrongerConfig: RoleConfig | null = null;
  private sdkSettings: SdkSettings = { ...DEFAULT_SDK_SETTINGS };
  private customEndpoints: OpenAICompatibleEndpoint[] = [];
  private persistFn: PersistFn | null = null;

  private constructor() {}

  static getInstance(): ProfileRegistry {
    if (!ProfileRegistry.instance) {
      ProfileRegistry.instance = new ProfileRegistry();
    }
    return ProfileRegistry.instance;
  }

  /** Reset singleton (for testing only). */
  static resetInstance(): void {
    ProfileRegistry.instance = null;
  }

  /**
   * Initialize the registry from persisted settings.
   * Must be called once during plugin bootstrap.
   *
   * Accepts both the new format (activeAgentConfig) and the legacy format
   * (activeAgentProfileId) for backward compatibility with existing settings files.
   */
  load(
    settings: ProfileSettings & {
      activeAgentProfileId?: string | null;
      activeEmbeddingProfileId?: string | null;
      activeWebSearchProfileId?: string | null;
    },
    persistFn: PersistFn,
  ): void {
    this.profiles = settings.profiles.map(p => this.migrateProfileModelIds(p));
    // Agent SDK only accepts Claude 4.x — migrate both renames AND 3.x → 4.x for agent roles.
    this.activeAgentConfig = this.migrateAgentRoleConfig(settings.activeAgentConfig ?? this.migrateOldId(settings.activeAgentProfileId));
    this.activeAgentFastConfig = this.migrateAgentRoleConfig((settings as any).activeAgentFastConfig) ?? this.deriveDefaultAgentFastConfig();
    // Chat / Copilot / Embedding / Web Search go through Vercel SDK which still accepts 3.x —
    // only apply pure renames, not the 3.x → 4.x bump.
    this.activeChatConfig = this.migrateRoleConfig((settings as any).activeChatConfig);
    this.activeCopilotConfig = this.migrateRoleConfig((settings as any).activeCopilotConfig);
    this.activeEmbeddingConfig = this.migrateRoleConfig(settings.activeEmbeddingConfig ?? this.migrateOldId(settings.activeEmbeddingProfileId));
    this.activeWebSearchConfig = this.migrateRoleConfig(settings.activeWebSearchConfig ?? this.migrateOldId(settings.activeWebSearchProfileId));
    this.sdkSettings = { ...DEFAULT_SDK_SETTINGS, ...settings.sdkSettings };
    this.customEndpoints = [...(settings.customEndpoints ?? [])];
    this.persistFn = persistFn;
  }

  /**
   * Renamed catalog entries — keep persisted user data working when we change ids.
   * Maps legacy modelIds → canonical equivalents. Applied on load and migrated to disk
   * on next persist.
   */
  // Pure renames — safe everywhere (Chat / Copilot / Agent / Vercel SDK all match).
  private static readonly MODEL_ID_REWRITES: Record<string, string> = {
    'claude-4-opus': 'claude-opus-4',
    'claude-4-sonnet': 'claude-sonnet-4',
    'claude-opus-4-6': 'claude-opus-4-7',
    'anthropic/claude-4-opus': 'anthropic/claude-opus-4',
    'anthropic/claude-4-sonnet': 'anthropic/claude-sonnet-4',
    'anthropic/claude-opus-4-6': 'anthropic/claude-opus-4-7',
  };

  // Claude Agent SDK rejects 3.x — bump persisted Agent / Agent Fast picks to 4.x equivalents.
  // Only applied to agent-role configs; Chat / Copilot can still use 3.x via Vercel SDK.
  private static readonly AGENT_3X_REWRITES: Record<string, string> = {
    'claude-3-5-haiku': 'claude-haiku-4-5',
    'claude-3-haiku': 'claude-haiku-4-5',
    'claude-3-5-sonnet': 'claude-sonnet-4-6',
    'claude-3-7-sonnet': 'claude-sonnet-4-6',
    'claude-3-sonnet': 'claude-sonnet-4-6',
    'claude-3-opus': 'claude-opus-4-7',
    'anthropic/claude-3-5-haiku': 'anthropic/claude-haiku-4-5',
    'anthropic/claude-3-haiku': 'anthropic/claude-haiku-4-5',
    'anthropic/claude-3-5-sonnet': 'anthropic/claude-sonnet-4-6',
    'anthropic/claude-3-7-sonnet': 'anthropic/claude-sonnet-4-6',
    'anthropic/claude-3-sonnet': 'anthropic/claude-sonnet-4-6',
    'anthropic/claude-3-opus': 'anthropic/claude-opus-4-7',
  };

  private static rewriteModelId(id: string | null | undefined): string {
    if (!id) return id ?? '';
    return ProfileRegistry.MODEL_ID_REWRITES[id] ?? id;
  }

  private static rewriteAgentModelId(id: string | null | undefined): string {
    if (!id) return id ?? '';
    const renamed = ProfileRegistry.MODEL_ID_REWRITES[id] ?? id;
    return ProfileRegistry.AGENT_3X_REWRITES[renamed] ?? renamed;
  }

  private migrateRoleConfig(cfg: RoleConfig | null | undefined): RoleConfig | null {
    if (!cfg) return null;
    return { profileId: cfg.profileId, modelId: ProfileRegistry.rewriteModelId(cfg.modelId) };
  }

  private migrateAgentRoleConfig(cfg: RoleConfig | null | undefined): RoleConfig | null {
    if (!cfg) return null;
    return { profileId: cfg.profileId, modelId: ProfileRegistry.rewriteAgentModelId(cfg.modelId) };
  }

  private migrateProfileModelIds(p: Profile): Profile {
    if (p.kind === 'simulator') {
      return {
        ...p,
        baseUrl: '',
        apiKey: null,
        primaryModel: 'ai-search-simulator',
        fastModel: 'ai-search-simulator',
        embeddingEndpoint: null,
        embeddingApiKey: null,
        embeddingModel: null,
        simulatorConfig: {
          ...DEFAULT_SIMULATOR_PROFILE_CONFIG,
          ...p.simulatorConfig,
        },
      };
    }
    // Profile-level primary/fast feed Agent SDK env vars, so also apply the 3.x bump.
    const primary = ProfileRegistry.rewriteAgentModelId(p.primaryModel);
    const fast = ProfileRegistry.rewriteAgentModelId(p.fastModel);
    if (primary === p.primaryModel && fast === p.fastModel) return p;
    return { ...p, primaryModel: primary, fastModel: fast };
  }

  private migrateOldId(id: string | null | undefined): RoleConfig | null {
    if (!id) return null;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return null;
    return { profileId: id, modelId: profile.primaryModel };
  }

  /**
   * When Agent Fast is unset, derive a sensible default from the Agent profile's
   * fast tier (typically Haiku). Keeps users out of the trap of paying Sonnet
   * prices for the Fast role.
   */
  private deriveDefaultAgentFastConfig(): RoleConfig | null {
    if (!this.activeAgentConfig) return null;
    const profile = this.profiles.find(p => p.id === this.activeAgentConfig!.profileId);
    if (!profile) return null;
    return { profileId: profile.id, modelId: profile.fastModel };
  }

  // --------------- Selectors ---------------

  getAllProfiles(): Profile[] {
    return [...this.profiles];
  }

  getActiveAgentProfile(): Profile | null {
    if (!this.activeAgentConfig) {
      return this.profiles.length > 0 ? this.profiles[0] : null;
    }
    return this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId) ?? null;
  }

  getActiveAgentConfig(): { profile: Profile; modelId: string } | null {
    if (!this.activeAgentConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeAgentConfig.modelId };
  }

  getActiveAgentFastConfig(): { profile: Profile; modelId: string } | null {
    if (!this.activeAgentFastConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeAgentFastConfig!.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeAgentFastConfig.modelId };
  }

  /** Resolve a stored RoleConfig to a live {profile, modelId}, or null. */
  private configToBinding(cfg: RoleConfig | null): { profile: Profile; modelId: string } | null {
    if (!cfg) return null;
    const profile = this.profiles.find((p) => p.id === cfg.profileId);
    return profile ? { profile, modelId: cfg.modelId } : null;
  }

  /**
   * Mirror the harness tier bindings (Settings → AI Setup: Fast Lookup /
   * Research / Use stronger model) into the registry. Called by the app layer
   * at bootstrap and after every settings save so `resolveSlot` stays current.
   * Kept as a plain setter (no persistence) because these values are OWNED by
   * `settings.harnessSettings`; the registry only holds a read cache of them.
   */
  setTierConfigs(configs: { fast: RoleConfig | null; research: RoleConfig | null; stronger: RoleConfig | null }): void {
    this.tierFastConfig = configs.fast;
    this.tierResearchConfig = configs.research;
    this.tierStrongerConfig = configs.stronger;
  }

  /**
   * THE single model-binding resolver. Every consumer (harness `bindings.ts`
   * and the SDK `queryWithProfile` path) resolves through here, so a change to
   * any AI Setup row takes effect everywhere that slot is used.
   *
   * Fallback chains preserve the pre-unification behaviour:
   *   fast          → Fast Lookup  ?? agent-fast role
   *   research      → Research     ?? agent role
   *   stronger      → Stronger     ?? Conversation (chat, which itself → agent)
   *   conversation  → Conversation (chat, which itself → agent)
   *   knowledgeIndex→ Knowledge Index (embedding)
   */
  resolveSlot(slot: ModelSlot): { profile: Profile; modelId: string } | null {
    switch (slot) {
      case 'fast':
        return this.configToBinding(this.tierFastConfig) ?? this.getActiveAgentFastConfig();
      case 'research':
        return this.configToBinding(this.tierResearchConfig) ?? this.getActiveAgentConfig();
      case 'stronger':
        return this.configToBinding(this.tierStrongerConfig) ?? this.getActiveChatConfig();
      case 'conversation':
        return this.getActiveChatConfig();
      case 'knowledgeIndex':
        return this.getActiveEmbeddingConfig();
    }
  }

  getActiveChatProfile(): Profile | null {
    if (this.activeChatConfig) {
      return this.profiles.find((p) => p.id === this.activeChatConfig!.profileId) ?? null;
    }
    // Fallback: use agent profile
    return this.getActiveAgentProfile();
  }

  getActiveChatConfig(): { profile: Profile; modelId: string } | null {
    if (this.activeChatConfig) {
      const profile = this.profiles.find((p) => p.id === this.activeChatConfig!.profileId);
      if (profile) return { profile, modelId: this.activeChatConfig.modelId };
    }
    // Fallback: use agent config
    return this.getActiveAgentConfig();
  }

  /**
   * Returns the appropriate config for a given conversation mode.
   * 'agent' uses the Agent config; all others use the Chat config.
   */
  getConfigForMode(mode: string): { profile: Profile; modelId: string } | null {
    if (mode === 'agent') return this.getActiveAgentConfig();
    return this.getActiveChatConfig();
  }

  getActiveCopilotConfig(): { profile: Profile; modelId: string } | null {
    if (!this.activeCopilotConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeCopilotConfig!.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeCopilotConfig.modelId };
  }

  getActiveEmbeddingProfile(): Profile | null {
    if (!this.activeEmbeddingConfig) return null;
    return this.profiles.find((p) => p.id === this.activeEmbeddingConfig!.profileId) ?? null;
  }

  getActiveEmbeddingConfig(): { profile: Profile; modelId: string } | null {
    if (!this.activeEmbeddingConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeEmbeddingConfig!.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeEmbeddingConfig.modelId };
  }

  getActiveWebSearchProfile(): Profile | null {
    if (!this.activeWebSearchConfig) return null;
    return this.profiles.find((p) => p.id === this.activeWebSearchConfig!.profileId) ?? null;
  }

  getActiveWebSearchConfig(): { profile: Profile; modelId: string } | null {
    if (!this.activeWebSearchConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeWebSearchConfig!.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeWebSearchConfig.modelId };
  }

  getSdkSettings(): SdkSettings {
    return { ...this.sdkSettings };
  }

  getProfileById(id: string): Profile | null {
    return this.profiles.find((p) => p.id === id) ?? null;
  }

  // --------------- Mutations ---------------

  addProfile(profile: Profile): void {
    if (this.profiles.some((p) => p.id === profile.id)) {
      throw new Error(`Profile with id "${profile.id}" already exists`);
    }
    this.profiles.push({ ...profile });
    this.persist();
  }

  updateProfile(id: string, updates: Partial<Profile>): void {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.profiles[idx] = { ...this.profiles[idx], ...updates, id };
    this.persist();
  }

  deleteProfile(id: string): void {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.profiles.splice(idx, 1);
    // Clear active references if they point to the deleted profile
    if (this.activeAgentConfig?.profileId === id) this.activeAgentConfig = null;
    if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
    if (this.activeChatConfig?.profileId === id) this.activeChatConfig = null;
    if (this.activeCopilotConfig?.profileId === id) this.activeCopilotConfig = null;
    if (this.activeEmbeddingConfig?.profileId === id) this.activeEmbeddingConfig = null;
    if (this.activeWebSearchConfig?.profileId === id) this.activeWebSearchConfig = null;
    this.persist();
  }

  toggleEnabled(id: string): void {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Profile with id "${id}" not found`);
    this.profiles[idx] = { ...this.profiles[idx], enabled: !this.profiles[idx].enabled };
    if (!this.profiles[idx].enabled) {
      if (this.activeAgentConfig?.profileId === id) this.activeAgentConfig = null;
      if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
      if (this.activeChatConfig?.profileId === id) this.activeChatConfig = null;
      if (this.activeCopilotConfig?.profileId === id) this.activeCopilotConfig = null;
      if (this.activeEmbeddingConfig?.profileId === id) this.activeEmbeddingConfig = null;
      if (this.activeWebSearchConfig?.profileId === id) this.activeWebSearchConfig = null;
    }
    this.persist();
  }

  setActiveAgentProfile(id: string | null): void {
    if (id === null) { this.activeAgentConfig = null; this.persist(); return; }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeAgentConfig = { profileId: id, modelId: profile.primaryModel };
    this.autoSeedAgentFast(profile);
    this.persist();
  }

  setActiveAgentConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeAgentConfig = config;
    if (config) {
      const profile = this.profiles.find(p => p.id === config.profileId);
      if (profile) this.autoSeedAgentFast(profile);
    }
    this.persist();
  }

  /** When Agent gets set and Agent Fast is still empty, seed Fast to the profile's fast tier. */
  private autoSeedAgentFast(profile: Profile): void {
    if (this.activeAgentFastConfig) return;
    this.activeAgentFastConfig = { profileId: profile.id, modelId: profile.fastModel };
  }

  setActiveAgentFastConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeAgentFastConfig = config;
    this.persist();
  }

  setActiveChatProfile(id: string | null): void {
    if (id === null) { this.activeChatConfig = null; this.persist(); return; }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeChatConfig = { profileId: id, modelId: profile.primaryModel };
    this.persist();
  }

  setActiveChatConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeChatConfig = config;
    this.persist();
  }

  setActiveCopilotConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeCopilotConfig = config;
    this.persist();
  }

  setActiveEmbeddingProfile(id: string | null): void {
    if (id === null) { this.activeEmbeddingConfig = null; this.persist(); return; }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeEmbeddingConfig = { profileId: id, modelId: profile.embeddingModel ?? profile.primaryModel };
    this.persist();
  }

  setActiveEmbeddingConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeEmbeddingConfig = config;
    this.persist();
  }

  setActiveWebSearchProfile(id: string | null): void {
    if (id === null) { this.activeWebSearchConfig = null; this.persist(); return; }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeWebSearchConfig = { profileId: id, modelId: profile.primaryModel };
    this.persist();
  }

  setActiveWebSearchConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeWebSearchConfig = config;
    this.persist();
  }

  // --------------- Custom Endpoints ---------------

  getCustomEndpoints(): OpenAICompatibleEndpoint[] {
    return [...this.customEndpoints];
  }

  addCustomEndpoint(endpoint: OpenAICompatibleEndpoint): void {
    this.customEndpoints.push({ ...endpoint });
    this.persist();
  }

  updateCustomEndpoint(id: string, updates: Partial<OpenAICompatibleEndpoint>): void {
    const idx = this.customEndpoints.findIndex(e => e.id === id);
    if (idx === -1) throw new Error(`Endpoint "${id}" not found`);
    this.customEndpoints[idx] = { ...this.customEndpoints[idx], ...updates, id };
    this.persist();
  }

  deleteCustomEndpoint(id: string): void {
    this.customEndpoints = this.customEndpoints.filter(e => e.id !== id);
    this.persist();
  }

  // --------------- Internal ---------------

  private persist(): void {
    if (!this.persistFn) return;
    const snapshot: ProfileSettings = {
      profiles: this.profiles.map((p) => ({ ...p })),
      activeAgentConfig: this.activeAgentConfig,
      activeAgentFastConfig: this.activeAgentFastConfig,
      activeChatConfig: this.activeChatConfig,
      activeCopilotConfig: this.activeCopilotConfig,
      activeEmbeddingConfig: this.activeEmbeddingConfig,
      activeWebSearchConfig: this.activeWebSearchConfig,
      sdkSettings: { ...this.sdkSettings },
      customEndpoints: this.customEndpoints.map(e => ({ ...e })),
    };
    void this.persistFn(snapshot);
  }
}
