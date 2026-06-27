/**
 * Overview tab — 5-row Peak readiness + AI behavior summary + Actions strip.
 *
 * Mirrors docs/gstack/settings-redesign-2026-05-29/index.html#overview.
 * Replaces the PR-D/PR-E surface-adapter-driven render, which left the tab
 * almost empty in practice (only surfaces that had registered an adapter
 * showed up — typically just Chat + Copilot). The new behavior renders 5
 * explicit triage rows whose readiness is derived from live config:
 *   - Providers           — ProfileRegistry.getAllProfiles()
 *   - AI behavior         — harnessSettings tier bindings
 *   - Knowledge Index     — IndexService.getIndexStatus() coverage
 *   - Web Access          — static "Optional" (no field today)
 *   - Safety              — harnessSettings.defaultPermissionMode
 *
 * Row CTAs jump to the right tab via the `onSwitchTab` prop. The readiness
 * row never opens an inline modal — it always navigates the user to where
 * the binding lives.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Check,
    ChevronRight,
    Database,
    Globe,
    MessageSquare,
    Microscope,
    Plug,
    Search,
    Shield,
    Sparkles,
    TrendingUp,
    Wrench,
    Zap,
} from 'lucide-react';
import { Row, Chip, Pill, Button } from '@/ui/components/primitives';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { MyPluginSettings, HarnessSettings } from '@/core/config/settingsTypes';
import { useSettingsStrings } from '../settingsStrings';
import type { TabId } from '../types';

interface OverviewTabProps {
    settings: MyPluginSettings;
    onSwitchTab: (tab: TabId) => void;
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

    return (
        <div className="pkset-panel">
            {/* ── Peak readiness ────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{readinessCopy.sectionTitle}</span>
                    <span className="pkset-section__sub">{readinessCopy.sectionSub}</span>
                </div>
                <div className="pkset-row-list">
                    <ProvidersRow
                        count={providers.count}
                        ready={providers.ready}
                        labels={readinessCopy}
                        onManage={() => onSwitchTab('aiSetup')}
                    />
                    <AIBehaviorRow
                        state={aiBehavior}
                        labels={readinessCopy}
                        onFix={() => onSwitchTab('aiSetup')}
                    />
                    <KnowledgeIndexRow
                        coverage={indexCoverage}
                        labels={readinessCopy}
                        onCheck={() => onSwitchTab('knowledgeIndex')}
                    />
                    <WebAccessRow
                        labels={readinessCopy}
                        onSetup={() => onSwitchTab('tools')}
                    />
                    <SafetyRow
                        mode={safety}
                        labels={readinessCopy}
                        onReview={() => onSwitchTab('aiSetup')}
                    />
                </div>
            </div>

            {/* ── AI behavior summary (read-only) ───────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{summaryCopy.sectionTitle}</span>
                    <span className="pkset-section__sub">{summaryCopy.sectionSub}</span>
                </div>
                <div className="pkset-row-list">
                    <SummaryRow
                        icon={MessageSquare}
                        title={summaryCopy.conversation.title}
                        desc={summaryCopy.conversation.desc}
                        value={formatBinding(settings.harnessSettings?.localFastConfig ?? null)}
                        onClick={() => onSwitchTab('aiSetup')}
                    />
                    <SummaryRow
                        icon={Zap}
                        title={summaryCopy.fastLookup.title}
                        desc={summaryCopy.fastLookup.desc}
                        value={
                            formatBinding(settings.harnessSettings?.localFastConfig ?? null) ??
                            summaryCopy.fastLookup.fallback
                        }
                        muted={!settings.harnessSettings?.localFastConfig}
                        onClick={() => onSwitchTab('aiSetup')}
                    />
                    <SummaryRow
                        icon={Microscope}
                        title={summaryCopy.research.title}
                        desc={summaryCopy.research.desc}
                        value={formatBinding(settings.harnessSettings?.localDeepConfig ?? null)}
                        onClick={() => onSwitchTab('aiSetup')}
                    />
                    <SummaryRow
                        icon={TrendingUp}
                        title={summaryCopy.strongerModel.title}
                        desc={summaryCopy.strongerModel.desc}
                        value={
                            formatBinding(settings.harnessSettings?.onlineConfig ?? null) ??
                            summaryCopy.strongerModel.offChip
                        }
                        muted={!settings.harnessSettings?.onlineConfig}
                        onClick={() => onSwitchTab('aiSetup')}
                    />
                </div>
            </div>

            {/* ── Actions ───────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{actionsCopy.sectionTitle}</span>
                </div>
                <div className="pkset-action-strip">
                    <Button variant="outline" size="sm" onClick={settingsActions.setup.openHarnessWizard}>
                        <Wrench className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                        {actionsCopy.runSetup}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSwitchTab('aiSetup')}
                    >
                        <Plug className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                        {actionsCopy.testProviders}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSwitchTab('knowledgeIndex')}
                    >
                        <Database className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                        {actionsCopy.checkIndex}
                    </Button>
                    <Button size="sm" onClick={settingsActions.openAssistant}>
                        <MessageSquare className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                        {actionsCopy.tryChat}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Rows
 * ───────────────────────────────────────────────────────────────────────── */

