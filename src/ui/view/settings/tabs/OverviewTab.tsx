/**
 * Overview tab — 5-row Peak readiness + AI behavior summary + Actions strip.
 * Row CTAs jump to the right tab via `onSwitchTab`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Check, ChevronRight, Database, Globe,
    MessageSquare, Microscope, Plug, Shield, Sparkles, TrendingUp,
    Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import { Row, Chip, Pill, Button } from '@/ui/components/primitives';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { MyPluginSettings, HarnessSettings } from '@/core/config/settingsTypes';
import { useSettingsStrings } from '../settingsStrings';
import { SettingsRow, SettingsSection } from '../components/SettingsRow';
import type { TabId } from '../types';

interface OverviewTabProps {
    settings: MyPluginSettings;
    onSwitchTab: (tab: TabId) => void;
}

type Status = 'ready' | 'needs-attention' | 'optional';
type ReadinessCopy = ReturnType<typeof useSettingsStrings>['overview']['readiness'];

function statusChip(status: Status, labels: ReadinessCopy): React.ReactNode {
    if (status === 'optional') return <Chip variant="neutral">{labels.statusLabels.optional}</Chip>;
    if (status === 'ready') return (
        <Chip variant="success">
            <Check size={11} className="pktw-mr-1" />
            {labels.statusLabels.ready}
        </Chip>
    );
    return (
        <Chip variant="warning">
            <AlertTriangle size={11} className="pktw-mr-1" />
            {labels.statusLabels.needsAttention}
        </Chip>
    );
}

export function OverviewTab({ settings, onSwitchTab }: OverviewTabProps) {
    const strings = useSettingsStrings();
    const readinessCopy = strings.overview.readiness;
    const summaryCopy = strings.overview.aiBehaviorSummary;
    const actionsCopy = strings.overview.actions;
    const { settingsActions } = useServiceContext();

    const indexCoverage = useIndexCoverage();
    const providers = useProvidersReadiness();
    const aiBehavior = useAIBehaviorReadiness(settings.harnessSettings);
    const safety = settings.harnessSettings?.defaultPermissionMode ?? 'acceptEdits';

    const indexStatus: Status = indexCoverage.kind === 'empty'
        ? 'optional'
        : (indexCoverage.kind === 'ready' && indexCoverage.pct >= 80 ? 'ready' : 'needs-attention');

    const readinessRows: Array<{ icon: LucideIcon; title: string; desc: string; status: Status; meta: string; pill: string; onPill: () => void }> = [
        {
            icon: Plug, title: readinessCopy.providers.title, desc: readinessCopy.providers.desc,
            status: providers.ready ? 'ready' : 'needs-attention',
            meta: providers.count === 1 ? '1 connected' : `${providers.count} connected`,
			pill: readinessCopy.providers.manage, onPill: () => onSwitchTab('aiModels'),
        },
        {
            icon: Sparkles, title: readinessCopy.aiBehavior.title, desc: readinessCopy.aiBehavior.desc,
            status: aiBehavior.status, meta: aiBehavior.reason,
			pill: readinessCopy.aiBehavior.manage, onPill: () => onSwitchTab('aiModels'),
        },
        {
            icon: Database, title: readinessCopy.knowledgeIndex.title, desc: readinessCopy.knowledgeIndex.desc,
            status: indexStatus, meta: formatCoverage(indexCoverage),
			pill: readinessCopy.knowledgeIndex.check, onPill: () => onSwitchTab('knowledgeSearch'),
        },
        {
            icon: Globe, title: readinessCopy.webAccess.title, desc: readinessCopy.webAccess.desc,
            status: 'optional', meta: 'Not configured',
			pill: readinessCopy.webAccess.setup, onPill: () => onSwitchTab('agents'),
        },
        {
            icon: Shield, title: readinessCopy.safety.title, desc: readinessCopy.safety.desc,
            status: 'ready', meta: SAFETY_LABEL[safety],
			pill: readinessCopy.safety.review, onPill: () => onSwitchTab('agents'),
        },
    ];

    const summaryRows: Array<{ icon: LucideIcon; title: string; desc: string; value: string | null; muted?: boolean }> = [
        { icon: MessageSquare, title: summaryCopy.conversation.title, desc: summaryCopy.conversation.desc, value: formatBinding(settings.harnessSettings?.localFastConfig ?? null) },
        { icon: Zap, title: summaryCopy.fastLookup.title, desc: summaryCopy.fastLookup.desc, value: formatBinding(settings.harnessSettings?.localFastConfig ?? null) ?? summaryCopy.fastLookup.fallback, muted: !settings.harnessSettings?.localFastConfig },
        { icon: Microscope, title: summaryCopy.research.title, desc: summaryCopy.research.desc, value: formatBinding(settings.harnessSettings?.localDeepConfig ?? null) },
        { icon: TrendingUp, title: summaryCopy.strongerModel.title, desc: summaryCopy.strongerModel.desc, value: formatBinding(settings.harnessSettings?.onlineConfig ?? null) ?? summaryCopy.strongerModel.offChip, muted: !settings.harnessSettings?.onlineConfig },
    ];

    const actionButtons: Array<{ icon: LucideIcon; label: string; onClick: () => void; primary?: boolean }> = [
        { icon: Wrench, label: actionsCopy.runSetup, onClick: settingsActions.setup.openHarnessWizard },
		{ icon: Plug, label: actionsCopy.testProviders, onClick: () => onSwitchTab('aiModels') },
		{ icon: Database, label: actionsCopy.checkIndex, onClick: () => onSwitchTab('knowledgeSearch') },
        { icon: MessageSquare, label: actionsCopy.tryChat, onClick: settingsActions.openAssistant, primary: true },
    ];

    return (
        <div className="pkset-panel">
            <SettingsSection title={readinessCopy.sectionTitle} sub={readinessCopy.sectionSub}>
                <div className="pkset-row-list">
                    {readinessRows.map((r) => (
                        <SettingsRow
                            key={r.title}
                            icon={r.icon} title={r.title} desc={r.desc}
                            right={<>
                                {statusChip(r.status, readinessCopy)}
                                <Row.Meta>{r.meta}</Row.Meta>
                                <Pill onClick={r.onPill}>{r.pill}</Pill>
                            </>}
                        />
                    ))}
                </div>
            </SettingsSection>

            <SettingsSection title={summaryCopy.sectionTitle} sub={summaryCopy.sectionSub}>
                <div className="pkset-row-list">
                    {summaryRows.map((r) => (
						<Row key={r.title} onClick={() => onSwitchTab('aiModels')} data-clickable="true">
                            <Row.Icon><r.icon size={16} /></Row.Icon>
                            <Row.Body>
                                <Row.Title>{r.title}</Row.Title>
                                <Row.Desc>{r.desc}</Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                {r.value ? (
                                    r.muted ? <Row.Meta>{r.value}</Row.Meta> : <Row.Value>{r.value}</Row.Value>
                                ) : <Row.Meta>—</Row.Meta>}
                                <ChevronRight size={14} className="pktw-text-pk-text-tertiary" />
                            </Row.Right>
                        </Row>
                    ))}
                </div>
            </SettingsSection>

            <SettingsSection title={actionsCopy.sectionTitle}>
                <div className="pkset-action-strip">
                    {actionButtons.map((b) => (
                        <Button key={b.label} variant={b.primary ? undefined : 'outline'} size="sm" onClick={b.onClick}>
                            <b.icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            {b.label}
                        </Button>
                    ))}
                </div>
            </SettingsSection>
        </div>
    );
}

const SAFETY_LABEL: Record<HarnessSettings['defaultPermissionMode'], string> = {
    read: 'Read only',
    acceptEdits: 'Ask before risky writes',
    bypassPermissions: 'Bypass permissions',
};

/* ─── Derived state ─────────────────────────────────────────────────────── */

