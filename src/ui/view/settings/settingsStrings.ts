/**
 * Settings user-facing strings — PR-B externalization layer.
 *
 * Mirrors the onboarding-strings pattern (see
 * `src/ui/view/onboarding/onboardingStrings.ts`). All user-visible copy in
 * the settings surface should be sourced from
 * `templates/config/settings.json` at runtime via TemplateManager, with
 * embedded defaults as fallback.
 *
 * PR-B scope (per onboarding-settings handoff): apply the vocabulary contract
 * to the HIGH-vocab-violation surfaces — Harness section + External-tools
 * (MCP) section — without rewriting the 4-tab IA. PR-D will rewrite Settings
 * into the 5-tab IA on top of these JSON strings.
 *
 * Vocabulary contract (handoff §4) — user-visible only:
 *   Profile → Provider
 *   Quick tier → Fast Lookup
 *   Deep tier → Research
 *   Premium / online tier → Use stronger model when needed
 *   Embedding → Knowledge Index
 *   Web Search slot → Web Access
 *   MCP Servers → External tools
 *   Permission mode → Safety
 *   Agent Harness → Agent runtime (Advanced page; "Harness" still allowed
 *                                  inside the Advanced tab, hence
 *                                  `harness.advancedSectionTitle` may still
 *                                  reference the word)
 *
 * Internal identifiers (settings field names, types, enum values) are
 * untouched.
 */

import React, { createContext, useContext } from 'react';
import { AppContext } from '@/app/context/AppContext';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

// ─── Shape ─────────────────────────────────────────────────────────────

export interface SettingsStrings {
    harness: {
        reRunBanner: {
            title: string;
            description: string;
            cta: string;
        };
        backend: {
            sectionLabel: string;
            info: string;
            fieldLabel: string;
            fieldHint: string;
            options: {
                auto: string;
                harness: string;
                claudeAgentSdk: string;
            };
        };
        tierBindings: {
            sectionLabel: string;
            info: string;
            fastTier: { label: string; hint: string; pickerLabel: string };
            researchTier: { label: string; hint: string; pickerLabel: string };
            strongerTier: { label: string; hint: string; pickerLabel: string };
            unsetPickerSuffix: string;
        };
        escalation: {
            sectionLabel: string;
            allowFieldLabel: string;
            allowFieldHint: string;
            allowToggleLabel: string;
            maxFieldLabel: string;
            maxFieldHint: string;
            thresholdFieldLabel: string;
            thresholdFieldHint: string;
        };
        safety: {
            sectionLabel: string;
            fieldLabel: string;
            fieldHint: string;
            options: {
                read: string;
                acceptEdits: string;
                bypassPermissions: string;
            };
        };
        hooks: {
            sectionLabel: string;
            comingSoonChip: string;
            enableLabel: string;
            enableHint: string;
            description: string;
        };
    };
    externalTools: {
        title: string;
        description: string;
        emptyHint: string;
        addCta: string;
        defaultServerName: string;
    };
}

