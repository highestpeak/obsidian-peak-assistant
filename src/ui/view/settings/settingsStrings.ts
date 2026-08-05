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
import settingsDefaults from '../../../../templates/config/settings.json';

// ─── Shape ─────────────────────────────────────────────────────────────

export interface SettingsStrings {
    tabs: {
        overview: string;
        aiSetup: string;
        knowledgeIndex: string;
        tools: string;
        mediaGeneration: string;
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
            /** Heading shown at the top of every row's "who uses this" hover card. */
            usedByLabel: string;
            conversation: { title: string; desc: string; usedBy: string };
            fastLookup: { title: string; desc: string; usedBy: string };
            research: { title: string; desc: string; usedBy: string };
            strongerModel: { title: string; desc: string; offChip: string; usedBy: string };
            knowledgeIndex: { title: string; desc: string; usedBy: string };
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
        pluginCommands: {
            sectionTitle: string;
            sectionSub: string;
			viewTitle: string;
			viewSub: string;
			scopeNote: string;
			openManager: string;
			lastScanned: string;
			neverScanned: string;
            runtimeUnavailable: string;
            empty: string;
			noMatches: string;
            scanCommands: string;
            scanning: string;
            scanFallback: string;
            scanNote: string;
            scanPhases: {
                discovering: string;
                checking: string;
                explaining: string;
                complete: string;
            };
            scanMeta: {
                plugins: string;
                commands: string;
				explanations: string;
				waiting: string;
                accessUnchanged: string;
            };
            filters: {
                searchPlaceholder: string;
                pluginLabel: string;
                allPlugins: string;
                riskLabel: string;
                allRisks: string;
                accessLabel: string;
                allAccess: string;
                clear: string;
            };
            summary: {
                approved: string;
                notAllowed: string;
                systemExcluded: string;
            };
            batch: {
                commandsShown: string;
                eligibleForAllow: string;
                currentFilterScope: string;
                allowFiltered: string;
                allowCurrentFilter: string;
                allowCurrentFilterHint: string;
                allowAll: string;
                allowAllHint: string;
                shown: string;
                eligible: string;
                confirmTitle: string;
                confirmFiltered: string;
                confirmAll: string;
                excluded: string;
				bulkPaused: string;
                more: string;
                cancel: string;
                confirm: string;
            };
            columns: { command: string; risk: string; access: string };
            badges: {
				aiAnalyzed: string;
				metadataOnly: string;
				requiresEditor: string;
				reviewAgain: string;
			};
            access: {
                allowed: string;
                notAllowed: string;
                unavailable: string;
				reviewNeeded: string;
                toggleLabel: string;
            };
			attention: Record<
				import('@/ui/view/command-gateway/pluginCommandGatewayReviewModel').PluginCommandAttentionKind,
				{ label: string; description: string }
			>;
            warnings: {
                sourceChanged: string;
                unavailable: string;
				editorRequired: string;
                modal: string;
                destructive: string;
                unknown: string;
            };
			details: {
				title: string;
				selectPrompt: string;
				explanation: string;
				commandId: string;
				context: string;
				metadataFallback: string;
			};
            activity: {
                title: string;
                completed: string;
                failed: string;
                noObservableChange: string;
            };
            noFinding: string;
            risks: Record<import('@/core/types/plugin-command-gateway').PluginCommandRisk, string>;
			riskDescriptions: Record<import('@/core/types/plugin-command-gateway').PluginCommandRisk, string>;
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
        appearance: {
            sectionTitle: string;
            sectionSub: string;
            codeTheme: {
                title: string;
                desc: string;
                options: {
                    githubDark: string;
                    oneDarkPro: string;
                    nord: string;
                    dracula: string;
                    vitesseDark: string;
                };
            };
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
    /** Task E1 (2026-07-21) — Media Generation tab. Every user-facing string
     *  goes through here; validation problem `detail` fields come from the
     *  service layer verbatim (they carry per-instance context — endpoint
     *  ids, kind labels — that a static template cannot spell out). */
    mediaGeneration: {
        tabIntro: {
            sectionTitle: string;
            sectionSub: string;
        };
        route: {
            sectionTitle: string;
            sectionSub: string;
            optionAuto: string;
            optionNative: string;
            optionFal: string;
            optionAutoDesc: string;
            optionNativeDesc: string;
            optionFalDesc: string;
        };
        fal: {
            sectionTitle: string;
            sectionSub: string;
            keyLabel: string;
            keyDesc: string;
            keyPlaceholder: string;
            attachmentFolderLabel: string;
            attachmentFolderDesc: string;
            attachmentFolderPlaceholder: string;
            attachmentFolderDefaultHint: string;
        };
        presets: {
            sectionTitle: string;
            sectionSub: string;
            kindImage: string;
            kindVideo: string;
            kindMusic: string;
            kindTts: string;
            defaultPresetLabel: string;
            modelLabel: string;
            aspectRatioLabel: string;
            quantityLabel: string;
            durationLabel: string;
            durationUnit: string;
            maxDurationLabel: string;
            voiceLabel: string;
            resetLabel: string;
            emptyOverridesHint: string;
            musicLicensingTitle: string;
            musicLicensingBody: string;
            musicLicensingLinkLabel: string;
            musicLicensingUrl: string;
            musicLicensingPolicyVersion: string;
            musicLicensingConfirmCheckboxLabel: string;
            musicLicensingConfirmHint: string;
        };
        native: {
            sectionTitle: string;
            sectionSub: string;
            noProfilesHint: string;
            gotoProfilesLabel: string;
            profileLabel: string;
            profileAutoOption: string;
            profileDisabledSuffix: string;
            profileNoKeySuffix: string;
            supportedKindsLabel: string;
            supportedKindNone: string;
        };
        status: {
            sectionTitle: string;
            sectionSub: string;
            routeColumnLabel: string;
            kindColumnLabel: string;
            statusColumnLabel: string;
            reasonColumnLabel: string;
            statusReady: string;
            statusNotReady: string;
            statusUnsupported: string;
            validateButton: string;
            validateRunning: string;
            validateNeverHint: string;
            validateLastAtLabel: string;
            validateOkLabel: string;
            validateProblemsLabel: string;
            validateDisclaimer: string;
        };
    };
}

// ─── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS_STRINGS: SettingsStrings = settingsDefaults as unknown as SettingsStrings;

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
