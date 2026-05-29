/**
 * Apply a Curator Recommendation to HarnessSettings.
 *
 * Capability → legacy ModelTier mapping (see spec §4.1, §7.1):
 *   quick   → localFastConfig
 *   deep    → localDeepConfig
 *   premium → onlineConfig
 *
 * We continue using the legacy field names internally so the existing
 * TierController / bindings.ts code keeps working. Renaming will happen in
 * a follow-up once the capability terminology is established.
 */

import { AppContext } from '@/app/context/AppContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { lookupModel, type Recommendation } from '@/service/agents/harness/curator';
import { DEFAULT_HARNESS_SETTINGS, type HarnessSettings } from '@/app/settings/types';
import type { RoleConfig } from '@/core/profiles/types';

export interface ApplyResult {
    success: boolean;
    skippedCapabilities: string[];
    appliedCapabilities: string[];
}

/**
 * Persist the recommendation into the active plugin settings. Bindings whose
 * provider has no configured profile are skipped (returned in `skippedCapabilities`)
 * so the user can be informed without aborting the whole apply.
 */
export async function applyRecommendation(rec: Recommendation): Promise<ApplyResult> {
    const ctx = AppContext.getInstance();
    const current = ctx.settings?.harnessSettings ?? { ...DEFAULT_HARNESS_SETTINGS };
    const registry = ProfileRegistry.getInstance();

    const skipped: string[] = [];
    const applied: string[] = [];

    const next: HarnessSettings = { ...current };

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
        if (cap === 'quick') next.localFastConfig = cfg;
        else if (cap === 'deep') next.localDeepConfig = cfg;
        else next.onlineConfig = cfg;
        applied.push(cap);
    }

    // Cascade flag: maps to allowEscalation. Curator says "off" only when all three
    // bindings are identical, which the user can edit later.
    next.allowEscalation = rec.cascadeEnabled;

    if (ctx.settings) {
        ctx.settings.harnessSettings = next;
        await ctx.plugin.saveSettings();
    }

    return { success: applied.length > 0, appliedCapabilities: applied, skippedCapabilities: skipped };
}
