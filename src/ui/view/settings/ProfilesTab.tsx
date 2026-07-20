import React, { useState, useEffect } from 'react';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { modelRegistry } from '@/core/providers/model-registry';
import { Plus, ChevronRight } from 'lucide-react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { ProfileKind, Profile } from '@/core/profiles/types';
import { DEFAULT_HARNESS_SETTINGS, type MyPluginSettings, type HarnessSettings } from '@/core/config/settingsTypes';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { StatusBar } from './components/StatusBar';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileGrid } from './components/AddProfileGrid';
import { FieldRow as SharedFieldRow } from './components/FieldRow';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent pktw-transition-colors';

// ProfilesTab keeps a 160px label column (wider than the 130px default) until
// the settings label-column width is unified by design.
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return <SharedFieldRow label={label} labelWidth="160px">{children}</SharedFieldRow>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfilesTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
    /**
     * Hide the legacy StatusBar (role-binding chip row). Defaults to false to
     * preserve existing behavior; AISetupTab passes true because the new
     * "AI Behavior" section already presents tier→model bindings without
     * leaking internal role names (Agent / Agent Fast / Chat / Embedding /
     * Web Search) that violate the user-facing vocab contract.
     */
    hideStatusBar?: boolean;
}

// ---------------------------------------------------------------------------
// ProfilesTab
// ---------------------------------------------------------------------------

