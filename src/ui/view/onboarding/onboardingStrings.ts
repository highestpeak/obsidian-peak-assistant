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
            description: 'After setup, these are the first things you can try.',
            cards: [
                {
                    id: 'chat',
                    title: 'Chat',
                    body: 'Ask questions, draft, summarize, and continue a conversation.',
                    tryLater: 'Summarize my notes from this week.',
                },
                {
                    id: 'search',
                    title: 'Vault Search',
                    body: 'Search by keyword now; unlock semantic search when the index is ready.',
                    tryLater: 'retrieval augmented generation',
                },
                {
                    id: 'analysis',
                    title: 'AI Analysis',
                    body: 'Find connections, gaps, themes, and evidence across notes.',
                    tryLater: 'Find connections across my AI safety notes.',
                },
                {
                    id: 'copilot',
                    title: 'Copilot',
                    body: 'Improve the note you are currently writing.',
                    tryLater: 'Rewrite this section more clearly.',
                },
            ],
            continueCta: "Got it — let's configure",
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
            description: 'Peak will detect what already exists before running anything.',
            currentReadinessTitle: 'Current readiness',
            recommendedActionTitle: 'Recommended action',
            advancedToggle: 'Advanced',
            skipCta: 'Skip for now',
            readinessRows: [
                {
                    id: 'engine',
                    title: 'SQLite engine',
                    detail: 'Local database engine',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
                {
                    id: 'existing-index',
                    title: 'Existing index',
                    detail: 'No index yet — Peak will create one when you choose an action.',
                    state: 'neutral',
                    chipLabel: 'Not yet',
                },
                {
                    id: 'coverage',
                    title: 'Vault coverage',
                    detail: 'Scanning your vault for eligible notes.',
                    state: 'neutral',
                    chipLabel: 'Scanning',
                },
                {
                    id: 'semantic',
                    title: 'Semantic search',
                    detail: 'Missing embeddings',
                    state: 'attention',
                    chipLabel: 'Attention',
                },
            ],
            recommendedChip: 'Recommended',
            actionLabels: {
                'use-existing': 'Use the existing index',
                'update-changed': 'Update changed notes only',
                'build-text': 'Build a text-only index',
                'enable-semantic': 'Enable semantic search',
                'skip': 'Skip indexing for now',
                'rebuild': 'Rebuild from scratch',
            },
            actionDescriptions: {
                'use-existing': 'Keep everything as is. No changes will be made.',
                'update-changed': 'Index only the notes that have changed since the last scan.',
                'build-text': 'Start a text-only index covering all eligible notes.',
                'enable-semantic': 'Unlock semantic (vector) search for better results.',
                'skip': "Skip for now — you can run it from Settings later.",
                'rebuild': 'Delete the existing index and build a new one from scratch.',
            },
        },
        systemCheck: {
            title: 'System check',
            description: 'Quick pass over everything we just set up.',
            sectionTitle: 'Pre-flight checks',
            checkRows: [
                {
                    id: 'provider',
                    title: 'Provider',
                    detail: 'API key configured and reachable.',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
                {
                    id: 'ai-behavior',
                    title: 'AI behavior',
                    detail: 'Conversation, Fast Lookup, Research tiers bound.',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
                {
                    id: 'knowledge-index',
                    title: 'Knowledge Index',
                    detail: 'Text search ready · semantic search optional.',
                    state: 'attention',
                    chipLabel: 'Optional',
                },
                {
                    id: 'web-access',
                    title: 'Web Access',
                    detail: 'Not configured — add a search provider in Settings.',
                    state: 'neutral',
                    chipLabel: 'Optional',
                },
                {
                    id: 'safety',
                    title: 'Safety',
                    detail: 'Default tool permission mode active.',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
            ],
        },
        readyToTry: {
            title: 'Ready to try',
            description: '',
            launchCta: 'Open Chat',
            openSettingsCta: 'Open Settings',
            celebrationTitle: "You're ready to use Peak Assistant",
            celebrationSub: "Everything is set up. Here's a summary and some ideas to try first.",
            summaryTitle: 'Summary',
            summaryRows: [
                {
                    id: 'providers',
                    label: 'Providers',
                    value: 'Configured',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
                {
                    id: 'ai-behavior',
                    label: 'AI behavior',
                    value: 'Conversation · Fast Lookup · Research',
                    state: 'ready',
                    chipLabel: 'Ready',
                },
                {
                    id: 'index',
                    label: 'Index',
                    value: 'Text search · semantic optional',
                    state: 'attention',
                    chipLabel: 'Optional',
                },
            ],
            actionsTitle: 'Try first',
            actions: [
                {
                    id: 'chat',
                    title: 'Ask in Chat',
                    body: 'Ask questions, summarize, draft, and continue a conversation.',
                    tryLater: 'Summarize my notes from this week.',
                    tone: 'accent',
                },
                {
                    id: 'search',
                    title: 'Search your vault',
                    body: "Find what you've written with keyword search.",
                    tryLater: 'retrieval augmented generation',
                    tone: 'success',
                },
                {
                    id: 'analysis',
                    title: 'Run AI Analysis',
                    body: 'Discover connections, gaps, and themes across your notes.',
                    tryLater: 'Find connections across my AI safety notes.',
                    tone: 'info',
                },
                {
                    id: 'copilot',
                    title: 'Use Copilot on this note',
                    body: "Improve the note you're currently writing.",
                    tryLater: 'Rewrite this section more clearly.',
                    tone: 'warning',
                },
            ],
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
    progressLabels: {
        welcome: 'Welcome',
        capabilities: 'What Peak can do',
        provider: 'Add Provider',
        aiBehavior: 'Choose how Peak should work',
        indexReadiness: 'Check your vault index',
        systemCheck: 'System check',
        readyToTry: 'Ready to try',
    },
    progressTooltips: {
        welcome: 'What am I setting up?',
        capabilities: 'What can I actually use after this?',
        provider: 'Which AI service or local runtime powers this?',
        aiBehavior: 'Fast, balanced, research quality, or local/private.',
        indexReadiness: 'Detect existing index before running anything.',
        systemCheck: 'Is everything ready enough to start?',
        readyToTry: 'What should I try first?',
    },
    progressCounter: 'Step {n} of {total} · {title}',
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
