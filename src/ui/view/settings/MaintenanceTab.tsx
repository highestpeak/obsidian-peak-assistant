/**
 * Maintenance — restructured for PR-5 (2026-06-07) to match mock IA at
 * docs/gstack/settings-redesign-2026-05-29/index.html#advanced.
 *
 * 3 groups rendered as horizontal action-strips:
 *   - Index            (7 actions)
 *   - Knowledge graph  (3 actions)
 *   - Verification & cleanup (2 actions)
 *
 * Plus a collapsed Danger zone `<details>` for irreversible operations.
 * `Compare PPR search` moved to Knowledge Index → Advanced rebuild disclosure
 * (PR-3); not here.
 *
 * T11P (Track B): Each row pulls its run callback from
 * `settingsActions.maintenance.{index,graph,verification,danger}` so the UI
 * keeps the labels / icons / layout, and the app provides the named
 * operations.
 */

import React, { useState } from 'react';
import {
    Activity,
    Bot,
    Brain,
    ChevronDown,
    Database,
    FileSearch,
    Layers,
    RefreshCw,
    ShieldAlert,
    Sparkles,
    Trash2,
    Wrench,
    Zap,
} from 'lucide-react';
import { Row, Button } from '@/ui/components/primitives';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type { SettingsActions } from '@/service/settings/SettingsActionsPort';

interface MaintenanceAction {
    id: string;
    label: string;
    icon: React.ElementType;
    run: () => void | Promise<void>;
}

interface DangerAction extends MaintenanceAction {
    description: string;
}

function buildIndexGroup(actions: SettingsActions): MaintenanceAction[] {
    const { maintenance } = actions;
    return [
        { id: 'update-index', label: 'Update index', icon: Database, run: maintenance.index.updateIndex },
        { id: 'full-pipeline', label: 'Full pipeline', icon: RefreshCw, run: maintenance.index.runFullPipeline },
        { id: 'cancel-indexing', label: 'Cancel indexing', icon: ShieldAlert, run: maintenance.index.cancelIndexing },
        { id: 'related-refresh', label: 'Refresh related notes', icon: Zap, run: maintenance.index.refreshRelatedNotes },
        { id: 'hub-refresh', label: 'Refresh hub summaries', icon: FileSearch, run: maintenance.index.refreshHubSummaries },
        { id: 'gap-recompute', label: 'Recompute gap analysis', icon: Layers, run: maintenance.index.recomputeGapAnalysis },
        { id: 'vault-intuition', label: 'Analyze vault intuition', icon: Brain, run: maintenance.index.analyzeVaultIntuition },
    ];
}

function buildKnowledgeGraphGroup(actions: SettingsActions): MaintenanceAction[] {
    const { maintenance } = actions;
    return [
        { id: 'vector-pending', label: 'Build pending vectors', icon: Database, run: maintenance.graph.runVectorEnrichmentPending },
        { id: 'llm-pending', label: 'Run pending LLM enrichment', icon: Sparkles, run: maintenance.graph.runLlmEnrichmentPending },
        { id: 'global-maintenance', label: 'Global maintenance', icon: RefreshCw, run: maintenance.graph.runGlobalMaintenance },
    ];
}

function buildVerificationGroup(actions: SettingsActions): MaintenanceAction[] {
    const { maintenance } = actions;
    return [
        { id: 'db-health', label: 'Verify database', icon: Activity, run: maintenance.verification.verifyDatabaseHealth },
        { id: 'cleanup', label: 'Cleanup useless data', icon: Wrench, run: maintenance.verification.cleanupUselessData },
        { id: 'build-profile', label: 'Build user profile', icon: Bot, run: maintenance.verification.buildUserProfile },
    ];
}

function buildDangerActions(actions: SettingsActions): DangerAction[] {
    const { maintenance } = actions;
    return [
        {
            id: 'clear-profile',
            label: 'Clear profile build record',
            description: 'Force the next profile build to rescan files.',
            icon: ShieldAlert,
            run: maintenance.danger.clearUserProfileBuildRecord,
        },
        {
            id: 'delete-index',
            label: 'Delete index data',
            description: 'Delete all indexed documents after confirmation.',
            icon: Trash2,
            run: maintenance.danger.deleteIndexData,
        },
    ];
}

export function MaintenanceTab() {
    const { settingsActions } = useServiceContext();
    const indexGroup = buildIndexGroup(settingsActions);
    const graphGroup = buildKnowledgeGraphGroup(settingsActions);
    const verificationGroup = buildVerificationGroup(settingsActions);
    const dangerActions = buildDangerActions(settingsActions);

    return (
        <div className="pktw-flex pktw-flex-col pktw-gap-5">
            <MaintenanceGroup title="Index" actions={indexGroup} />
            <MaintenanceGroup title="Knowledge graph" actions={graphGroup} />
            <MaintenanceGroup title="Verification & cleanup" actions={verificationGroup} />
            <DangerZone actions={dangerActions} />
        </div>
    );
}

function MaintenanceGroup({
    title,
    actions,
}: {
    title: string;
    actions: MaintenanceAction[];
}) {
    return (
        <div>
            <span
                className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint"
                style={{ display: 'block', marginBottom: 8 }}
            >
                {title}
            </span>
            <div className="pkset-action-strip">
                {actions.map((action) => (
                    <ActionButton key={action.id} action={action} />
                ))}
            </div>
        </div>
    );
}

function ActionButton({ action }: { action: MaintenanceAction }) {
    const [running, setRunning] = useState(false);
    const Icon = action.icon;

    const handleRun = async () => {
        if (running) return;
        setRunning(true);
        try {
            await action.run();
        } finally {
            setRunning(false);
        }
    };

    return (
        <Button variant="outline" size="sm" onClick={handleRun} disabled={running}>
            <Icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
            {running ? 'Running…' : action.label}
        </Button>
    );
}

function DangerZone({ actions }: { actions: DangerAction[] }) {
    return (
        <details>
            <summary>
                <Row disclosure>
                    <Row.Icon>
                        <ShieldAlert size={16} style={{ color: 'var(--pk-error-text)' }} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Danger zone</Row.Title>
                        <Row.Desc>Irreversible operations. Peak asks for confirmation.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Row.Meta>{actions.length} actions</Row.Meta>
                        <ChevronDown size={14} style={{ color: 'var(--pk-text-tertiary)' }} />
                    </Row.Right>
                </Row>
            </summary>
            <div className="pk-disclosure-body">
                <div className="pkset-row-list">
                    {actions.map((action) => (
                        <DangerRow key={action.id} action={action} />
                    ))}
                </div>
            </div>
        </details>
    );
}

function DangerRow({ action }: { action: DangerAction }) {
    const [running, setRunning] = useState(false);
    const Icon = action.icon;
    const handleRun = async () => {
        if (running) return;
        setRunning(true);
        try {
            await action.run();
        } finally {
            setRunning(false);
        }
    };
    return (
        <Row>
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{action.label}</Row.Title>
                <Row.Desc>{action.description}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRun}
                    disabled={running}
                >
                    <Icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                    {running ? 'Running…' : 'Run'}
                </Button>
            </Row.Right>
        </Row>
    );
}
