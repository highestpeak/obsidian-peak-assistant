/**
 * Public types for the Curator agent. See spec §4 and §6.
 *
 * Capability is the user-facing name for the three model tiers (Quick / Deep /
 * Premium). The legacy ModelTier (local-fast / local-deep / online) is mapped
 * 1:1 in tier-mapping.ts so the existing TierController keeps working.
 */

import type { ProfileKind } from '@/core/profiles/types';

export type Capability = 'quick' | 'deep' | 'premium';

export const CAPABILITY_ORDER: readonly Capability[] = ['quick', 'deep', 'premium'] as const;

export type BudgetTier = 'zero' | 'low' | 'high';
export type SpeedQualityPreference = 'speed' | 'balanced' | 'quality';

export interface UserPreferences {
    /** Monthly API spend ceiling ($0 / $5-20 / $50+). */
    budget: BudgetTier;
    /** Speed-vs-quality preference. */
    speedQuality: SpeedQualityPreference;
}

export interface ProfileSummary {
    id: string;
    kind: ProfileKind;
    name: string;
    /** True when the profile has a usable apiKey OR is a no-auth provider (ollama). */
    hasCredentials: boolean;
}

export interface EnvironmentSnapshot {
    /** Detected RAM in GB. Falls back to a conservative default when probing fails. */
    ramGB: number;
    /** True if an Ollama daemon responded on the default base URL. */
    ollamaRunning: boolean;
    /** Local Ollama model names currently installed (e.g. "qwen3:14b"). */
    ollamaInstalledModels: string[];
    /** Configured profile summaries (one per provider). */
    profiles: ProfileSummary[];
    /** Fraction of vault notes detected as primarily Chinese (0-1). */
    chineseRatio: number;
    /** When the snapshot was taken. */
    capturedAt: number;
    /** True when running on Obsidian mobile. */
    isMobile: boolean;
}

export interface CuratorContext {
    env: EnvironmentSnapshot;
    preferences: UserPreferences;
    /**
     * Optional free-form note from the user ("Premium 太贵换 Haiku") used when
     * regenerating after a rejected recommendation.
     */
    userNote?: string;
}

export type CapabilityBindings = Record<Capability, string>;

export interface Recommendation {
    bindings: CapabilityBindings;
    cascadeEnabled: boolean;
    modelsToDownload: string[];
    apiKeysNeeded: ProfileKind[];
    /** 2-3 sentence rationale shown to the user (Chinese). */
    rationale: string;
}

export type CuratorErrorKind =
    | 'validation_failed'
    | 'llm_invoke_failed'
    | 'no_bootstrap_model'
    | 'catalog_not_loaded';

export interface CuratorAttempt {
    attempt: number;
    /** Raw JSON returned by the LLM (parsed). null if invocation itself failed. */
    raw: unknown;
    /** Validation errors that caused retry. Empty when invocation failed before validation. */
    errors: ValidationError[];
    /** Invocation-time error message, if any. */
    error?: string;
}

export interface CuratorResult {
    recommendation: Recommendation;
    /** True when the LLM curator succeeded; false when we fell back to rule-based. */
    fromLLM: boolean;
    attempts: CuratorAttempt[];
}

export type ValidationErrorType =
    | 'unknown_model'
    | 'insufficient_ram'
    | 'budget_violation'
    | 'empty_bindings'
    | 'missing_tier'
    | 'tier_mismatch';

export interface ValidationError {
    type: ValidationErrorType;
    /** Tier the error applies to (when applicable). */
    tier?: Capability;
    /** Model id involved. */
    id?: string;
    /** Numeric attribute when the error is a quantitative comparison. */
    required?: number;
    /** Free-form message suitable for both UI and LLM-retry feedback. */
    message: string;
}