// ─── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS_STRINGS: SettingsStrings = {
    harness: {
        reRunBanner: {
            title: 'Re-run setup wizard',
            description: 'Let the setup assistant re-pick tier bindings from your current environment.',
            cta: 'Run',
        },
        backend: {
            sectionLabel: 'Agent runtime',
            info:
                'Which loop engine runs agents. The in-process runtime sits on top of Vercel AI SDK and supports any Provider (Claude, GPT, Ollama, OpenRouter). The Claude Agent SDK runtime is Anthropic’s official SDK (Anthropic models only). Vault Search currently requires the Claude Agent SDK runtime until its tools are adapted.',
            fieldLabel: 'Runtime',
            fieldHint: 'Picks the loop engine; per-tier model selection is via Tier Bindings below.',
            options: {
                auto: 'Auto (in-process where supported, Claude Agent SDK for the rest)',
                harness: 'In-process runtime (Vercel AI SDK, any Provider)',
                claudeAgentSdk: 'Claude Agent SDK (Anthropic only)',
            },
        },
        tierBindings: {
            sectionLabel: 'Tier model bindings',
            info:
                'Pick which model serves each tier. The Fast Lookup and Research tiers usually use local Providers (Ollama); the “stronger model” tier usually uses cloud Providers (Anthropic, OpenRouter). Unset tiers are skipped when the runtime cascades.',
            fastTier: {
                label: 'Fast Lookup (local)',
                hint: 'Single-step replies, ~1s (works well with 14B local models)',
                pickerLabel: 'Fast Lookup',
            },
            researchTier: {
                label: 'Research (local)',
                hint: 'Multi-step reasoning / long documents (works well with 32B+ local models)',
                pickerLabel: 'Research',
            },
            strongerTier: {
                label: 'Use stronger model when needed',
                hint: 'Cloud model used as the fallback when local tiers are not enough',
                pickerLabel: 'Stronger model',
            },
            unsetPickerSuffix: 'Not configured',
        },
        escalation: {
            sectionLabel: 'Escalation policy',
            allowFieldLabel: 'Allow escalation',
            allowFieldHint: 'Auto-upgrade to the next tier on low confidence',
            allowToggleLabel: 'Enable automatic tier escalation',
            maxFieldLabel: 'Max escalations / loop',
            maxFieldHint: 'Hard cap per agent run (1–3)',
            thresholdFieldLabel: 'Auto-escalate score threshold',
            thresholdFieldHint: 'Escalate when step score falls below this (0–1)',
        },
        safety: {
            sectionLabel: 'Safety',
            fieldLabel: 'Default safety mode',
            fieldHint: 'Controls how agents handle write operations to your vault.',
            options: {
                read: 'Read only (no writes)',
                acceptEdits: 'Accept edits (auto-approve vault writes)',
                bypassPermissions: 'Bypass safety (unsafe)',
            },
        },
        hooks: {
            sectionLabel: 'Hooks (advanced)',
            comingSoonChip: 'Coming soon',
            enableLabel: 'Enable hooks',
            enableHint: 'Enable pre/post tool-use hooks',
            description:
                'Hook configuration DSL is not yet available. This section will allow defining deny rules and command hooks for pre_tool_use / post_tool_use events.',
        },
    },
    externalTools: {
        title: 'External tools',
        description:
            'Connect external tool servers (MCP) to extend agent capabilities with additional commands.',
        emptyHint: 'No external tools configured. Add one to get started.',
        addCta: 'Add tool server',
        defaultServerName: 'New tool server',
    },
};

// ─── React context for injection ───────────────────────────────────────

const SettingsStringsContext = createContext<SettingsStrings>(DEFAULT_SETTINGS_STRINGS);

export interface SettingsStringsProviderProps {
    strings: SettingsStrings;
    children: React.ReactNode;
}

export function SettingsStringsProvider({ strings, children }: SettingsStringsProviderProps): React.ReactElement {
    return React.createElement(SettingsStringsContext.Provider, { value: strings }, children);
}

export function useSettingsStrings(): SettingsStrings {
    return useContext(SettingsStringsContext);
}

// ─── Loader ────────────────────────────────────────────────────────────

export async function loadSettingsStrings(): Promise<SettingsStrings> {
    try {
        const tm = AppContext.getInstance().manager.getTemplateManager?.();
        if (!tm) return DEFAULT_SETTINGS_STRINGS;
        const parsed = await tm.loadJson<Partial<SettingsStrings> & { _doc?: string }>(
            ConfigTemplateId.Settings,
        );
        if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS_STRINGS;
        return mergeSettingsStrings(DEFAULT_SETTINGS_STRINGS, parsed);
    } catch {
        return DEFAULT_SETTINGS_STRINGS;
    }
}

function mergeSettingsStrings(
    defaults: SettingsStrings,
    overrides: Partial<SettingsStrings>,
): SettingsStrings {
    return {
        harness: mergeHarness(defaults.harness, overrides.harness ?? {}),
        externalTools: { ...defaults.externalTools, ...(overrides.externalTools ?? {}) },
    };
}

function mergeHarness(
    defaults: SettingsStrings['harness'],
    overrides: Partial<SettingsStrings['harness']>,
): SettingsStrings['harness'] {
    const merged = { ...defaults } as SettingsStrings['harness'];
    for (const key of Object.keys(overrides) as (keyof SettingsStrings['harness'])[]) {
        const o = overrides[key];
        if (o && typeof o === 'object') {
            (merged as Record<string, unknown>)[key] = { ...defaults[key], ...o };
        }
    }
    return merged;
}
