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
import { AppContext } from '@/app/context/AppContext';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

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
            actionLabels: {
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
        };
        readyToTry: {
            title: string;
            description: string;
            launchCta: string;
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
}

// ─── Defaults ──────────────────────────────────────────────────────────

/**
 * Fallback strings used when the JSON template cannot be loaded. Values
 * MUST mirror `templates/config/onboarding.json` exactly and respect the
 * vocabulary contract.
 */
export const DEFAULT_ONBOARDING_STRINGS: OnboardingStrings = {
    actions: {
        back: 'Back',
        continue: 'Continue',
        cancel: 'Cancel',
        skip: 'Skip',
        gotIt: 'Got it',
        retry: 'Retry',
        done: 'Done',
        accept: 'Accept',
        edit: 'Edit',
        regenerate: 'Regenerate',
        runCurator: 'Build my recommendation',
        addProvider: 'Add Provider',
        deleteProvider: 'Delete provider',
        openChat: 'Open Chat',
    },
    steps: {
        welcome: {
            titleInitial: 'Set up Peak Assistant',
            titleReRun: 'Re-run setup',
            description:
                'We will look at your environment (RAM, installed Ollama, configured API keys, note language) and your preferences (budget, speed vs quality) to pick a model for Fast Lookup, Research, and the “stronger model when needed” tier. You can accept, edit, or redo at any time.',
            startCta: 'Start',
            manualCta: 'Skip — I will configure it myself (advanced)',
        },
        capabilities: {
            title: 'What Peak can do',
            description:
                'Chat with your vault, search across notes, run analysis, and use Copilot inline on a note.',
        },
        provider: {
            title: 'Pick a Provider',
            description:
                'The setup assistant pulls one starter model from this Provider; the final tier bindings can come from any Provider.',
            missingCredentialsChip: 'API key missing',
            deleteProviderTitle: 'Delete provider',
        },
        bootstrap: {
            title: 'Pick a starter model',
            description:
                'The setup assistant runs once with this model to recommend bindings for each tier. Pick the cheapest viable option — it only runs once.',
            missingProviderHint: 'Go back and pick a Provider first.',
            loadingModels: 'Loading model list…',
            noLocalModelsHint:
                'No local models found — run `ollama pull qwen3:4b`, then come back.',
            noCatalogModelsHint:
                'No usable models found for this Provider. Catalog may be out of date.',
            recommendedChip: 'Recommended',
        },
        preferences: {
            title: 'Two last questions',
            description:
                'The setup assistant uses your answers to recommend bindings — not a commitment, you can accept, edit, or redo.',
            budgetQuestion: '1. Monthly API budget?',
            speedQuestion: '2. Speed vs quality?',
            budgetOptions: {
                zero: { label: '$0 / minimal', hint: 'Fully local, works offline' },
                low: { label: '$5–20', hint: 'Moderate usage' },
                high: { label: '$50+', hint: 'Heavy usage' },
            },
            speedOptions: {
                speed: { label: 'Speed first', hint: 'Reply within ~1s' },
                balanced: { label: 'Balanced', hint: 'Default recommendation' },
                quality: { label: 'Quality first', hint: 'Use a stronger model when it matters' },
            },
        },
        running: {
            title: 'Setup assistant is analysing…',
            description:
                'Scanning RAM, Ollama, configured Providers, note language; matching catalog models; building a recommendation with reasoning. Usually 5–15 seconds.',
            cancelCta: 'Cancel',
            bootstrapMissingError: 'Starter model missing. Go back and pick one.',
            catalogUnavailableError: 'Model catalog unavailable. Using a rule-based fallback.',
            profileGoneError: 'Selected Provider no longer exists. Go back and re-pick.',
        },
        review: {
            title: 'Recommended setup',
            fallbackChip: 'Rule-based fallback',
            cascadeLabel: 'Cascade:',
            cascadeOn: 'On',
            cascadeOff: 'Off',
            rationaleTitle: 'Why this recommendation',
            downloadsTitle: 'Need to download',
            apiKeysTitle: 'Need an API key',
            apiKeyInstructionSuffix: '(add it in Settings)',
            unknownModel: '⚠ unknown model',
            applyAllFailedNotice:
                'Apply failed: every tier is missing a matching Provider. Add a Provider first.',
            applyPartialNotice: 'Applied: {applied}; skipped: {skipped} (missing Provider)',
            applySuccessNotice: 'Tier bindings applied.',
            tierLabels: {
                quick: 'Fast Lookup',
                deep: 'Research',
                premium: 'Use stronger model when needed',
            },
            tierDescriptions: {
                quick: 'About 1s for a single-step reply',
                deep: 'Multi-step reasoning / long documents',
                premium: 'Fallback for the hard or critical moments',
            },
        },
        editRecommendation: {
            title: 'Edit tier bindings',
            description:
                'Each tier lists catalog models suitable for it. Tap "Done" to return to the recommendation preview.',
            unknownModelPlaceholderSuffix: '(unknown — pick another)',
            doneCta: 'Done',
        },
        redoInput: {
            title: 'Tell the setup assistant what to change',
            description: 'It will re-recommend based on your feedback.',
            placeholder: 'For example: the stronger model is too expensive — try Sonnet instead',
            presets: [
                'The stronger model is too expensive — pick something cheaper',
                'Lean more on local models, less on cloud',
                'Fast Lookup is too weak — pick something smarter',
                'Research is too slow — pick something faster',
            ],
            submitCta: 'Regenerate',
        },
        indexReadiness: {
            title: 'Check your Knowledge Index',
            description:
                'Pick an indexing action to continue. (Detailed recommended-action UI lands in the next refresh.)',
            actionLabels: {
                'use-existing': 'Use the existing index',
                'update-changed': 'Update changed notes only',
                'build-text': 'Build a text-only index',
                'enable-semantic': 'Enable semantic search',
                'skip': 'Skip indexing for now',
                'rebuild': 'Rebuild from scratch',
            },
        },
        systemCheck: {
            title: 'System check',
            description:
                'Summary of Provider, AI behaviour, Knowledge Index, Web Access, and Safety. (Live readiness rows land in the next refresh.)',
        },
        readyToTry: {
            title: 'You are ready to use Peak Assistant',
            description:
                'Open Chat, search your vault, run AI Analysis, or use Copilot inline. (Launchpad UI lands in the next refresh.)',
            launchCta: 'Open Chat',
        },
    },
    substepLabels: {
        chooseBootstrap: 'Pick a starter model',
        preferenceQuestions: 'A couple of preferences',
        runningCurator: 'Building your recommendation',
        reviewRecommendation: 'Review your model choices',
        editRecommendation: 'Editing model choices',
        redoInput: 'Regenerate with a note',
    },
};

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
        const tm = AppContext.getInstance().manager.getTemplateManager?.();
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
