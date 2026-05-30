/**
 * Readiness stub for the Overview tab (PR-D).
 *
 * PR-E will replace `getReadinessFromHarnessSettings(...)` with
 * `CapabilityRegistry.getInstance().getAll()` returning the same
 * `SurfaceReadinessRow[]` shape — until then this hardcodes the 5 surface
 * rows per the spec table.
 *
 * Spec mapping (from
 * docs/superpowers/specs/2026-05-29-settings-interface-design.md):
 *
 * | Surface          | Capability label           | Status source            |
 * |------------------|----------------------------|--------------------------|
 * | Providers        | Connected services         | profiles count           |
 * | AI behavior      | Conversation + tiers       | harnessSettings bindings |
 * | Knowledge Index  | Index + Research           | embedding profile        |
 * | Web Access       | Web Access (optional)      | (not wired — placeholder)|
 * | Safety           | Permission mode            | defaultPermissionMode    |
 *
 * Each row carries a readiness chip variant + a repair CTA where the chip is
 * not "ready".
 */

import type { HarnessSettings } from '@/app/settings/types';
import type { Profile } from '@/core/profiles/types';

export type ReadinessStatus = 'ready' | 'needs-attention' | 'not-ready' | 'optional';

export interface SurfaceReadinessRow {
    /** Stable id for keying. */
    id: string;
    /** Capability surface label (vocab-contract safe). */
    title: string;
    /** One-sentence description. */
    desc: string;
    /** Readiness state — drives Chip variant + repair-CTA visibility. */
    status: ReadinessStatus;
    /** Right-side meta text (e.g. "3 connected", "96% indexed"). */
    meta?: string;
    /** Label for the repair / manage button. */
    actionLabel: string;
    /** Action id — settings root maps this to a modal/handler. */
    actionKind:
        | 'manage-providers'
        | 'fix-ai-behavior'
        | 'check-index'
        | 'setup-web-access'
        | 'review-safety';
}

interface ReadinessInputs {
    harness: HarnessSettings | undefined;
    profiles: Profile[];
    embeddingProfile: Profile | null;
}

/**
 * Compute the Overview-tab readiness rows from current settings.
 *
 * TODO PR-E: replace with `CapabilityRegistry.getInstance().getAll()` once
 * chat / search / copilot / web-access surfaces all register a
 * `SurfaceCapabilityAdapter`. The shape returned here intentionally mirrors
 * what those adapters will report so the Overview UI doesn't need to change.
 */
export function getReadinessFromHarnessSettings(
    inputs: ReadinessInputs,
): SurfaceReadinessRow[] {
    const { harness, profiles, embeddingProfile } = inputs;

    const enabledProfiles = profiles.filter((p) => p.enabled);
    const providersStatus: ReadinessStatus =
        enabledProfiles.length > 0 ? 'ready' : 'not-ready';

    // AI behavior: ready if any tier is bound; otherwise needs-attention.
    const anyTierBound = !!(
        harness?.localFastConfig ||
        harness?.localDeepConfig ||
        harness?.onlineConfig
    );
    const allTiersBound = !!(
        harness?.localFastConfig &&
        harness?.localDeepConfig &&
        harness?.onlineConfig
    );
    const aiBehaviorStatus: ReadinessStatus = !anyTierBound
        ? 'not-ready'
        : allTiersBound
            ? 'ready'
            : 'needs-attention';
    const aiBehaviorMeta = !anyTierBound
        ? 'No tiers configured'
        : allTiersBound
            ? 'All tiers configured'
            : 'Some tiers fall back to Conversation';

    const indexStatus: ReadinessStatus = embeddingProfile ? 'ready' : 'not-ready';
    const indexMeta = embeddingProfile ? 'Embedding ready' : 'Embedding not configured';

    const webAccessStatus: ReadinessStatus = 'optional';

    const safetyStatus: ReadinessStatus = 'ready';
    const safetyMeta = (() => {
        switch (harness?.defaultPermissionMode) {
            case 'read':
                return 'Read only';
            case 'acceptEdits':
                return 'Auto-approve writes';
            case 'bypassPermissions':
                return 'Bypass safety';
            default:
                return 'Default';
        }
    })();

    return [
        {
            id: 'providers',
            title: 'Providers',
            desc: 'AI services and local runtimes Peak can talk to.',
            status: providersStatus,
            meta: `${enabledProfiles.length} connected`,
            actionLabel: providersStatus === 'ready' ? 'Manage' : 'Setup',
            actionKind: 'manage-providers',
        },
        {
            id: 'ai-behavior',
            title: 'AI behavior',
            desc: 'Conversation, Fast Lookup, and Research model bindings.',
            status: aiBehaviorStatus,
            meta: aiBehaviorMeta,
            actionLabel: aiBehaviorStatus === 'ready' ? 'Manage' : 'Fix',
            actionKind: 'fix-ai-behavior',
        },
        {
            id: 'knowledge-index',
            title: 'Knowledge Index',
            desc: 'Vault search and semantic understanding.',
            status: indexStatus,
            meta: indexMeta,
            actionLabel: indexStatus === 'ready' ? 'Check' : 'Setup',
            actionKind: 'check-index',
        },
        {
            id: 'web-access',
            title: 'Web Access',
            desc: 'Current web information for chat and research.',
            status: webAccessStatus,
            meta: 'Not configured',
            actionLabel: 'Setup',
            actionKind: 'setup-web-access',
        },
        {
            id: 'safety',
            title: 'Safety',
            desc: 'How Peak handles risky writes and tool calls.',
            status: safetyStatus,
            meta: safetyMeta,
            actionLabel: 'Review',
            actionKind: 'review-safety',
        },
    ];
}

/** Map readiness status to the Chip primitive variant. */
export function statusToChipVariant(
    status: ReadinessStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
        case 'ready':
            return 'success';
        case 'needs-attention':
            return 'warning';
        case 'not-ready':
            return 'danger';
        case 'optional':
            return 'neutral';
    }
}

/** Localized label per readiness state. */
export function statusLabel(status: ReadinessStatus): string {
    switch (status) {
        case 'ready':
            return 'Ready';
        case 'needs-attention':
            return 'Needs attention';
        case 'not-ready':
            return 'Not ready';
        case 'optional':
            return 'Optional';
    }
}
