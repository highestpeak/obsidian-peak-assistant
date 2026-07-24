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
import type { HarnessSettings } from '@/core/config/settingsTypes';
import type { ModelTier, TierBinding, TierBindings, TierCapabilities } from './types';
import { DEFAULT_TIER_CAPABILITIES } from './types';

export interface TierBindingOptions {
    capabilities?: Partial<TierCapabilities>;
    estimatedSingleStepP?: number;
}

const TIER_DEFAULTS: Record<ModelTier, { p: number; ctx: number }> = {
    fast: { p: 0.87, ctx: 32_768 },
    research: { p: 0.93, ctx: 131_072 },
    stronger: { p: 0.99, ctx: 200_000 },
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
 * Build the tier→binding map.
 *
 * Resolves each tier through `ProfileRegistry.resolveSlot` — the single
 * model-binding resolver shared with the SDK path (`queryWithProfile`). We
 * first refresh the registry's tier mirror from the settings we were handed so
 * the harness and any concurrent SDK call resolve identical bindings. The three
 * cascade tiers (fast / research / stronger) ARE slots, so each maps to itself.
 * Tiers with neither an explicit pick nor a role fallback are absent;
 * TierController falls forward to the next bound tier.
 */
export function defaultTierBindings(harness: HarnessSettings): TierBindings {
    const reg = ProfileRegistry.getInstance();
    reg.setTierConfigs({
        fast: harness.localFastConfig ?? null,
        research: harness.localDeepConfig ?? null,
        stronger: harness.onlineConfig ?? null,
    });
    return {
        fast: bindingFromRole('fast', reg.resolveSlot('fast')),
        research: bindingFromRole('research', reg.resolveSlot('research')),
        stronger: bindingFromRole('stronger', reg.resolveSlot('stronger')),
    };
}
