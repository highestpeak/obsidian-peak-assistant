/**
 * Onboarding user-facing strings — PR-B externalization layer.
 *
 * All user-visible copy in the 7-step Curator onboarding wizard is sourced
 * from `templates/config/onboarding.json` at runtime via TemplateManager.
 * The embedded `DEFAULT_ONBOARDING_STRINGS` mirrors the JSON shape verbatim
 * and serves as a fallback when:
 *   - TemplateManager is unavailable (early bootstrap / tests)
 *   - The JSON file is missing or malformed
 *
 * Vocabulary contract (per onboarding-settings handoff §4) is encoded in the
 * JSON values — UI components should NEVER inline strings that would bypass
 * this contract. Examples:
 *   Profile → Provider
 *   Chat slot → Conversation
 *   Agent Fast / quick tier → Fast Lookup
 *   Agent / deep tier → Research
 *   Premium / online tier → Use stronger model when needed
 *   Embedding → Knowledge Index
 *   Web Search slot → Web Access
 *   MCP Servers → External tools
 *   Agent Harness → Agent runtime (Advanced page only)
 *   Permission mode → Safety
 *
 * Internal identifiers (settings field names, types, action enums) stay
 * unchanged — only user-visible copy is renamed.
 */

import React, { createContext, useContext } from 'react';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import onboardingDefaults from '../../../../templates/config/onboarding.json';

// ─── Shape ─────────────────────────────────────────────────────────────