type ReadinessCopy = ReturnType<typeof useSettingsStrings>['overview']['readiness'];

function ProvidersRow({
    count,
    ready,
    labels,
    onManage,
}: {
    count: number;
    ready: boolean;
    labels: ReadinessCopy;
    onManage: () => void;
}) {
    return (
        <Row>
            <Row.Icon>
                <Plug size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{labels.providers.title}</Row.Title>
                <Row.Desc>{labels.providers.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {ready ? (
                    <Chip variant="success">
                        <Check size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.ready}
                    </Chip>
                ) : (
                    <Chip variant="warning">
                        <AlertTriangle size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.needsAttention}
                    </Chip>
                )}
                <Row.Meta>{count === 1 ? '1 connected' : `${count} connected`}</Row.Meta>
                <Pill onClick={onManage}>{labels.providers.manage}</Pill>
            </Row.Right>
        </Row>
    );
}

function AIBehaviorRow({
    state,
    labels,
    onFix,
}: {
    state: AIBehaviorState;
    labels: ReadinessCopy;
    onFix: () => void;
}) {
    return (
        <Row>
            <Row.Icon>
                <Sparkles size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{labels.aiBehavior.title}</Row.Title>
                <Row.Desc>{labels.aiBehavior.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {state.status === 'ready' ? (
                    <Chip variant="success">
                        <Check size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.ready}
                    </Chip>
                ) : (
                    <Chip variant="warning">
                        <AlertTriangle size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.needsAttention}
                    </Chip>
                )}
                <Row.Meta>{state.reason}</Row.Meta>
                <Pill onClick={onFix}>{labels.aiBehavior.manage}</Pill>
            </Row.Right>
        </Row>
    );
}

function KnowledgeIndexRow({
    coverage,
    labels,
    onCheck,
}: {
    coverage: IndexCoverage;
    labels: ReadinessCopy;
    onCheck: () => void;
}) {
    const ready = coverage.kind === 'ready' && coverage.pct >= 80;
    const isOptional = coverage.kind === 'empty';
    return (
        <Row>
            <Row.Icon>
                <Database size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{labels.knowledgeIndex.title}</Row.Title>
                <Row.Desc>{labels.knowledgeIndex.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {isOptional ? (
                    <Chip variant="neutral">{labels.statusLabels.optional}</Chip>
                ) : ready ? (
                    <Chip variant="success">
                        <Check size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.ready}
                    </Chip>
                ) : (
                    <Chip variant="warning">
                        <AlertTriangle size={11} style={{ marginRight: 4 }} />
                        {labels.statusLabels.needsAttention}
                    </Chip>
                )}
                <Row.Meta>{formatCoverage(coverage)}</Row.Meta>
                <Pill onClick={onCheck}>{labels.knowledgeIndex.check}</Pill>
            </Row.Right>
        </Row>
    );
}

