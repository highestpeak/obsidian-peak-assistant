/**
 * Three-tier model routing primitives. See spec §3.1.
 *
 * A TierBinding pairs an abstract tier with a concrete Vercel AI SDK
 * LanguageModel resolver. TierPolicy controls cascade behavior at runtime.
 */

import type { LanguageModel } from 'ai';
// Re-export ModelTier from core so downstream service files keep their
// existing import paths. The identifier union itself lives in
// `core/types/model-tier.ts` so `core/ports/ToolPort.ts` can reference
// it without inverting the layering.
export type { ModelTier } from '@/core/types/model-tier';
import type { ModelTier } from '@/core/types/model-tier';

export const TIER_ORDER: readonly ModelTier[] = ['fast', 'research', 'stronger'] as const;

export interface TierCapabilities {
    toolCalling: boolean;
    parallelToolCalls: boolean;
    structuredOutput: boolean;
    thinking: boolean;
    maxContextTokens: number;
}

export interface TierBinding {
    tier: ModelTier;
    providerId: string;
    modelId: string;
    resolve: () => LanguageModel;
    capabilities: TierCapabilities;
    /** Documented single-step well-formed-call probability, drives cascade decisions. */
    estimatedSingleStepP: number;
}

export type TierBindings = Partial<Record<ModelTier, TierBinding>>;

export interface TierPolicy {
    preferred: ModelTier;
    allowEscalation: boolean;
    /** Self-score threshold below which we auto-escalate. 0-1. */
    escalationThreshold: number;
    /** Hard cap on automatic upgrades per loop. */
    maxEscalationsPerLoop: number;
}

export const DEFAULT_TIER_POLICY: TierPolicy = {
    preferred: 'fast',
    allowEscalation: true,
    escalationThreshold: 0.6,
    maxEscalationsPerLoop: 1,
};

export const DEFAULT_TIER_CAPABILITIES: TierCapabilities = {
    toolCalling: true,
    parallelToolCalls: false,
    structuredOutput: true,
    thinking: false,
    maxContextTokens: 32_768,
};