function useProvidersReadiness(): { count: number; ready: boolean } {
    const [tick, setTick] = useState(0);
    void tick;
    useEffect(() => { setTick((t) => t + 1); }, []);
    const profiles = ProfileRegistry.getInstance().getAllProfiles();
    const enabled = profiles.filter((p) => p.enabled).length;
    return { count: enabled, ready: enabled > 0 };
}

interface AIBehaviorState {
    status: 'ready' | 'needs-attention';
    reason: string;
}

function useAIBehaviorReadiness(harness: HarnessSettings | undefined): AIBehaviorState {
    return useMemo(() => {
        const hasFast = !!harness?.localFastConfig;
        const hasDeep = !!harness?.localDeepConfig;
        if (hasFast && hasDeep) return { status: 'ready', reason: 'All tiers bound' };
        if (!hasFast && !hasDeep) return { status: 'needs-attention', reason: 'No models bound' };
        if (!hasFast) return { status: 'needs-attention', reason: 'Fast Lookup falls back to Conversation' };
        return { status: 'needs-attention', reason: 'Research not bound' };
    }, [harness]);
}

type IndexCoverage =
    | { kind: 'loading' }
    | { kind: 'empty' }
    | { kind: 'ready'; indexed: number; total: number; pct: number };

function useIndexCoverage(): IndexCoverage {
    const { vaultStats, indexService } = useServiceContext();
    const [state, setState] = useState<IndexCoverage>({ kind: 'loading' });
    useEffect(() => {
        if (!sqliteStoreManager.isInitialized() || !indexService) {
            setState({ kind: 'empty' });
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const status = await indexService.getIndexStatus();
                if (cancelled) return;
                const total = vaultStats.markdownCount();
                const indexed = status.indexedDocs ?? 0;
                if (indexed === 0) {
                    setState({ kind: 'empty' });
                    return;
                }
                const pct = total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : 0;
                setState({ kind: 'ready', indexed, total, pct });
            } catch {
                if (!cancelled) setState({ kind: 'empty' });
            }
        })();
        return () => { cancelled = true; };
    }, [vaultStats]);
    return state;
}

function formatCoverage(c: IndexCoverage): string {
    if (c.kind === 'loading') return '…';
    if (c.kind === 'empty') return 'Not indexed';
    return `${c.pct}% indexed`;
}

function formatBinding(cfg: { profileId: string; modelId: string } | null): string | null {
    if (!cfg) return null;
    const profile = ProfileRegistry.getInstance()
        .getAllProfiles()
        .find((p) => p.id === cfg.profileId);
    if (!profile) return cfg.modelId;
    return `${profile.name} · ${cfg.modelId}`;
}
