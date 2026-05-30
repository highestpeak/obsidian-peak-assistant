/**
 * Overview tab (PR-E, live CapabilityRegistry consumption).
 *
 * PR-D used a hardcoded `getReadinessFromHarnessSettings(...)` stub.
 * PR-E swaps it for `useSurfaceReadiness()` which polls
 * `CapabilityRegistry.getInstance().getAll()` — surfaces self-report their
 * own capability statuses and self-supply repair actions.
 *
 * Row model:
 *   - One row per registered surface (chat / vault-search / ai-analysis /
 *     copilot / web-chat).
 *   - Surface-level chip = worst-of(capability statuses) so users see at
 *     a glance whether ANY part of that surface needs attention.
 *   - When the worst-status capability has a `repair` action, render it as
 *     a Pill CTA on the right. Multiple repair affordances per row are
 *     collapsed to the first; users drill into the corresponding tab for
 *     fine-grained fixes.
 *
 * Option A (chosen): surfaces that have not registered an adapter simply do
 * not appear. With master today this means Copilot is the only row; after
 * the chat-retained worktree merges, Chat joins it; vault-search /
 * ai-analysis / web-chat appear once their owning surfaces adopt the
 * adapter contract. The empty-state copy below clarifies this so users
 * don't mistake "no rows" for "something is broken".
 */

import React from 'react';
import {
    AlertTriangle,
    Bot,
    Check,
    Database,
    Globe,
    MessageSquare,
    Search,
    Sparkles,
} from 'lucide-react';
import { Row, Chip, Pill } from '@/ui/components/primitives';
import type { ChipVariant } from '@/ui/components/primitives/Chip';
import type {
    CapabilityStatus,
    ReadinessStatus,
    SurfaceId,
} from '@/service/capabilities';
import { useSurfaceReadiness, type SurfaceReadinessRow } from '../hooks/useSurfaceReadiness';
import { useSettingsStrings, type SettingsStrings } from '../settingsStrings';

const ICON_FOR_SURFACE: Record<SurfaceId, React.ElementType> = {
    chat: MessageSquare,
    'vault-search': Search,
    'ai-analysis': Sparkles,
    copilot: Bot,
    'web-chat': Globe,
};

/** Severity ordering — higher index wins when aggregating per surface. */
const STATUS_SEVERITY: Record<ReadinessStatus, number> = {
    ready: 0,
    optional: 1,
    'needs-attention': 2,
    'not-ready': 3,
};

export function OverviewTab() {
    const strings = useSettingsStrings();
    const overviewCopy = strings.overview.readiness;
    const rows = useSurfaceReadiness();

    return (
        <div className="pkset-panel">
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{overviewCopy.sectionTitle}</span>
                    <span className="pkset-section__sub">{overviewCopy.sectionSub}</span>
                </div>
                {rows.length === 0 ? (
                    <EmptyState message={overviewCopy.empty} />
                ) : (
                    <div className="pkset-row-list">
                        {rows.map((row) => (
                            <SurfaceRow
                                key={row.surfaceId}
                                row={row}
                                statusLabels={overviewCopy.statusLabels}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="pkset-empty">
            <span className="pkset-empty__text">{message}</span>
        </div>
    );
}

type StatusLabels = SettingsStrings['overview']['readiness']['statusLabels'];

function SurfaceRow({
    row,
    statusLabels,
}: {
    row: SurfaceReadinessRow;
    statusLabels: StatusLabels;
}) {
    const Icon = ICON_FOR_SURFACE[row.surfaceId] ?? Database;
    const aggregate = aggregateStatus(row.capabilities);
    const variant = statusToChipVariant(aggregate);
    const showChipIcon = aggregate === 'ready' || aggregate === 'needs-attention';

    // Surface-level description: list capability names so the user
    // understands what this surface needs to be ready.
    const desc = row.capabilities
        .map((c) => c.capability)
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .join(' · ');

    // Pick the most severe capability that has a repair action — that is
    // what the row-level CTA fixes when clicked. If nothing needs repair,
    // omit the CTA entirely.
    const repairTarget = pickRepairTarget(row.capabilities);

    // Meta line: when not fully ready, surface the first reason for
    // diagnostic transparency.
    const reason = row.capabilities.find(
        (c) => c.status !== 'ready' && c.status !== 'optional' && c.reason,
    )?.reason;

    return (
        <Row>
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{row.surfaceLabel}</Row.Title>
                <Row.Desc>{desc || row.surfaceLabel}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Chip variant={variant}>
                    {showChipIcon && aggregate === 'ready' && (
                        <Check size={11} style={{ marginRight: 4 }} />
                    )}
                    {showChipIcon && aggregate === 'needs-attention' && (
                        <AlertTriangle size={11} style={{ marginRight: 4 }} />
                    )}
                    {labelForStatus(aggregate, statusLabels)}
                </Chip>
                {reason && <Row.Meta>{reason}</Row.Meta>}
                {repairTarget?.repair && (
                    <Pill onClick={() => void repairTarget.repair!.action()}>
                        {repairTarget.repair.label}
                    </Pill>
                )}
            </Row.Right>
        </Row>
    );
}

/** Worst-of aggregation — surface chip reflects the most-broken capability. */
function aggregateStatus(capabilities: CapabilityStatus[]): ReadinessStatus {
    if (capabilities.length === 0) return 'optional';
    let worst: ReadinessStatus = 'ready';
    for (const cap of capabilities) {
        if (STATUS_SEVERITY[cap.status] > STATUS_SEVERITY[worst]) {
            worst = cap.status;
        }
    }
    return worst;
}

/** Highest-severity capability that exposes a repair action, or undefined
 * if every broken capability is repair-less (in which case we render the
 * chip but no CTA — adapters should always supply repair for not-ready). */
function pickRepairTarget(
    capabilities: CapabilityStatus[],
): CapabilityStatus | undefined {
    const candidates = capabilities
        .filter((c) => c.repair && c.status !== 'ready' && c.status !== 'optional')
        .sort((a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]);
    return candidates[0];
}

function statusToChipVariant(status: ReadinessStatus): ChipVariant {
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

function labelForStatus(status: ReadinessStatus, labels: StatusLabels): string {
    switch (status) {
        case 'ready':
            return labels.ready;
        case 'needs-attention':
            return labels.needsAttention;
        case 'not-ready':
            return labels.notReady;
        case 'optional':
            return labels.optional;
    }
}
