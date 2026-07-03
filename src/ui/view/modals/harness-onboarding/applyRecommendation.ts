/**
 * Apply a Curator Recommendation to the plugin settings.
 *
 * Beyond the tier-slot bindings (quick/deep/premium → localFast/localDeep/onlineConfig),
 * Apply Recommended also materializes the plugin's default mental model so
 * onboarding is a one-click flow instead of forcing users into Advanced tab:
 *
 *   1. Folder defaults — root + derived folders under `ChatFolder/`. Persisted
 *      legacy values (`_skills`, `_prompts`, `_inbox`, `A-control/PeakAssistant/DataStore`)
 *      normalize to the new defaults; explicit non-legacy Advanced overrides are kept.
 *   2. Budget defaults — `harnessSettings.budget` is guaranteed to have all fields
 *      populated. Non-default user values (any non-zero monthlyUsd, custom reset
 *      day, or edited alertRules) are never overwritten.
 *   3. Active profile binding — sync ProfileRegistry's active Agent / Agent-Fast
 *      / Chat / Copilot bindings from the recommendation so /chat and /agent
 *      pick a working model out of the box.
 *
 * Capability → legacy ModelTier mapping (see spec §4.1, §7.1):
 *   quick   → localFastConfig
 *   deep    → localDeepConfig
 *   premium → onlineConfig
 *
 * Legacy tier field names are retained internally so the existing TierController /
 * bindings.ts code keeps working. Renaming will follow once capability terminology
 * is established.
 */

import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { lookupModel, type Recommendation } from '@/service/agents/harness/curator';
import {
	DEFAULT_BUDGET_SETTINGS,
	DEFAULT_HARNESS_SETTINGS,
	type BudgetSettings,
	type HarnessSettings,
	type MyPluginSettings,
} from '@/core/config/settingsTypes';
import type { RoleConfig } from '@/core/profiles/types';
import {
	DEFAULT_AI_ROOT_FOLDER,
	LEGACY_FOLDER_DEFAULTS,
	getAIAnalysisFolder,
	getAICustomPromptsFolder,
	getAIDataStoreFolder,
	getAIInboxFolder,
	getAISkillsFolder,
	resolveFolderSetting,
} from '@/core/config/folderPaths';

export interface ApplyResult {
    success: boolean;
    skippedCapabilities: string[];
    appliedCapabilities: string[];
}

/**
 * Persist the recommendation into the active plugin settings. Bindings whose
 * provider has no configured profile are skipped (returned in `skippedCapabilities`)
 * so the user can be informed without aborting the whole apply.
 *
 * The caller threads `settings` + `saveSettings` from `useServiceContext()`
 * (T11O Track 6) so this helper does not reach `AppContext.getInstance()`.
 */
export async function applyRecommendation(
    rec: Recommendation,
    settings: MyPluginSettings | undefined,
    saveSettings: () => Promise<void>,
): Promise<ApplyResult> {
    const current = settings?.harnessSettings ?? { ...DEFAULT_HARNESS_SETTINGS };
    const registry = ProfileRegistry.getInstance();

    const skipped: string[] = [];
    const applied: string[] = [];

    const next: HarnessSettings = { ...current };
    let deepConfig: RoleConfig | null = null;
    let quickConfig: RoleConfig | null = null;

    for (const cap of ['quick', 'deep', 'premium'] as const) {
        const modelId = rec.bindings[cap];
        const entry = lookupModel(modelId);
        if (!entry) {
            skipped.push(cap);
            continue;
        }
        const profile = registry.getAllProfiles().find((p) => p.kind === entry.kind);
        if (!profile) {
            skipped.push(cap);
            continue;
        }
        const cfg: RoleConfig = { profileId: profile.id, modelId: entry.apiModelId };
        if (cap === 'quick') { next.localFastConfig = cfg; quickConfig = cfg; }
        else if (cap === 'deep') { next.localDeepConfig = cfg; deepConfig = cfg; }
        else next.onlineConfig = cfg;
        applied.push(cap);
    }

    // Cascade flag: maps to allowEscalation. Curator says "off" only when all three
    // bindings are identical, which the user can edit later.
    next.allowEscalation = rec.cascadeEnabled;
    next.budget = ensureBudgetDefaults(next.budget);

    if (settings) {
        settings.harnessSettings = next;
        applyFolderDefaults(settings);
        applyProfileActiveBindings(registry, { deep: deepConfig, quick: quickConfig });
        await saveSettings();
    }

    return { success: applied.length > 0, appliedCapabilities: applied, skippedCapabilities: skipped };
}

