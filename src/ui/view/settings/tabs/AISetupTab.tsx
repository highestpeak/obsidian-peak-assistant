/**
 * AI Setup tab (PR-D).
 *
 * Three sub-sections:
 *   1. Providers — existing ProfilesTab content
 *   2. AI Behavior — summary table of tier bindings (read-only display;
 *      Change/Set up Pill opens the harness setup wizard)
 *   3. Safety — Segmented selector for permission mode
 *
 * The raw `HarnessSettingsSection` (with Agent-runtime backend selector +
 * escalation policy + hooks) lives in the Advanced tab — this tab presents
 * the user-facing surface only.
 */

import React from 'react';
import { MessageSquare, Zap, Search as SearchIcon, Sparkle, Database } from 'lucide-react';
import { Row, Chip, Pill, Segmented } from '@/ui/components/primitives';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { openHarnessSetupWizard } from '@/app/commands/PeakCommandActions';
import type { MyPluginSettings, HarnessSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { RoleConfig } from '@/core/profiles/types';
import { ProfilesTab } from '../ProfilesTab';
import { useSettingsStrings } from '../settingsStrings';

interface AISetupTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function AISetupTab({ settings, settingsUpdates }: AISetupTabProps) {
    const strings = useSettingsStrings();
    const aiSetupCopy = strings.aiSetup;

    const harness: HarnessSettings | undefined = settings.harnessSettings;

    return (
        <div className="pkset-panel">
            {/* ── Providers ─────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{aiSetupCopy.providers.sectionTitle}</span>
                    <span className="pkset-section__sub">{aiSetupCopy.providers.sectionSub}</span>
                </div>
                {/* Reuse the existing ProfilesTab content (status bar +
                    profile cards + add/edit). Vocab inside ProfilesTab is
                    already largely "Provider" — full vocab pass is a future
                    sweep. */}
                <ProfilesTab settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            {/* ── AI Behavior summary ───────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{aiSetupCopy.aiBehavior.sectionTitle}</span>
                </div>
                <div className="pkset-row-list">
                    <BehaviorRow
                        icon={MessageSquare}
                        title={aiSetupCopy.aiBehavior.conversation.title}
                        desc={aiSetupCopy.aiBehavior.conversation.desc}
                        bound={null /* PR-D: conversation model lives elsewhere; render as 'change in wizard' */}
                        fallbackText={null}
                        changeLabel={aiSetupCopy.aiBehavior.change}
                        setupLabel={aiSetupCopy.aiBehavior.setup}
                    />
                    <BehaviorRow
                        icon={Zap}
                        title={aiSetupCopy.aiBehavior.fastLookup.title}
                        desc={aiSetupCopy.aiBehavior.fastLookup.desc}
                        bound={harness?.localFastConfig ?? null}
                        fallbackText={aiSetupCopy.aiBehavior.fallsBack}
                        changeLabel={aiSetupCopy.aiBehavior.change}
                        setupLabel={aiSetupCopy.aiBehavior.setup}
                    />
                    <BehaviorRow
                        icon={SearchIcon}
                        title={aiSetupCopy.aiBehavior.research.title}
                        desc={aiSetupCopy.aiBehavior.research.desc}
                        bound={harness?.localDeepConfig ?? null}
                        fallbackText={aiSetupCopy.aiBehavior.fallsBack}
                        changeLabel={aiSetupCopy.aiBehavior.change}
                        setupLabel={aiSetupCopy.aiBehavior.setup}
                    />
                    <BehaviorRow
                        icon={Sparkle}
                        title={aiSetupCopy.aiBehavior.strongerModel.title}
                        desc={aiSetupCopy.aiBehavior.strongerModel.desc}
                        bound={harness?.onlineConfig ?? null}
                        fallbackText={aiSetupCopy.aiBehavior.strongerModel.offChip}
                        changeLabel={aiSetupCopy.aiBehavior.change}
                        setupLabel={aiSetupCopy.aiBehavior.setup}
                    />
                    <BehaviorRow
                        icon={Database}
                        title={aiSetupCopy.aiBehavior.knowledgeIndex.title}
                        desc={aiSetupCopy.aiBehavior.knowledgeIndex.desc}
                        bound={resolveEmbeddingDisplay()}
                        fallbackText={null}
                        changeLabel={aiSetupCopy.aiBehavior.change}
                        setupLabel={aiSetupCopy.aiBehavior.setup}
                    />
                </div>
            </div>

            {/* ── Safety ────────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{aiSetupCopy.safety.sectionTitle}</span>
                    <span className="pkset-section__sub">{aiSetupCopy.safety.sectionSub}</span>
                </div>
                <SafetySegment harness={harness} settingsUpdates={settingsUpdates} />
            </div>
        </div>
    );
}

function BehaviorRow({
    icon: Icon,
    title,
    desc,
    bound,
    fallbackText,
    changeLabel,
    setupLabel,
}: {
    icon: React.ElementType;
    title: string;
    desc: string;
    bound: RoleConfig | string | null;
    fallbackText: string | null;
    changeLabel: string;
    setupLabel: string;
}) {
    const display = typeof bound === 'string' ? bound : bound ? formatRoleConfig(bound) : null;

    return (
        <Row>
            <Row.Icon><Icon size={16} /></Row.Icon>
            <Row.Body>
                <Row.Title>{title}</Row.Title>
                <Row.Desc>{desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                {display ? (
                    <Row.Value>{display}</Row.Value>
                ) : fallbackText ? (
                    <Chip variant="warning">{fallbackText}</Chip>
                ) : (
                    <Chip variant="neutral">—</Chip>
                )}
                <Pill onClick={openHarnessSetupWizard}>
                    {display ? changeLabel : setupLabel}
                </Pill>
            </Row.Right>
        </Row>
    );
}

function SafetySegment({
    harness,
    settingsUpdates,
}: {
    harness: HarnessSettings | undefined;
    settingsUpdates: SettingsUpdates;
}) {
    const strings = useSettingsStrings();
    const safetyCopy = strings.harness.safety;

    const value = harness?.defaultPermissionMode ?? 'acceptEdits';
    const onChange = (next: HarnessSettings['defaultPermissionMode']) => {
        const base: HarnessSettings = harness ?? {
            agentBackend: 'auto',
            localFastConfig: null,
            localDeepConfig: null,
            onlineConfig: null,
            allowEscalation: true,
            maxEscalationsPerLoop: 3,
            autoEscalateScoreBelow: 0.4,
            hooksEnabled: false,
            defaultPermissionMode: 'acceptEdits',
        };
        settingsUpdates.update('harnessSettings', { ...base, defaultPermissionMode: next });
    };

    return (
        <Segmented<HarnessSettings['defaultPermissionMode']>
            value={value}
            onValueChange={onChange}
            options={[
                { value: 'read', label: safetyCopy.options.read },
                { value: 'acceptEdits', label: safetyCopy.options.acceptEdits },
                { value: 'bypassPermissions', label: safetyCopy.options.bypassPermissions },
            ]}
            aria-label={safetyCopy.fieldLabel}
        />
    );
}

function formatRoleConfig(cfg: RoleConfig): string {
    const profile = ProfileRegistry.getInstance()
        .getAllProfiles()
        .find((p) => p.id === cfg.profileId);
    if (!profile) return cfg.modelId;
    return `${profile.name} · ${cfg.modelId}`;
}

function resolveEmbeddingDisplay(): string | null {
    const p = ProfileRegistry.getInstance().getActiveEmbeddingProfile();
    return p ? p.name : null;
}