export function ProfilesTab({ settings, settingsUpdates, hideStatusBar = false }: ProfilesTabProps) {
    const registry = ProfileRegistry.getInstance();
    const [showAddGrid, setShowAddGrid] = useState(false);
    const [tick, setTick] = useState(0);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const bump = () => setTick((t) => t + 1);

    // Derived from registry (tick forces re-read)
    void tick;
    const profiles = registry.getAllProfiles();

    useEffect(() => {
        const ollamaProfiles = profiles.filter((p) => p.kind === 'ollama' && p.enabled);
        for (const p of ollamaProfiles) {
            fetchOllamaModels(p.baseUrl).then((models) => {
                if (models.length > 0) {
                    modelRegistry.mergeRuntimeModels('ollama', models);
                    bump();
                }
            });
        }
    }, []);
    // --- Handlers ---

    const handleUpdate = (id: string, updates: Partial<Profile>) => {
        registry.updateProfile(id, updates);
        bump();
    };

    const handleDelete = (id: string) => {
        registry.deleteProfile(id);
        bump();
    };

    const handleToggleEnabled = (id: string) => {
        registry.toggleEnabled(id);
        bump();
    };

    const handleAdd = (kind: ProfileKind) => {
        const p = createPresetProfile(kind);
        registry.addProfile(p);
        setShowAddGrid(false);
        bump();
    };

    // --- Advanced section data ---

    const outputControl = settings.ai?.defaultOutputControl ?? {};

    const updateOutputControl = (field: string, value: unknown) => {
        const current = settings.ai?.defaultOutputControl ?? {};
        settingsUpdates.updateAI('defaultOutputControl', { ...current, [field]: value } as LLMOutputControlSettings);
    };

    // Escalation policy moved here from Advanced tab's Agent runtime — it
    // configures *when* the "Use stronger model when needed" tier kicks in.
    const harness: HarnessSettings = settings.harnessSettings ?? DEFAULT_HARNESS_SETTINGS;
    const updateHarness = (patch: Partial<HarnessSettings>) => {
        settingsUpdates.update('harnessSettings', { ...harness, ...patch });
    };

    return (
        <div className="pktw-space-y-4">
            {/* Status bar — opt-out via hideStatusBar (AI Setup tab uses
                the higher-level AI Behavior section instead). */}
            {!hideStatusBar && <StatusBar />}

            {/* Profile cards */}
            <div className="pktw-space-y-3">
                {profiles.length === 0 && (
                    <div className="pktw-text-sm pktw-text-pk-muted-foreground pktw-text-center pktw-py-8">
                        No profiles configured. Add one to get started.
                    </div>
                )}
                {profiles.map((p) => (
                    <ProfileCard
                        key={p.id}
                        profile={p}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onToggleEnabled={handleToggleEnabled}
                    />
                ))}
            </div>

            {/* Add provider */}
            {showAddGrid ? (
                <AddProfileGrid
                    onSelect={handleAdd}
                    onCancel={() => setShowAddGrid(false)}
                    existingKinds={new Set(profiles.map(p => p.kind))}
                />
            ) : (
                <Button
                    variant="outline"
                    className="pktw-w-full pktw-border-dashed pktw-border-pk-border pktw-text-pk-muted-foreground pktw-h-11 pktw-gap-1.5"
                    onClick={() => setShowAddGrid(true)}
                >
                    <Plus size={16} />
                    Add Provider
                </Button>
            )}

            {/* Custom endpoints folded into Add Provider — picking "LiteLLM"
                or "Custom" in the AddProfileGrid creates an OpenAI-compatible
                profile with the same Connection form fields. Existing
                customEndpoints data in settings is preserved for the chat
                service-manager runtime; only the dedicated UI block is gone. */}

            {/* Advanced model controls disclosure */}
            <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
                <div
                    className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent-tint pktw-transition-colors"
                    onClick={() => setAdvancedOpen((v) => !v)}
                >
                    <ChevronRight
                        size={14}
                        className={cn(
                            'pktw-text-pk-muted-foreground pktw-transition-transform pktw-duration-200 pktw-shrink-0',
                            advancedOpen && 'pktw-rotate-90',
                        )}
                    />
                    <div className="pktw-flex pktw-flex-col pktw-gap-0.5">
                        <span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">
                            Advanced model controls
                        </span>
                        <span className="pktw-text-pk-sm pktw-text-pk-foreground-faint">
                            Temperature, top-p, reasoning effort, timeouts.
                        </span>
                    </div>
                    <span className="pktw-ml-auto pktw-text-pk-sm pktw-text-pk-foreground-faint">
                        6 fields
                    </span>
                </div>

                {advancedOpen && (
                    <div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-4">
                        {/* LLM Output Control */}
                        <div className="pktw-mt-4">
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-pk-foreground">
                                LLM output control
                            </span>
                            <div className="pktw-space-y-2.5 pktw-mt-2.5">
                                <FieldRow label="Temperature">
                                    <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-w-full">
                                        <div className="pktw-flex pktw-items-center pktw-gap-2">
                                            <input type="range" step="0.1" min="0" max="2"
                                                className="pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--pk-accent)]"
                                                value={outputControl.temperature ?? 1}
                                                onChange={(e) => updateOutputControl('temperature', parseFloat(e.target.value))}
                                            />
                                            <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
                                                {(outputControl.temperature ?? 1).toFixed(1)}
                                            </span>
                                        </div>
                                        <span className="pktw-text-pk-xs pktw-text-pk-foreground-faint">Lower = more focused, higher = more creative</span>
                                    </div>
                                </FieldRow>
                                <FieldRow label="Top P">
                                    <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-w-full">
                                        <div className="pktw-flex pktw-items-center pktw-gap-2">
                                            <input type="range" step="0.05" min="0" max="1"
                                                className="pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--pk-accent)]"
                                                value={outputControl.topP ?? 0.9}
                                                onChange={(e) => updateOutputControl('topP', parseFloat(e.target.value))}
                                            />
                                            <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
                                                {(outputControl.topP ?? 0.9).toFixed(2)}
                                            </span>
                                        </div>
                                        <span className="pktw-text-pk-xs pktw-text-pk-foreground-faint">Nucleus sampling threshold</span>
                                    </div>
                                </FieldRow>
                                <FieldRow label="Reasoning Effort">
                                    <select
                                        className={INPUT_CLS}
                                        value={outputControl.reasoningEffort ?? 'medium'}
                                        onChange={(e) => updateOutputControl('reasoningEffort', e.target.value)}
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                    </select>
                                </FieldRow>
                                <FieldRow label="Text Verbosity">
                                    <select
                                        className={INPUT_CLS}
                                        value={outputControl.textVerbosity ?? 'medium'}
                                        onChange={(e) => updateOutputControl('textVerbosity', e.target.value)}
                                    >
                                        <option value="concise">Concise</option>
                                        <option value="medium">Medium</option>
                                        <option value="detailed">Detailed</option>
                                    </select>
                                </FieldRow>
                                <FieldRow label="Timeout Total (s)">
                                    <input
                                        type="number" step="10" min="0"
                                        className={INPUT_CLS}
                                        value={outputControl.timeoutTotalMs != null ? outputControl.timeoutTotalMs / 1000 : ''}
                                        onChange={(e) => updateOutputControl('timeoutTotalMs', (parseFloat(e.target.value) || 0) * 1000)}
                                    />
                                </FieldRow>
                                <FieldRow label="Timeout Step (s)">
                                    <input
                                        type="number" step="5" min="0"
                                        className={INPUT_CLS}
                                        value={outputControl.timeoutStepMs != null ? outputControl.timeoutStepMs / 1000 : ''}
                                        onChange={(e) => updateOutputControl('timeoutStepMs', (parseFloat(e.target.value) || 0) * 1000)}
                                    />
                                </FieldRow>
                            </div>
                        </div>

                        {/* Escalation policy — moved from Advanced tab. Drives
                            when the "Use stronger model when needed" tier kicks
                            in during long-running agent loops. */}
                        <div>
                            <span className="pktw-text-xs pktw-font-semibold pktw-text-pk-foreground">
                                Escalation policy
                            </span>
                            <div className="pktw-space-y-2.5 pktw-mt-2.5">
                                <FieldRow label="Allow escalation">
                                    <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={harness.allowEscalation}
                                            onChange={(e) => updateHarness({ allowEscalation: e.target.checked })}
                                            className="pktw-rounded pktw-border-pk-border"
                                        />
                                        <span className="pktw-text-xs pktw-text-pk-foreground-faint">
                                            Auto-upgrade to the next tier on low confidence
                                        </span>
                                    </label>
                                </FieldRow>
                                <FieldRow label="Max escalations / loop">
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
                                <FieldRow label="Auto-escalate threshold">
                                    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full">
                                        <input
                                            type="range" step="0.05" min="0" max="1"
                                            disabled={!harness.allowEscalation}
                                            className={cn('pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--pk-accent)]', !harness.allowEscalation && 'pktw-opacity-40 pktw-cursor-not-allowed')}
                                            value={harness.autoEscalateScoreBelow}
                                            onChange={(e) => updateHarness({ autoEscalateScoreBelow: parseFloat(e.target.value) })}
                                        />
                                        <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-10 pktw-text-right pktw-font-mono">
                                            {harness.autoEscalateScoreBelow.toFixed(2)}
                                        </span>
                                    </div>
                                </FieldRow>
                            </div>
                        </div>

                        {/* SDK Settings moved to Advanced tab → Developer
                            disclosure (PR-5). Keeping the persistence layer
                            wired in case any power user is editing JSON. */}
                    </div>
                )}
            </div>

        </div>
    );
}
