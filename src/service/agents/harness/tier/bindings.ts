/**
 * Build TierBindings from settings + ProfileRegistry.
 *
 * Every tier comes only from its matching HarnessSettings binding. Missing
 * tiers remain absent and cannot borrow an Agent, Chat, or neighboring tier.
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
 * model-binding resolver shared by all Harness consumers. We
 * first refresh the registry's tier mirror from the settings we were handed so
 * all concurrent Harness consumers resolve identical bindings. The three
 * cascade tiers (fast / research / stronger) ARE slots, so each maps to itself.
	* Tiers without an explicit pick are absent; TierController rejects a run
	* whose configured preferred tier is absent.
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
