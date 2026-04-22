/**
 * Migration helper: detect v1 settings structures and create Profile(s).
 *
 * V1 had two possible credential sources:
 *   1. `vaultSearch.sdkProfile` — explicit SDK profile for vault search
 *   2. `ai.llmProviderConfigs` — per-provider chat configs (claude, openrouter, etc.)
 *
 * This module detects those shapes and creates proper Profile objects.
 * Returns null if no v1 data is found.
 */

import type { Profile, ProfileKind } from './types';
import { createPresetProfile } from './presets';

/**
 * Attempt to migrate from v1 settings. Inspects the raw settings object
 * for known v1 structures and returns an array of Profile(s), or null
 * if no migratable data was found.
 */
export function migrateFromV1(settings: any): Profile[] | null {
  if (!settings || typeof settings !== 'object') return null;

  const profiles: Profile[] = [];

  // Source 1: vaultSearch.sdkProfile
  const sdkProfile = settings.vaultSearch?.sdkProfile;
  if (sdkProfile && typeof sdkProfile === 'object') {
    const kind: ProfileKind = validKind(sdkProfile.kind) ?? 'anthropic-direct';
    const profile = createPresetProfile(kind, {
      name: `Migrated ${kindLabel(kind)}`,
      baseUrl: typeof sdkProfile.baseUrl === 'string' ? sdkProfile.baseUrl : undefined,
      apiKey: typeof sdkProfile.apiKey === 'string' ? sdkProfile.apiKey : null,
      authToken: typeof sdkProfile.authToken === 'string' ? sdkProfile.authToken : null,
      primaryModel: typeof sdkProfile.primaryModel === 'string' ? sdkProfile.primaryModel : undefined,
      fastModel: typeof sdkProfile.fastModel === 'string' ? sdkProfile.fastModel : undefined,
      customHeaders:
        sdkProfile.customHeaders && typeof sdkProfile.customHeaders === 'object'
          ? sdkProfile.customHeaders
          : undefined,
      description: 'Auto-migrated from vaultSearch.sdkProfile',
    });
    // Only add if it has some useful content (not a bare default)
    if (profile.apiKey || profile.authToken) {
      profiles.push(profile);
    }
  }

  // Source 2: ai.llmProviderConfigs
  const providerConfigs = settings.ai?.llmProviderConfigs;
  if (providerConfigs && typeof providerConfigs === 'object') {
    // Deduplicate: if we already got credentials from sdkProfile, skip providers
    // whose credentials match what we already have.
    const existingKeys = new Set(profiles.map((p) => p.apiKey ?? p.authToken).filter(Boolean));

    for (const [providerKey, config] of Object.entries(providerConfigs)) {
      if (!config || typeof config !== 'object') continue;
      const cfg = config as { apiKey?: string; baseUrl?: string };
      if (!cfg.apiKey) continue;
      if (existingKeys.has(cfg.apiKey)) continue;

      let kind: ProfileKind;
      let presetOverrides: Partial<Profile>;

      if (providerKey === 'claude' || providerKey === 'anthropic') {
        kind = 'anthropic-direct';
        presetOverrides = {
          name: 'Migrated Anthropic',
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl ?? undefined,
          description: `Auto-migrated from llmProviderConfigs.${providerKey}`,
        };
      } else if (providerKey === 'openrouter') {
        kind = 'openrouter';
        presetOverrides = {
          name: 'Migrated OpenRouter',
          authToken: cfg.apiKey, // OpenRouter uses API key as bearer token
          apiKey: null,
          baseUrl: cfg.baseUrl ?? undefined,
          description: `Auto-migrated from llmProviderConfigs.${providerKey}`,
        };
      } else {
        kind = 'custom';
        presetOverrides = {
          name: `Migrated ${providerKey}`,
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl ?? '',
          description: `Auto-migrated from llmProviderConfigs.${providerKey}`,
        };
      }

      profiles.push(createPresetProfile(kind, presetOverrides));
      existingKeys.add(cfg.apiKey);
    }
  }

  return profiles.length > 0 ? profiles : null;
}

// --------------- Helpers ---------------

const VALID_KINDS = new Set<string>(['anthropic-direct', 'openrouter', 'litellm', 'custom']);

function validKind(raw: unknown): ProfileKind | null {
  return typeof raw === 'string' && VALID_KINDS.has(raw) ? (raw as ProfileKind) : null;
}

function kindLabel(kind: ProfileKind): string {
  switch (kind) {
    case 'anthropic-direct': return 'Anthropic Direct';
    case 'openrouter': return 'OpenRouter';
    case 'litellm': return 'LiteLLM';
    case 'custom': return 'Custom';
  }
}
