/**
 * Build TierBindings from the existing ProfileRegistry.
 *
 * M1 wiring: each tier reads a role-config (agent-fast / agent / chat) off
 * ProfileRegistry and resolves the LanguageModel via the existing provider
 * factory. Profiles are unchanged; UI still drives them via the normal
 * settings flow.
 */

import type { LanguageModel } from 'ai';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createLanguageModel } from '@/core/providers/vercel/provider-factory';
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
 * Read currently-active role configs out of ProfileRegistry and produce a
 * partial map. Tiers without a bound role are simply absent.
 */
export function defaultTierBindings(): TierBindings {
    const reg = ProfileRegistry.getInstance();
    return {
        'local-fast': bindingFromRole('local-fast', reg.getActiveAgentFastConfig()),
        'local-deep': bindingFromRole('local-deep', reg.getActiveAgentConfig()),
        online: bindingFromRole('online', reg.getActiveChatConfig()),
    };
}
