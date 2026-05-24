/**
 * Agent Harness settings section (M5).
 *
 * Exposes the three tier model configs, escalation policy, and permission mode
 * to the user. Follows existing ProfilesTab layout conventions.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { RoleModelPicker } from './RoleModelPicker';
import type { Profile, RoleConfig } from '@/core/profiles/types';
import type { HarnessSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { MyPluginSettings } from '@/app/settings/types';

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
    activeConfig: RoleConfig | null;
    profiles: Profile[];
    onSelect: (cfg: RoleConfig) => void;
    onClear: () => void;
    modelFilter?: (modelId: string) => boolean;
}

function TierPicker({ label, activeConfig, profiles, onSelect, onClear, modelFilter }: TierPickerProps) {
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
                    {resolved ?? `${label}: Not configured`}
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
            {/* Agent backend selection */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    Agent Backend
                </span>
                <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mt-1 pktw-mb-3 pktw-p-2.5 pktw-rounded-md pktw-bg-pk-accent/5 pktw-border pktw-border-pk-accent/20">
                    <Info className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-mt-px pktw-text-pk-accent" />
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        Which engine runs migrated agents (FollowupChat, DocSimple). VaultSearch always uses Claude Agent SDK due to HITL coupling.
                    </span>
                </div>
                <FieldRow label="Backend" hint="Auto = harness for migrated agents; Claude Agent SDK requires API key">
                    <select
                        value={harness.agentBackend}
                        onChange={(e) => updateHarness({ agentBackend: e.target.value as HarnessSettings['agentBackend'] })}
                        className={INPUT_CLS}
                    >
                        <option value="auto">Auto (harness, fallback per agent)</option>
                        <option value="harness">Self-hosted harness only (local models, low cost)</option>
                        <option value="claude-agent-sdk">Claude Agent SDK only (highest quality, API key)</option>
                    </select>
                </FieldRow>
            </div>

            {/* Tier model bindings */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    Tier Model Bindings
                </span>
                <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mt-1 pktw-mb-3 pktw-p-2.5 pktw-rounded-md pktw-bg-pk-accent/5 pktw-border pktw-border-pk-accent/20">
                    <Info className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-mt-px pktw-text-pk-accent" />
                    <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                        Configure which model serves each tier. Local tiers use Ollama profiles; online tier uses Anthropic or OpenRouter.
                        Unset tiers are skipped in the cascade.
                    </span>
                </div>
                <div className="pktw-space-y-2.5">
                    <FieldRow label="Local Fast tier" hint="Fast single-step tasks (14B models)">
                        <TierPicker
                            label="Local Fast"
                            activeConfig={harness.localFastConfig}
                            profiles={localProfiles}
                            onSelect={(cfg) => updateHarness({ localFastConfig: cfg })}
                            onClear={() => updateHarness({ localFastConfig: null })}
                        />
                    </FieldRow>
                    <FieldRow label="Local Deep tier" hint="Multi-step reasoning (32B+ models)">
                        <TierPicker
                            label="Local Deep"
                            activeConfig={harness.localDeepConfig}
                            profiles={localProfiles}
                            onSelect={(cfg) => updateHarness({ localDeepConfig: cfg })}
                            onClear={() => updateHarness({ localDeepConfig: null })}
                        />
                    </FieldRow>
                    <FieldRow label="Online tier" hint="Cloud model (Claude, GPT, etc.)">
                        <TierPicker
                            label="Online"
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
                    Escalation Policy
                </span>
                <div className="pktw-space-y-2.5 pktw-mt-2.5">
                    <FieldRow label="Allow escalation" hint="Auto-upgrade to next tier on low confidence">
                        <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer">
                            <input
                                type="checkbox"
                                checked={harness.allowEscalation}
                                onChange={(e) => updateHarness({ allowEscalation: e.target.checked })}
                                className="pktw-rounded pktw-border-pk-border"
                            />
                            <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                                Enable automatic tier escalation
                            </span>
                        </label>
                    </FieldRow>

                    <FieldRow label="Max escalations / loop" hint="Hard cap per agent run (1–3)">
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

                    <FieldRow label="Auto-escalate score threshold" hint="Escalate when step score falls below this (0–1)">
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

            {/* Permission mode */}
            <div>
                <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                    Permission Mode
                </span>
                <div className="pktw-space-y-2.5 pktw-mt-2.5">
                    <FieldRow label="Default permission mode" hint="Controls how agents handle write operations">
                        <select
                            className={INPUT_CLS}
                            value={harness.defaultPermissionMode}
                            onChange={(e) => updateHarness({ defaultPermissionMode: e.target.value as HarnessSettings['defaultPermissionMode'] })}
                        >
                            <option value="read">Read only (no writes)</option>
                            <option value="acceptEdits">Accept edits (auto-approve vault writes)</option>
                            <option value="bypassPermissions">Bypass permissions (unsafe)</option>
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
                    <span className="pktw-text-sm pktw-font-medium">Hooks (advanced)</span>
                    <span className="pktw-ml-auto pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-pk-foreground-faint/10 pktw-text-pk-foreground-faint">
                        Coming soon
                    </span>
                </div>

                {hooksOpen && (
                    <div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-3 pktw-mt-3">
                        <FieldRow label="Enable hooks">
                            <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-not-allowed pktw-opacity-50">
                                <input
                                    type="checkbox"
                                    checked={harness.hooksEnabled}
                                    disabled
                                    className="pktw-rounded pktw-border-pk-border"
                                />
                                <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                                    Enable pre/post tool-use hooks
                                </span>
                            </label>
                        </FieldRow>
                        <span className="pktw-block pktw-text-[11px] pktw-text-pk-foreground-faint/70">
                            Hook configuration DSL is not yet available. This section will allow defining
                            deny rules and command hooks for pre_tool_use / post_tool_use events.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
