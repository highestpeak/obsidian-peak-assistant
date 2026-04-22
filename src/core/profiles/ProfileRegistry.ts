/**
 * Singleton registry that owns the lifecycle of all Profile instances.
 *
 * The registry is loaded once during plugin init (via `load()`), and
 * mutations (add/update/delete/setActive) automatically persist through
 * the provided callback.
 */

import type { Profile, ProfileSettings, SdkSettings } from './types';
import { DEFAULT_SDK_SETTINGS } from './types';

export type PersistFn = (settings: ProfileSettings) => void | Promise<void>;

export class ProfileRegistry {
  private static instance: ProfileRegistry | null = null;

  private profiles: Profile[] = [];
  private activeAgentProfileId: string | null = null;
  private activeEmbeddingProfileId: string | null = null;
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
   */
  load(settings: ProfileSettings, persistFn: PersistFn): void {
    this.profiles = [...settings.profiles];
    this.activeAgentProfileId = settings.activeAgentProfileId;
    this.activeEmbeddingProfileId = settings.activeEmbeddingProfileId;
    this.sdkSettings = { ...DEFAULT_SDK_SETTINGS, ...settings.sdkSettings };
    this.persistFn = persistFn;
  }

  // --------------- Selectors ---------------

  getAllProfiles(): Profile[] {
    return [...this.profiles];
  }

  getActiveAgentProfile(): Profile | null {
    if (!this.activeAgentProfileId) return null;
    return this.profiles.find((p) => p.id === this.activeAgentProfileId) ?? null;
  }

  getActiveEmbeddingProfile(): Profile | null {
    if (!this.activeEmbeddingProfileId) return null;
    return this.profiles.find((p) => p.id === this.activeEmbeddingProfileId) ?? null;
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
    if (this.activeAgentProfileId === id) this.activeAgentProfileId = null;
    if (this.activeEmbeddingProfileId === id) this.activeEmbeddingProfileId = null;
    this.persist();
  }

  setActiveAgentProfile(id: string | null): void {
    if (id !== null && !this.profiles.some((p) => p.id === id)) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.activeAgentProfileId = id;
    this.persist();
  }

  setActiveEmbeddingProfile(id: string | null): void {
    if (id !== null && !this.profiles.some((p) => p.id === id)) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.activeEmbeddingProfileId = id;
    this.persist();
  }

  // --------------- Internal ---------------

  private persist(): void {
    if (!this.persistFn) return;
    const snapshot: ProfileSettings = {
      profiles: this.profiles.map((p) => ({ ...p })),
      activeAgentProfileId: this.activeAgentProfileId,
      activeEmbeddingProfileId: this.activeEmbeddingProfileId,
      sdkSettings: { ...this.sdkSettings },
    };
    void this.persistFn(snapshot);
  }
}
