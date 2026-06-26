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
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

// ─── Shape ─────────────────────────────────────────────────────────────

export interface SettingsStrings {
    tabs: {
        overview: string;
        aiSetup: string;
        knowledgeIndex: string;
        tools: string;
        advanced: string;
    };
    overview: {
        readiness: {
            sectionTitle: string;
            sectionSub: string;
            /** Empty-state copy shown when no surface has registered an adapter. */
            empty: string;
            /** Status chip labels (PR-E — universal, no longer per-surface). */
            statusLabels: {
                ready: string;
                needsAttention: string;
                notReady: string;
                optional: string;
            };
            /** Per-surface legacy stub copy (PR-D). Retained so JSON overrides
             * still parse but unused by the PR-E OverviewTab. Safe to remove
             * once all surfaces have adapters and the stub file is deleted. */
            providers: { title: string; desc: string; ready: string; needsAttention: string; manage: string };
            aiBehavior: { title: string; desc: string; ready: string; needsAttention: string; manage: string };
            knowledgeIndex: { title: string; desc: string; ready: string; needsAttention: string; check: string };
            webAccess: { title: string; desc: string; optional: string; setup: string };
            safety: { title: string; desc: string; ready: string; review: string };
        };
        actions: {
            sectionTitle: string;
            runSetup: string;
            testProviders: string;
            checkIndex: string;
            tryChat: string;
        };
        /** Read-only summary of current AI behavior bindings shown on Overview. */
        aiBehaviorSummary: {
            sectionTitle: string;
            sectionSub: string;
            conversation: { title: string; desc: string };
            fastLookup: { title: string; desc: string; fallback: string };
            research: { title: string; desc: string };
            strongerModel: { title: string; desc: string; offChip: string };
        };
    };
    aiSetup: {
        recommendedSetup: {
            sectionTitle: string;
            sectionSub: string;
            balanced: { title: string; desc: string };
            lowestCost: { title: string; desc: string };
            researchQuality: { title: string; desc: string };
            localPrivate: { title: string; desc: string };
        };
        aiBehavior: {
            sectionTitle: string;
            conversation: { title: string; desc: string };
            fastLookup: { title: string; desc: string };
            research: { title: string; desc: string };
            strongerModel: { title: string; desc: string; offChip: string };
            knowledgeIndex: { title: string; desc: string };
            change: string;
            setup: string;
            fallsBack: string;
            usesConversationModel: string;
        };
        providers: {
            sectionTitle: string;
            sectionSub: string;
            connectedChip: string;
            test: string;
            edit: string;
            addProvider: string;
        };
        safety: {
            sectionTitle: string;
            sectionSub: string;
        };
    };
    knowledgeIndex: {
        readiness: {
            sectionTitle: string;
            sectionSub: string;
            store: { title: string; desc: string; ready: string };
            current: { title: string; desc: string };
            mode: { title: string; desc: string };
        };
        behavior: {
            sectionTitle: string;
            indexMode: { title: string; desc: string; fast: string; semantic: string; full: string };
            autoIndex: { title: string; desc: string };
            documentTypes: { title: string; desc: string };
            ignorePatterns: { title: string; desc: string; edit: string };
            rebuild: { title: string; desc: string; cta: string; running: string };
        };
        searchQuality: {
            sectionTitle: string;
            ppr: { title: string; desc: string };
        };
        chunking: {
            sectionTitle: string;
            maxChunkSize: { title: string; desc: string };
            chunkOverlap: { title: string; desc: string };
        };
        aiAnalysis: {
            sectionTitle: string;
            autoSave: { title: string; desc: string };
            saveFolder: { title: string; desc: string };
            recentLimit: { title: string; desc: string };
        };
    };
    tools: {
        externalTools: {
            sectionTitle: string;
            sectionSub: string;
        };
        webAccess: {
            sectionTitle: string;
            provider: { title: string; desc: string; optional: string; notConfigured: string; setup: string };
            usedBy: { title: string; desc: string; chips: { chat: string; research: string } };
        };
    };
    advanced: {
        intro: {
            sectionTitle: string;
            sectionSub: string;
        };
        reRun: {
            title: string;
            desc: string;
            cta: string;
        };
        diagnostics: {
            sectionTitle: string;
            sectionSub: string;
            runtimeRow: { title: string; desc: string };
            backendRow: { title: string; desc: string };
        };
        storage: {
            sectionTitle: string;
            dataFolder: { title: string; desc: string };
            chatRoot: { title: string; desc: string };
        };
        general: {
            sectionTitle: string;
            attachmentHandling: { title: string; desc: string };
            devTools: { title: string; desc: string; tag: string };
        };
    };
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
    tabs: {
        overview: 'Overview',
        aiSetup: 'AI Setup',
        knowledgeIndex: 'Knowledge Index',
        tools: 'Tools',
        advanced: 'Advanced',
    },
    overview: {
        readiness: {
            sectionTitle: 'Peak readiness',
            sectionSub: 'Check what is ready and what needs attention before using Peak.',
            empty:
                'No surfaces have reported readiness yet. Surfaces (Chat, Vault Search, Copilot, etc.) register themselves at startup — give it a moment, or check the console if this persists.',
            statusLabels: {
                ready: 'Ready',
                needsAttention: 'Needs attention',
                notReady: 'Not ready',
                optional: 'Optional',
            },
            providers: {
                title: 'Providers',
                desc: 'AI services and local runtimes Peak can talk to.',
                ready: 'Ready',
                needsAttention: 'Needs attention',
                manage: 'Manage',
            },
            aiBehavior: {
                title: 'AI behavior',
                desc: 'Conversation, Fast Lookup, and Research model bindings.',
                ready: 'Ready',
                needsAttention: 'Needs attention',
                manage: 'Fix',
            },
            knowledgeIndex: {
                title: 'Knowledge Index',
                desc: 'Vault search and semantic understanding.',
                ready: 'Ready',
                needsAttention: 'Needs attention',
                check: 'Check',
            },
            webAccess: {
                title: 'Web Access',
                desc: 'Current web information for chat and research.',
                optional: 'Optional',
                setup: 'Setup',
            },
            safety: {
                title: 'Safety',
                desc: 'How Peak handles risky writes and tool calls.',
                ready: 'Ready',
                review: 'Review',
            },
        },
        actions: {
            sectionTitle: 'Actions',
            runSetup: 'Run setup',
            testProviders: 'Test providers',
            checkIndex: 'Check index',
            tryChat: 'Try Chat',
        },
        aiBehaviorSummary: {
            sectionTitle: 'AI behavior',
            sectionSub: 'Read-only summary. Change bindings in AI Setup.',
            conversation: {
                title: 'Conversation',
                desc: 'Chat and daily writing.',
            },
            fastLookup: {
                title: 'Fast Lookup',
                desc: 'Short answers and simple note actions.',
                fallback: 'Falls back to Conversation',
            },
            research: {
                title: 'Research',
                desc: 'Vault synthesis, AI Analysis, and multi-step agent work.',
            },
            strongerModel: {
                title: 'Use stronger model when needed',
                desc: 'Let longer runs switch to a stronger model when confidence is low.',
                offChip: 'Off',
            },
        },
    },
    aiSetup: {
        recommendedSetup: {
            sectionTitle: 'Recommended setup',
            sectionSub:
                'Quick presets that adjust your AI bindings. You can still change individual roles below.',
            balanced: {
                title: 'Balanced',
                desc: 'Best of both quality and everyday cost.',
            },
            lowestCost: {
                title: 'Lowest cost',
                desc: 'Prefer cheaper or local models for everyday use.',
            },
            researchQuality: {
                title: 'Research quality',
                desc: 'Prefer deeper synthesis for vault work.',
            },
            localPrivate: {
                title: 'Local / private',
                desc: 'Keep routine work on your machine when possible.',
            },
        },
        aiBehavior: {
            sectionTitle: 'AI behavior',
            conversation: {
                title: 'Conversation',
                desc: 'Chat and daily writing.',
            },
            fastLookup: {
                title: 'Fast Lookup',
                desc: 'Single-step replies, ~1s (works well with small local models).',
            },
            research: {
                title: 'Research',
                desc: 'Multi-step reasoning and long documents.',
            },
            strongerModel: {
                title: 'Use stronger model when needed',
                desc: 'Cloud model used as the fallback when local tiers are not enough.',
                offChip: 'Off',
            },
            knowledgeIndex: {
                title: 'Knowledge Index',
                desc: 'Model used to power semantic vault search.',
            },
            change: 'Change',
            setup: 'Set up',
            fallsBack: 'Falls back to Conversation',
            usesConversationModel: 'Uses Conversation model',
        },
        providers: {
            sectionTitle: 'Providers',
            sectionSub: 'AI services and local runtimes connected to Peak.',
            connectedChip: 'Connected',
            test: 'Test',
            edit: 'Edit',
            addProvider: 'Add Provider',
        },
        safety: {
            sectionTitle: 'Safety',
            sectionSub: 'How Peak handles risky writes and tool calls.',
        },
    },
    knowledgeIndex: {
        readiness: {
            sectionTitle: 'Knowledge Index status',
            sectionSub: 'Current index state and repair actions.',
            store: {
                title: 'Vector store',
                desc: 'Local SQLite store used for semantic search.',
                ready: 'Ready',
            },
            current: {
                title: 'Indexed files',
                desc: 'Total documents currently in the search index.',
            },
            mode: {
                title: 'Index depth',
                desc: 'Controls which enrichment steps run during indexing.',
            },
        },
        behavior: {
            sectionTitle: 'Indexing',
            indexMode: {
                title: 'Index depth',
                desc: 'Controls which enrichment steps run during indexing.',
                fast: 'Fast',
                semantic: 'Semantic',
                full: 'Full',
            },
            autoIndex: {
                title: 'Auto-index on startup',
                desc: 'Run the fast index when Obsidian opens.',
            },
            documentTypes: {
                title: 'Document types',
                desc: 'File types included in the search index.',
            },
            ignorePatterns: {
                title: 'Ignore patterns',
                desc: 'Glob patterns to exclude (one per line).',
                edit: 'Edit',
            },
            rebuild: {
                title: 'Rebuild index',
                desc: 'Re-run the full pipeline at the current index level.',
                cta: 'Rebuild',
                running: 'Rebuilding…',
            },
        },
        searchQuality: {
            sectionTitle: 'Search quality',
            ppr: {
                title: 'Personalized PageRank',
                desc: 'Rerank results using per-query graph walks. Surfaces related notes that keyword and vector search miss.',
            },
        },
        chunking: {
            sectionTitle: 'Chunking',
            maxChunkSize: {
                title: 'Max chunk size',
                desc: 'Maximum characters per chunk (default 1000).',
            },
            chunkOverlap: {
                title: 'Chunk overlap',
                desc: 'Overlap characters between chunks (default 200).',
            },
        },
        aiAnalysis: {
            sectionTitle: 'AI Analysis',
            autoSave: {
                title: 'Auto-save results',
                desc: 'Save completed analysis to your vault.',
            },
            saveFolder: {
                title: 'Save folder',
                desc: 'Vault-relative path for saved analyses.',
            },
            recentLimit: {
                title: 'Recent history limit',
                desc: 'Items shown in the Recent AI Analysis list.',
            },
        },
    },
    tools: {
        externalTools: {
            sectionTitle: 'External tools',
            sectionSub: 'Connect external tool servers to extend agent capabilities.',
        },
        webAccess: {
            sectionTitle: 'Web Access',
            provider: {
                title: 'Web search provider',
                desc: 'Used by chat and research when current information is needed.',
                optional: 'Optional',
                notConfigured: 'Not configured',
                setup: 'Setup',
            },
            usedBy: {
                title: 'Used by',
                desc: 'Surfaces that read from Web Access when enabled.',
                chips: {
                    chat: 'Chat',
                    research: 'Research',
                },
            },
        },
    },
    advanced: {
        intro: {
            sectionTitle: 'Advanced',
            sectionSub: 'Low-level runtime, storage, and diagnostics. Most users do not need to change anything here.',
        },
        reRun: {
            title: 'Re-run setup wizard',
            desc: 'Let the setup assistant re-pick tier bindings from your current environment.',
            cta: 'Run',
        },
        diagnostics: {
            sectionTitle: 'Diagnostics',
            sectionSub: 'Read-only runtime state for debugging.',
            runtimeRow: {
                title: 'Agent runtime',
                desc: 'Which loop engine drives agents (Harness / Claude Agent SDK).',
            },
            backendRow: {
                title: 'Backend status',
                desc: 'Reports whether the active runtime is healthy.',
            },
        },
        storage: {
            sectionTitle: 'Storage',
            dataFolder: {
                title: 'Data storage folder',
                desc: 'Folder for storing plugin data files (e.g., search database). Leave empty to use plugin directory.',
            },
            chatRoot: {
                title: 'Chat root folder',
                desc: 'Root folder for AI conversation data (Prompts, Attachments, Hub-Summaries, etc. are derived automatically).',
            },
        },
        general: {
            sectionTitle: 'General',
            attachmentHandling: {
                title: 'Attachment handling',
                desc: 'How attachments are sent to the model. "Direct" requires model vision support; "Degrade to text" uses OCR/parsing for compatibility.',
            },
            devTools: {
                title: 'Enable DevTools Graph Inspector',
                desc: 'Exposes window.testGraphTools in browser DevTools console with convenience methods for graph testing.',
                tag: 'Developer',
            },
        },
    },
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
            'Connect external tool servers to extend agent capabilities with additional commands.',
        emptyHint: 'No external tools configured. Add one to get started.',
        addCta: 'Add external tool',
        defaultServerName: 'New external tool',
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
        const tm = TemplateManager.getInstance();
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

/**
 * Recursive deep-merge for the strings tree. Overrides win on leaf scalars,
 * and any missing branches fall back to defaults. Arrays are treated as
 * scalars (overridden whole).
 */
function deepMerge<T>(base: T, over: Partial<T> | undefined): T {
    if (over == null) return base;
    if (typeof base !== 'object' || base === null || Array.isArray(base)) {
        return (over as T) ?? base;
    }
    const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const key of Object.keys(over) as Array<keyof T>) {
        const oVal = (over as Record<string, unknown>)[key as string];
        const bVal = (base as Record<string, unknown>)[key as string];
        if (oVal == null) continue;
        if (typeof oVal === 'object' && !Array.isArray(oVal) && typeof bVal === 'object' && bVal !== null) {
            merged[key as string] = deepMerge(bVal, oVal as Record<string, unknown>);
        } else {
            merged[key as string] = oVal;
        }
    }
    return merged as T;
}

function mergeSettingsStrings(
    defaults: SettingsStrings,
    overrides: Partial<SettingsStrings>,
): SettingsStrings {
    return deepMerge(defaults, overrides);
}
