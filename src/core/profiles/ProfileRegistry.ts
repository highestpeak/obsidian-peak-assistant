/**
 * Singleton registry that owns the lifecycle of all Profile instances.
 *
 * The registry is loaded once during plugin init (via `load()`), and
 * mutations (add/update/delete/setActive) automatically persist through
 * the provided callback.
 */

import type { Profile, ProfileSettings, RoleConfig, SdkSettings } from './types';
import { DEFAULT_SDK_SETTINGS } from './types';

export type PersistFn = (settings: ProfileSettings) => void | Promise<void>;

export class ProfileRegistry {
  private static instance: ProfileRegistry | null = null;

  private profiles: Profile[] = [];
  private activeAgentConfig: RoleConfig | null = null;
  private activeEmbeddingConfig: RoleConfig | null = null;
  private activeWebSearchConfig: RoleConfig | null = null;
  private sdkSettings: SdkSettings = { ...DEFAULT_SDK_SETTINGS };
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
    this.profiles = [...settings.profiles];
    this.activeAgentConfig = settings.activeAgentConfig ?? this.migrateOldId(settings.activeAgentProfileId);
    this.activeEmbeddingConfig = settings.activeEmbeddingConfig ?? this.migrateOldId(settings.activeEmbeddingProfileId);
    this.activeWebSearchConfig = settings.activeWebSearchConfig ?? this.migrateOldId(settings.activeWebSearchProfileId);
    this.sdkSettings = { ...DEFAULT_SDK_SETTINGS, ...settings.sdkSettings };
    this.persistFn = persistFn;
  }

  private migrateOldId(id: string | null | undefined): RoleConfig | null {
    if (!id) return null;
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return null;
    return { profileId: id, modelId: profile.primaryModel };
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
    this.persist();
  }

  setActiveAgentConfig(config: RoleConfig | null): void {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeAgentConfig = config;
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

  // --------------- Internal ---------------

  private persist(): void {
    if (!this.persistFn) return;
    const snapshot: ProfileSettings = {
      profiles: this.profiles.map((p) => ({ ...p })),
      activeAgentConfig: this.activeAgentConfig,
      activeEmbeddingConfig: this.activeEmbeddingConfig,
      activeWebSearchConfig: this.activeWebSearchConfig,
      sdkSettings: { ...this.sdkSettings },
    };
    void this.persistFn(snapshot);
  }
}
