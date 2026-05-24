/**
 * Build TierBindings from settings + ProfileRegistry.
 *
 * Resolution order per tier:
 *   1. HarnessSettings.{localFast,localDeep,online}Config — explicit harness tier picks
 *   2. ProfileRegistry role configs (agent-fast / agent / chat) — fallback to existing UI pickers
 *
 * This lets users override per-tier models in Settings → Agent Harness while
 * still working for users who only configured the StatusBar role pickers.
 */

import type { LanguageModel } from 'ai';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
import { AppContext } from '@/app/context/AppContext';
import type { RoleConfig } from '@/core/profiles/types';
import type { ModelTier, TierBinding, TierBindings, TierCapabilities } from './types';
import { DEFAULT_TIER_CAPABILITIES } from './types';

export interface TierBindingOptions {
    capabilities?: Partial<TierCapabilities>;
    estimatedSingleStepP?: number;
}

const TIER_DEFAULTS: Record<ModelTier, { p: number; ctx: number }> = {
    'local-fast': { p: 0.87, ctx: 32_768 },
    'local-deep': { p: 0.93, ctx: 131_072 },
    online: { p: 0.99, ctx: 200_000 },
};

function bindingFromRole(
    tier: ModelTier,
    role: { profile: { id: string; kind: string }; modelId: string } | null,
    opts: TierBindingOptions = {},
): TierBinding | undefined {
    if (!role) return undefined;
    const defaults = TIER_DEFAULTS[tier];
    const profile = role.profile as any; // duck-typed: createLanguageModel needs full Profile
    return {
        tier,
        providerId: profile.id ?? profile.kind ?? 'unknown',
        modelId: role.modelId,
        resolve: (): LanguageModel => createLanguageModel(profile, role.modelId),
        capabilities: {
            ...DEFAULT_TIER_CAPABILITIES,
            maxContextTokens: defaults.ctx,
            ...opts.capabilities,
        },
        estimatedSingleStepP: opts.estimatedSingleStepP ?? defaults.p,
    };
}

/**
 * Resolve a HarnessSettings.tier RoleConfig to the {profile, modelId} shape
 * bindingFromRole expects. Returns null if profile lookup fails.
 */
function resolveTierConfig(cfg: RoleConfig | null): { profile: { id: string; kind: string }; modelId: string } | null {
    if (!cfg) return null;
    const profile = ProfileRegistry.getInstance().getProfileById(cfg.profileId);
    if (!profile) return null;
    return { profile, modelId: cfg.modelId };
}

/**
 * Build the tier→binding map.
 *
 * Reads HarnessSettings tier configs first, then falls back to the existing
 * StatusBar role configs (agent-fast / agent / chat). Tiers with neither
 * source bound are absent from the result; TierController handles missing
 * tiers by falling forward to the next bound one.
 */
export function defaultTierBindings(): TierBindings {
    const reg = ProfileRegistry.getInstance();
    const harness = AppContext.getHarnessSettings();
    return {
        'local-fast': bindingFromRole(
            'local-fast',
            resolveTierConfig(harness.localFastConfig) ?? reg.getActiveAgentFastConfig(),
        ),
        'local-deep': bindingFromRole(
            'local-deep',
            resolveTierConfig(harness.localDeepConfig) ?? reg.getActiveAgentConfig(),
        ),
        online: bindingFromRole(
            'online',
            resolveTierConfig(harness.onlineConfig) ?? reg.getActiveChatConfig(),
        ),
    };
}