/**
 * Guarantee every field of BudgetSettings is populated. Non-default user
 * values are never overwritten; only missing pieces fall back to defaults.
 * Pure — exported for direct testing.
 */
export function ensureBudgetDefaults(raw: Partial<BudgetSettings> | undefined): BudgetSettings {
    const def = DEFAULT_BUDGET_SETTINGS;
    if (!raw) return { ...def, alertRules: def.alertRules.map((r) => ({ ...r })) };
    return {
        monthlyUsd: typeof raw.monthlyUsd === 'number' && Number.isFinite(raw.monthlyUsd) ? raw.monthlyUsd : def.monthlyUsd,
        resetDayOfMonth: typeof raw.resetDayOfMonth === 'number' && raw.resetDayOfMonth >= 1 && raw.resetDayOfMonth <= 28
            ? Math.floor(raw.resetDayOfMonth)
            : def.resetDayOfMonth,
        alertRules: Array.isArray(raw.alertRules) && raw.alertRules.length > 0
            ? raw.alertRules.map((r) => ({ ...r }))
            : def.alertRules.map((r) => ({ ...r })),
    };
}

/**
 * Materialize the ChatFolder mental model into `settings`. Legacy persisted
 * folder values normalize to the current default; explicit non-legacy Advanced
 * overrides are preserved. Pure mutation of the settings object — exported for
 * direct testing.
 */
export function applyFolderDefaults(settings: MyPluginSettings): void {
    const root = typeof settings.ai?.rootFolder === 'string' && settings.ai.rootFolder.trim().length > 0
        ? settings.ai.rootFolder
        : DEFAULT_AI_ROOT_FOLDER;
    if (settings.ai) settings.ai.rootFolder = root;

    settings.dataStorageFolder = resolveFolderSetting(
        settings.dataStorageFolder,
        getAIDataStoreFolder(root),
        LEGACY_FOLDER_DEFAULTS.dataStorageFolder,
    );
    settings.skillsFolder = resolveFolderSetting(
        settings.skillsFolder,
        getAISkillsFolder(root),
        LEGACY_FOLDER_DEFAULTS.skillsFolder,
    );
    settings.inboxFolder = resolveFolderSetting(
        settings.inboxFolder,
        getAIInboxFolder(root),
        LEGACY_FOLDER_DEFAULTS.inboxFolder,
    );
    settings.customPromptsFolder = resolveFolderSetting(
        settings.customPromptsFolder,
        getAICustomPromptsFolder(root),
        LEGACY_FOLDER_DEFAULTS.customPromptsFolder,
    );
    if (settings.search) {
        settings.search.aiAnalysisAutoSaveFolder = settings.search.aiAnalysisAutoSaveFolder
            && settings.search.aiAnalysisAutoSaveFolder.trim().length > 0
            ? settings.search.aiAnalysisAutoSaveFolder
            : getAIAnalysisFolder(root);
    }
}

/**
 * Wire ProfileRegistry's active Agent / Agent-Fast / Chat / Copilot bindings
 * from the recommendation so downstream services pick a working model out of
 * the box. Existing non-null bindings are respected (never clobbered) — this
 * only fills in slots the user hasn't already set.
 */
function applyProfileActiveBindings(
    registry: ProfileRegistry,
    tiers: { deep: RoleConfig | null; quick: RoleConfig | null },
): void {
    if (tiers.deep) {
        if (!registry.getActiveAgentConfig()) registry.setActiveAgentConfig(tiers.deep);
        if (!registry.getActiveChatConfig()) registry.setActiveChatConfig(tiers.deep);
        if (!registry.getActiveCopilotConfig()) registry.setActiveCopilotConfig(tiers.deep);
    }
    if (tiers.quick && !registry.getActiveAgentFastConfig()) {
        registry.setActiveAgentFastConfig(tiers.quick);
    }
}
