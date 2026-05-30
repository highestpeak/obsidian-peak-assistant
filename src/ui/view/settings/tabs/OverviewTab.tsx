/**
 * Overview tab (PR-D, hardcoded readiness rows).
 *
 * PR-E: replace `getReadinessFromHarnessSettings(...)` with
 * `CapabilityRegistry.getInstance().getAll()` consumption — the row shape
 * already mirrors what adapters will report.
 */

import React from 'react';
import {
    AlertTriangle,
    Check,
    Database,
    Globe,
    Plug,
    Shield,
    Sparkles,
} from 'lucide-react';
import { Row, Chip, Pill } from '@/ui/components/primitives';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import type { MyPluginSettings } from '@/app/settings/types';
import { useSettingsStrings } from '../settingsStrings';
import {
    getReadinessFromHarnessSettings,
    statusToChipVariant,
    statusLabel,
    type SurfaceReadinessRow,
} from './readinessStub';

interface OverviewTabProps {
    settings: MyPluginSettings;
    /** Settings root dispatches the action (open modal / switch tab / etc.). */
    onAction: (row: SurfaceReadinessRow) => void;
}

const ICON_FOR_ROW: Record<string, React.ElementType> = {
    providers: Plug,
    'ai-behavior': Sparkles,
    'knowledge-index': Database,
    'web-access': Globe,
    safety: Shield,
};

export function OverviewTab({ settings, onAction }: OverviewTabProps) {
    const strings = useSettingsStrings();
    const overviewCopy = strings.overview.readiness;

    const registry = ProfileRegistry.getInstance();
    const profiles = registry.getAllProfiles();
    const embeddingProfile = registry.getActiveEmbeddingProfile();

    const rows = getReadinessFromHarnessSettings({
        harness: settings.harnessSettings,
        profiles,
        embeddingProfile,
    });

    return (
        <div className="pkset-panel">
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{overviewCopy.sectionTitle}</span>
                    <span className="pkset-section__sub">{overviewCopy.sectionSub}</span>
                </div>
                <div className="pkset-row-list">
                    {rows.map((row) => (
                        <ReadinessRow key={row.id} row={row} onAction={onAction} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ReadinessRow({
    row,
    onAction,
}: {
    row: SurfaceReadinessRow;
    onAction: (row: SurfaceReadinessRow) => void;
}) {
    const Icon = ICON_FOR_ROW[row.id] ?? Sparkles;
    const variant = statusToChipVariant(row.status);
    const showChipIcon = row.status === 'ready' || row.status === 'needs-attention';

    return (
        <Row>
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{row.title}</Row.Title>
                <Row.Desc>{row.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Chip variant={variant}>
                    {showChipIcon && row.status === 'ready' && (
                        <Check size={11} style={{ marginRight: 4 }} />
                    )}
                    {showChipIcon && row.status === 'needs-attention' && (
                        <AlertTriangle size={11} style={{ marginRight: 4 }} />
                    )}
                    {statusLabel(row.status)}
                </Chip>
                {row.meta && <Row.Meta>{row.meta}</Row.Meta>}
                <Pill onClick={() => onAction(row)}>{row.actionLabel}</Pill>
            </Row.Right>
        </Row>
    );
}
