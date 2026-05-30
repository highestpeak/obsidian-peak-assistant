/**
 * Agent Harness settings section (M5).
 *
 * Exposes the three tier model configs, escalation policy, and permission mode
 * to the user. Follows existing ProfilesTab layout conventions.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Info, Wand2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { RoleModelPicker } from './RoleModelPicker';
import { openHarnessSetupWizard } from '@/app/commands/PeakCommandActions';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import type { HarnessSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { MyPluginSettings } from '@/app/settings/types';
import {
    DEFAULT_SETTINGS_STRINGS,
    loadSettingsStrings,
    type SettingsStrings,
} from '../settingsStrings';

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent/60 pktw-transition-colors';
const LABEL_CLS = 'pktw-text-xs pktw-text-pk-foreground-faint';

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="pktw-grid pktw-items-start pktw-gap-3" style={{ gridTemplateColumns: '180px 1fr' }}>
            <div className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-pt-1">
                <span className={LABEL_CLS}>{label}</span>
                {hint && <span className="pktw-text-[10px] pktw-text-pk-foreground-faint/70">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

// ─── Tier picker chip ─────────────────────────────────────────────────────────

interface TierPickerProps {
    label: string;
    unsetSuffix: string;
    activeConfig: RoleConfig | null;
    profiles: Profile[];
    onSelect: (cfg: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

function TierPicker({ label, unsetSuffix, activeConfig, profiles, onSelect, onClear, modelFilter }: TierPickerProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Resolve display model id from profile registry
    const resolved = activeConfig
        ? (() => {
            const p = ProfileRegistry.getInstance().getAllProfiles().find(p => p.id === activeConfig.profileId);
            return p ? activeConfig.modelId : null;
        })()
        : null;

    return (
        <div ref={ref} className="pktw-relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-text-xs pktw-cursor-pointer pktw-transition-colors pktw-border pktw-border-pk-border',
                    resolved
                        ? 'pktw-bg-pk-background pktw-text-pk-foreground hover:pktw-bg-pk-accent/5'
                        : 'pktw-bg-pk-background pktw-text-pk-foreground-faint hover:pktw-bg-pk-accent/5',
                )}
            >
                <span className="pktw-truncate pktw-max-w-[200px]">
                    {resolved ?? `${label}: ${unsetSuffix}`}
                </span>
                <ChevronDown className={cn('pktw-w-3 pktw-h-3 pktw-shrink-0 pktw-transition-transform', open && 'pktw-rotate-180')} />
            </button>

            {open && (
                <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-z-50">
                    <RoleModelPicker
                        activeConfig={activeConfig
                            ? (() => {
                                const p = ProfileRegistry.getInstance().getAllProfiles().find(p => p.id === activeConfig.profileId);
                                return p ? { profile: p, modelId: activeConfig.modelId } : null;
                            })()
                            : null
                        }
                        profiles={profiles}
                        onSelect={(config) => { onSelect(config); setOpen(false); }}
                        onClear={() => { onClear(); setOpen(false); }}
                        modelFilter={modelFilter}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface HarnessSettingsSectionProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function HarnessSettingsSection({ settings, settingsUpdates }: HarnessSettingsSectionProps) {
    const [hooksOpen, setHooksOpen] = useState(false);
    const [strings, setStrings] = useState<SettingsStrings>(DEFAULT_SETTINGS_STRINGS);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const loaded = await loadSettingsStrings();
            if (!cancelled) setStrings(loaded);
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    const harnessCopy = strings.harness;

    const harness: HarnessSettings = settings.harnessSettings ?? {
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

    const updateHarness = (patch: Partial<HarnessSettings>) => {
        settingsUpdates.update('harnessSettings', { ...harness, ...patch });
    };

    const registry = ProfileRegistry.getInstance();
    const allProfiles = registry.getAllProfiles();
    const localProfiles = allProfiles.filter(p => p.kind === 'ollama');
    const onlineProfiles = allProfiles.filter(p => p.kind === 'anthropic' || p.kind === 'openrouter');

    return (
        <div className="pktw-space-y-5">
            {/* Setup wizard re-run */}
            <div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-accent/30 pktw-bg-pk-accent/5">
                <Wand2 className="pktw-w-4 pktw-h-4 pktw-shrink-0 pktw-mt-0.5 pktw-text-pk-accent" />
                <div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-1">
                    <span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground">
                        {harnessCopy.reRunBanner.title}
                    </span>
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        {harnessCopy.reRunBanner.description}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={openHarnessSetupWizard}
                    className="pktw-text-xs pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-pk-accent pktw-text-white hover:pktw-opacity-90 pktw-transition-opacity"
                >
                    {harnessCopy.reRunBanner.cta}
                </button>
            </div>

            {/* Agent runtime selection */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    {harnessCopy.backend.sectionLabel}
                </span>
                <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mt-1 pktw-mb-3 pktw-p-2.5 pktw-rounded-md pktw-bg-pk-accent/5 pktw-border pktw-border-pk-accent/20">
                    <Info className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-mt-px pktw-text-pk-accent" />
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        {harnessCopy.backend.info}
                    </span>
                </div>
                <FieldRow label={harnessCopy.backend.fieldLabel} hint={harnessCopy.backend.fieldHint}>
                    <select
                        value={harness.agentBackend}
                        onChange={(e) => updateHarness({ agentBackend: e.target.value as HarnessSettings['agentBackend'] })}
                        className={INPUT_CLS}
                    >
                        <option value="auto">{harnessCopy.backend.options.auto}</option>
                        <option value="harness">{harnessCopy.backend.options.harness}</option>
                        <option value="claude-agent-sdk">{harnessCopy.backend.options.claudeAgentSdk}</option>
                    </select>
                </FieldRow>
            </div>

            {/* Tier model bindings */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    {harnessCopy.tierBindings.sectionLabel}
                </span>
                <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mt-1 pktw-mb-3 pktw-p-2.5 pktw-rounded-md pktw-bg-pk-accent/5 pktw-border pktw-border-pk-accent/20">
                    <Info className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-mt-px pktw-text-pk-accent" />
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        {harnessCopy.tierBindings.info}
                    </span>
                </div>
                <div className="pktw-space-y-2.5">
                    <FieldRow label={harnessCopy.tierBindings.fastTier.label} hint={harnessCopy.tierBindings.fastTier.hint}>
                        <TierPicker
                            label={harnessCopy.tierBindings.fastTier.pickerLabel}
                            unsetSuffix={harnessCopy.tierBindings.unsetPickerSuffix}
                            activeConfig={harness.localFastConfig}
                            profiles={localProfiles}
                            onSelect={(cfg) => updateHarness({ localFastConfig: cfg })}
                            onClear={() => updateHarness({ localFastConfig: null })}
                        />
                    </FieldRow>
                    <FieldRow label={harnessCopy.tierBindings.researchTier.label} hint={harnessCopy.tierBindings.researchTier.hint}>
                        <TierPicker
                            label={harnessCopy.tierBindings.researchTier.pickerLabel}
                            unsetSuffix={harnessCopy.tierBindings.unsetPickerSuffix}
                            activeConfig={harness.localDeepConfig}
                            profiles={localProfiles}
                            onSelect={(cfg) => updateHarness({ localDeepConfig: cfg })}
                            onClear={() => updateHarness({ localDeepConfig: null })}
                        />
                    </FieldRow>
                    <FieldRow label={harnessCopy.tierBindings.strongerTier.label} hint={harnessCopy.tierBindings.strongerTier.hint}>
                        <TierPicker
                            label={harnessCopy.tierBindings.strongerTier.pickerLabel}
                            unsetSuffix={harnessCopy.tierBindings.unsetPickerSuffix}
                            activeConfig={harness.onlineConfig}
                            profiles={onlineProfiles}
                            onSelect={(cfg) => updateHarness({ onlineConfig: cfg })}
                            onClear={() => updateHarness({ onlineConfig: null })}
                        />
                    </FieldRow>
                </div>
            </div>

            {/* Escalation policy */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    {harnessCopy.escalation.sectionLabel}
                </span>
                <div className="pktw-space-y-2.5 pktw-mt-2.5">
                    <FieldRow label={harnessCopy.escalation.allowFieldLabel} hint={harnessCopy.escalation.allowFieldHint}>
                        <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer">
                            <input
                                type="checkbox"
                                checked={harness.allowEscalation}
                                onChange={(e) => updateHarness({ allowEscalation: e.target.checked })}
                                className="pktw-rounded pktw-border-pk-border"
                            />
                            <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                                {harnessCopy.escalation.allowToggleLabel}
                            </span>
                        </label>
                    </FieldRow>

                    <FieldRow label={harnessCopy.escalation.maxFieldLabel} hint={harnessCopy.escalation.maxFieldHint}>
                        <input
                            type="number" min="1" max="3"
                            disabled={!harness.allowEscalation}
                            className={cn(INPUT_CLS, !harness.allowEscalation && 'pktw-opacity-40 pktw-cursor-not-allowed')}
                            value={harness.maxEscalationsPerLoop}
                            onChange={(e) => {
                                const v = Math.max(1, Math.min(3, parseInt(e.target.value, 10) || 1));
                                updateHarness({ maxEscalationsPerLoop: v });
                            }}
                        />
                    </FieldRow>

                    <FieldRow label={harnessCopy.escalation.thresholdFieldLabel} hint={harnessCopy.escalation.thresholdFieldHint}>
                        <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-w-full">
                            <div className="pktw-flex pktw-items-center pktw-gap-2">
                                <input
                                    type="range" step="0.05" min="0" max="1"
                                    disabled={!harness.allowEscalation}
                                    className={cn('pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--pk-accent)]', !harness.allowEscalation && 'pktw-opacity-40 pktw-cursor-not-allowed')}
                                    value={harness.autoEscalateScoreBelow}
                                    onChange={(e) => updateHarness({ autoEscalateScoreBelow: parseFloat(e.target.value) })}
                                />
                                <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
                                    {harness.autoEscalateScoreBelow.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </FieldRow>
                </div>
            </div>

            {/* Safety (formerly Permission mode) */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    {harnessCopy.safety.sectionLabel}
                </span>
                <div className="pktw-space-y-2.5 pktw-mt-2.5">
                    <FieldRow label={harnessCopy.safety.fieldLabel} hint={harnessCopy.safety.fieldHint}>
                        <select
                            className={INPUT_CLS}
                            value={harness.defaultPermissionMode}
                            onChange={(e) => updateHarness({ defaultPermissionMode: e.target.value as HarnessSettings['defaultPermissionMode'] })}
                        >
                            <option value="read">{harnessCopy.safety.options.read}</option>
                            <option value="acceptEdits">{harnessCopy.safety.options.acceptEdits}</option>
                            <option value="bypassPermissions">{harnessCopy.safety.options.bypassPermissions}</option>
                        </select>
                    </FieldRow>
                </div>
            </div>

            {/* Hooks — advanced, collapsed, coming soon */}
            <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
                <div
                    className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent/5 pktw-transition-colors"
                    onClick={() => setHooksOpen(v => !v)}
                >
                    <ChevronRight
                        size={14}
                        className={cn(
                            'pktw-text-pk-muted-foreground pktw-transition-transform pktw-duration-200',
                            hooksOpen && 'pktw-rotate-90',
                        )}
                    />
                    <span className="pktw-text-sm pktw-font-medium">{harnessCopy.hooks.sectionLabel}</span>
                    <span className="pktw-ml-auto pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-pk-foreground-faint/10 pktw-text-pk-foreground-faint">
                        {harnessCopy.hooks.comingSoonChip}
                    </span>
                </div>

                {hooksOpen && (
                    <div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-3 pktw-mt-3">
                        <FieldRow label={harnessCopy.hooks.enableLabel}>
                            <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-not-allowed pktw-opacity-50">
                                <input
                                    type="checkbox"
                                    checked={harness.hooksEnabled}
                                    disabled
                                    className="pktw-rounded pktw-border-pk-border"
                                />
                                <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                                    {harnessCopy.hooks.enableHint}
                                </span>
                            </label>
                        </FieldRow>
                        <span className="pktw-block pktw-text-[11px] pktw-text-pk-foreground-faint/70">
                            {harnessCopy.hooks.description}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