function WebAccessRow({
    labels,
    onSetup,
}: {
    labels: ReadinessCopy;
    onSetup: () => void;
}) {
    return (
        <Row>
            <Row.Icon>
                <Globe size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{labels.webAccess.title}</Row.Title>
                <Row.Desc>{labels.webAccess.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Chip variant="neutral">{labels.webAccess.optional}</Chip>
                <Row.Meta>Not configured</Row.Meta>
                <Pill onClick={onSetup}>{labels.webAccess.setup}</Pill>
            </Row.Right>
        </Row>
    );
}

const SAFETY_LABEL: Record<HarnessSettings['defaultPermissionMode'], string> = {
    read: 'Read only',
    acceptEdits: 'Ask before risky writes',
    bypassPermissions: 'Bypass permissions',
};

function SafetyRow({
    mode,
    labels,
    onReview,
}: {
    mode: HarnessSettings['defaultPermissionMode'];
    labels: ReadinessCopy;
    onReview: () => void;
}) {
    return (
        <Row>
            <Row.Icon>
                <Shield size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{labels.safety.title}</Row.Title>
                <Row.Desc>{labels.safety.desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Chip variant="success">
                    <Check size={11} style={{ marginRight: 4 }} />
                    {labels.statusLabels.ready}
                </Chip>
                <Row.Meta>{SAFETY_LABEL[mode]}</Row.Meta>
                <Pill onClick={onReview}>{labels.safety.review}</Pill>
            </Row.Right>
        </Row>
    );
}

function SummaryRow({
    icon: Icon,
    title,
    desc,
    value,
    muted,
    onClick,
}: {
    icon: React.ElementType;
    title: string;
    desc: string;
    value: string | null;
    muted?: boolean;
    onClick: () => void;
}) {
    return (
        <Row onClick={onClick} data-clickable="true">
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{title}</Row.Title>
                <Row.Desc>{desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {value ? (
                    muted ? (
                        <Row.Meta>{value}</Row.Meta>
                    ) : (
                        <Row.Value>{value}</Row.Value>
                    )
                ) : (
                    <Row.Meta>—</Row.Meta>
                )}
                <ChevronRight
                    size={14}
                    style={{ color: 'var(--pk-text-tertiary)' }}
                />
            </Row.Right>
        </Row>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Derived state
 * ───────────────────────────────────────────────────────────────────────── */

function useProvidersReadiness(): { count: number; ready: boolean } {
    const [tick, setTick] = useState(0);
    void tick;
    useEffect(() => {
        // Re-evaluate when the SettingsView re-renders. Cheap; nothing async.
        setTick((t) => t + 1);
    }, []);
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
        if (hasFast && hasDeep) {
            return { status: 'ready', reason: 'All tiers bound' };
        }
        if (!hasFast && !hasDeep) {
            return { status: 'needs-attention', reason: 'No models bound' };
        }
        if (!hasFast) {
            return { status: 'needs-attention', reason: 'Fast Lookup falls back to Conversation' };
        }
        return { status: 'needs-attention', reason: 'Research not bound' };
    }, [harness]);
}

type IndexCoverage =
    | { kind: 'loading' }
    | { kind: 'empty' }
    | { kind: 'ready'; indexed: number; total: number; pct: number };

function useIndexCoverage(): IndexCoverage {
    const { vaultStats } = useServiceContext();
    const [state, setState] = useState<IndexCoverage>({ kind: 'loading' });
    useEffect(() => {
        if (!sqliteStoreManager.isInitialized()) {
            setState({ kind: 'empty' });
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const { IndexService } = await import('@/service/search/index/indexService');
                const status = await IndexService.getInstance().getIndexStatus();
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
                return;
            }
        })();
        return () => {
            cancelled = true;
        };
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