export interface OnboardingStrings {
    actions: {
        back: string;
        continue: string;
        cancel: string;
        skip: string;
        gotIt: string;
        retry: string;
        done: string;
        accept: string;
        edit: string;
        regenerate: string;
        runCurator: string;
        addProvider: string;
        deleteProvider: string;
        openChat: string;
    };
    steps: {
        welcome: {
            titleInitial: string;
            titleReRun: string;
            description: string;
            startCta: string;
            manualCta: string;
        };
        capabilities: {
            title: string;
            description: string;
            /** 4 capability cards shown after Welcome. */
            cards: Array<{
                id: string;
                title: string;
                body: string;
                tryLater: string;
            }>;
            continueCta: string;
        };
        provider: {
            title: string;
            description: string;
            missingCredentialsChip: string;
            deleteProviderTitle: string;
        };
        bootstrap: {
            title: string;
            description: string;
            missingProviderHint: string;
            loadingModels: string;
            noLocalModelsHint: string;
            noCatalogModelsHint: string;
            recommendedChip: string;
        };
        preferences: {
            title: string;
            description: string;
            budgetQuestion: string;
            speedQuestion: string;
            budgetOptions: {
                zero: { label: string; hint: string };
                low: { label: string; hint: string };
                high: { label: string; hint: string };
            };
            speedOptions: {
                speed: { label: string; hint: string };
                balanced: { label: string; hint: string };
                quality: { label: string; hint: string };
            };
        };
        running: {
            title: string;
            description: string;
            cancelCta: string;
            bootstrapMissingError: string;
            catalogUnavailableError: string;
            profileGoneError: string;
        };
        review: {
            title: string;
            fallbackChip: string;
            cascadeLabel: string;
            cascadeOn: string;
            cascadeOff: string;
            rationaleTitle: string;
            downloadsTitle: string;
            apiKeysTitle: string;
            apiKeyInstructionSuffix: string;
            unknownModel: string;
            applyAllFailedNotice: string;
            applyPartialNotice: string;
            applySuccessNotice: string;
            tierLabels: {
                quick: string;
                deep: string;
                premium: string;
            };
            tierDescriptions: {
                quick: string;
                deep: string;
                premium: string;
            };
        };
        editRecommendation: {
            title: string;
            description: string;
            unknownModelPlaceholderSuffix: string;
            doneCta: string;
        };
        redoInput: {
            title: string;
            description: string;
            placeholder: string;
            presets: string[];
            submitCta: string;
        };
        indexReadiness: {
            title: string;
            description: string;
            currentReadinessTitle: string;
            recommendedActionTitle: string;
            advancedToggle: string;
            skipCta: string;
            readinessRows: Array<{
                id: string;
                title: string;
                detail: string;
                /** 'ready' / 'attention' / 'neutral' */
                state: 'ready' | 'attention' | 'neutral';
                chipLabel: string;
            }>;
            recommendedChip: string;
            actionLabels: {
                'use-existing': string;
                'update-changed': string;
                'build-text': string;
                'enable-semantic': string;
                'skip': string;
                'rebuild': string;
            };
            actionDescriptions: {
                'use-existing': string;
                'update-changed': string;
                'build-text': string;
                'enable-semantic': string;
                'skip': string;
                'rebuild': string;
            };
        };
        systemCheck: {
            title: string;
            description: string;
            sectionTitle: string;
            checkRows: Array<{
                id: string;
                title: string;
                detail: string;
                state: 'ready' | 'attention' | 'neutral';
                chipLabel: string;
            }>;
        };
        readyToTry: {
            title: string;
            description: string;
            launchCta: string;
            openSettingsCta: string;
            celebrationTitle: string;
            celebrationSub: string;
            summaryTitle: string;
            summaryRows: Array<{
                id: string;
                label: string;
                value: string;
                state: 'ready' | 'attention' | 'neutral';
                chipLabel: string;
            }>;
            actionsTitle: string;
            actions: Array<{
                id: string;
                title: string;
                body: string;
                tryLater: string;
                tone: 'accent' | 'success' | 'info' | 'warning';
            }>;
        };
    };
    substepLabels: {
        chooseBootstrap: string;
        preferenceQuestions: string;
        runningCurator: string;
        reviewRecommendation: string;
        editRecommendation: string;
        redoInput: string;
    };
    /** Short labels for the progress indicator bubbles (one per primary step). */
    progressLabels: {
        welcome: string;
        capabilities: string;
        provider: string;
        aiBehavior: string;
        indexReadiness: string;
        systemCheck: string;
        readyToTry: string;
    };
    /** Tooltip hint for each progress bubble (one-line "what is this step"). */
    progressTooltips: {
        welcome: string;
        capabilities: string;
        provider: string;
        aiBehavior: string;
        indexReadiness: string;
        systemCheck: string;
        readyToTry: string;
    };
    /** "Step N of 7 · {title}" header — {n} / {total} / {title} placeholders. */
    progressCounter: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────

/**
 * Fallback strings used when the JSON template cannot be loaded. Values
 * MUST mirror `templates/config/onboarding.json` exactly and respect the
 * vocabulary contract.
 */
export const DEFAULT_ONBOARDING_STRINGS: OnboardingStrings = onboardingDefaults as unknown as OnboardingStrings;

// ─── React context for injection ───────────────────────────────────────

const OnboardingStringsContext = createContext<OnboardingStrings>(DEFAULT_ONBOARDING_STRINGS);

export interface OnboardingStringsProviderProps {
    strings: OnboardingStrings;
    children: React.ReactNode;
}

export function OnboardingStringsProvider({ strings, children }: OnboardingStringsProviderProps): React.ReactElement {
    return React.createElement(OnboardingStringsContext.Provider, { value: strings }, children);
}

/** Hook for accessing the active onboarding strings bundle. */
export function useOnboardingStrings(): OnboardingStrings {
    return useContext(OnboardingStringsContext);
}

// ─── Loader ────────────────────────────────────────────────────────────

/**
 * Try to load onboarding strings from the JSON template. Falls back to the
 * embedded defaults when AppContext / TemplateManager are unavailable or the
 * template cannot be parsed. Never throws.
 *
 * Mirrors `VaultLintService.loadConfig` semantics so the wizard can boot in
 * any environment (tests, early plugin init, missing template file).
 */
export async function loadOnboardingStrings(): Promise<OnboardingStrings> {
    try {
        const tm = TemplateManager.getInstance();
        if (!tm) return DEFAULT_ONBOARDING_STRINGS;
        const parsed = await tm.loadJson<Partial<OnboardingStrings> & { _doc?: string }>(
            ConfigTemplateId.Onboarding,
        );
        if (!parsed || typeof parsed !== 'object') return DEFAULT_ONBOARDING_STRINGS;
        return mergeOnboardingStrings(DEFAULT_ONBOARDING_STRINGS, parsed);
    } catch {
        return DEFAULT_ONBOARDING_STRINGS;
    }
}

/**
 * Deep-merge the JSON overrides onto the defaults. Missing keys fall through
 * to defaults so partial JSON is non-fatal.
 */
function mergeOnboardingStrings(
    defaults: OnboardingStrings,
    overrides: Partial<OnboardingStrings>,
): OnboardingStrings {
    return {
        actions: { ...defaults.actions, ...(overrides.actions ?? {}) },
        steps: mergeSteps(defaults.steps, overrides.steps ?? {}),
        substepLabels: { ...defaults.substepLabels, ...(overrides.substepLabels ?? {}) },
        progressLabels: { ...defaults.progressLabels, ...(overrides.progressLabels ?? {}) },
        progressTooltips: { ...defaults.progressTooltips, ...(overrides.progressTooltips ?? {}) },
        progressCounter: overrides.progressCounter ?? defaults.progressCounter,
    };
}

function mergeSteps(
    defaults: OnboardingStrings['steps'],
    overrides: Partial<OnboardingStrings['steps']>,
): OnboardingStrings['steps'] {
    const merged = { ...defaults } as OnboardingStrings['steps'];
    for (const key of Object.keys(overrides) as (keyof OnboardingStrings['steps'])[]) {
        const o = overrides[key];
        if (o && typeof o === 'object') {
            // Shallow merge per-step; nested option records are replaced wholesale
            // when the override provides them, which is the desired semantics.
            (merged as Record<string, unknown>)[key] = { ...defaults[key], ...o };
        }
    }
    return merged;
}
