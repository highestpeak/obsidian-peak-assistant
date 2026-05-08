import React, { useState, useEffect } from 'react';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { modelRegistry } from '@/core/providers/model-registry';
import { Plus, ChevronRight } from 'lucide-react';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { createPresetProfile } from '@/core/profiles/presets';
import type { ProfileKind, Profile } from '@/core/profiles/types';
import type { MyPluginSettings } from '@/app/settings/types';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import type { SdkSettings } from '@/core/profiles/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { StatusBar } from './components/StatusBar';
import { ProfileCard } from './components/ProfileCard';
import { AddProfileGrid } from './components/AddProfileGrid';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent/60 pktw-transition-colors';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="pktw-grid pktw-items-center pktw-gap-3" style={{ gridTemplateColumns: '160px 1fr' }}>
            <span className="pktw-text-xs pktw-text-pk-foreground-faint">{label}</span>
            {children}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfilesTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

// ---------------------------------------------------------------------------
// ProfilesTab
// ---------------------------------------------------------------------------

export function ProfilesTab({ settings, settingsUpdates }: ProfilesTabProps) {
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
    const activeAgentId = registry.getActiveAgentProfile()?.id ?? null;
    const activeEmbeddingId = registry.getActiveEmbeddingProfile()?.id ?? null;
    const activeWebSearchId = registry.getActiveWebSearchProfile()?.id ?? null;

    // --- Handlers ---

    const handleUpdate = (id: string, updates: Partial<Profile>) => {
        registry.updateProfile(id, updates);
        bump();
    };

    const handleDelete = (id: string) => {
        registry.deleteProfile(id);
        bump();
    };

    const handleToggleAgent = (id: string) => {
        registry.setActiveAgentProfile(activeAgentId === id ? null : id);
        bump();
    };

    const handleToggleEmbedding = (id: string) => {
        registry.setActiveEmbeddingProfile(activeEmbeddingId === id ? null : id);
        bump();
    };

    const handleToggleWebSearch = (id: string) => {
        registry.setActiveWebSearchProfile(activeWebSearchId === id ? null : id);
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
    const sdkSettings = registry.getSdkSettings();

    const updateOutputControl = (field: string, value: unknown) => {
        const current = settings.ai?.defaultOutputControl ?? {};
        settingsUpdates.updateAI('defaultOutputControl', { ...current, [field]: value } as LLMOutputControlSettings);
    };

    const updateSdk = (field: keyof SdkSettings, value: unknown) => {
        // SDK settings live in ProfileRegistry, but persisted through ProfileSettings
        // We update via the registry's internal mechanism by reading + updating
        const current = registry.getSdkSettings();
        const updated = { ...current, [field]: value };
        // ProfileRegistry doesn't expose setSdkSettings directly, so we go through settings
        settingsUpdates.update('profileSettings', {
            ...settings.profileSettings!,
            sdkSettings: updated,
        });
    };

    return (
        <div className="pktw-space-y-4">
            {/* Status bar */}
            <StatusBar />

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
                        isActiveAgent={p.id === activeAgentId}
                        isActiveEmbedding={p.id === activeEmbeddingId}
                        isActiveWebSearch={p.id === activeWebSearchId}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onToggleAgent={handleToggleAgent}
                        onToggleEmbedding={handleToggleEmbedding}
                        onToggleWebSearch={handleToggleWebSearch}
                        onToggleEnabled={handleToggleEnabled}
                    />
                ))}
            </div>

            {/* Add profile */}
            {showAddGrid ? (
                <AddProfileGrid onSelect={handleAdd} onCancel={() => setShowAddGrid(false)} />
            ) : (
                <Button
                    variant="outline"
                    className="pktw-w-full pktw-border-dashed pktw-border-pk-border pktw-text-pk-muted-foreground pktw-h-11 pktw-gap-1.5"
                    onClick={() => setShowAddGrid(true)}
                >
                    <Plus size={16} />
                    Add Profile
                </Button>
            )}

            {/* Advanced section */}
            <div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
                <div
                    className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent/5 pktw-transition-colors"
                    onClick={() => setAdvancedOpen((v) => !v)}
                >
                    <ChevronRight
                        size={14}
                        className={cn(
                            'pktw-text-pk-muted-foreground pktw-transition-transform pktw-duration-200',
                            advancedOpen && 'pktw-rotate-90',
                        )}
                    />
                    <span className="pktw-text-sm pktw-font-medium">Advanced</span>
                </div>

                {advancedOpen && (
                    <div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-5">
                        {/* LLM Output Control */}
                        <div className="pktw-mt-4">
                            <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                                LLM Output Control
                            </span>
                            <div className="pktw-space-y-2.5 pktw-mt-2.5">
                                <FieldRow label="Temperature">
                                    <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-w-full">
                                        <div className="pktw-flex pktw-items-center pktw-gap-2">
                                            <input type="range" step="0.1" min="0" max="2"
                                                className="pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--interactive-accent)]"
                                                value={outputControl.temperature ?? 1}
                                                onChange={(e) => updateOutputControl('temperature', parseFloat(e.target.value))}
                                            />
                                            <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
                                                {(outputControl.temperature ?? 1).toFixed(1)}
                                            </span>
                                        </div>
                                        <span className="pktw-text-[10px] pktw-text-pk-foreground-faint">Lower = more focused, higher = more creative</span>
                                    </div>
                                </FieldRow>
                                <FieldRow label="Top P">
                                    <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-w-full">
                                        <div className="pktw-flex pktw-items-center pktw-gap-2">
                                            <input type="range" step="0.05" min="0" max="1"
                                                className="pktw-flex-1 pktw-h-1.5 pktw-accent-[var(--interactive-accent)]"
                                                value={outputControl.topP ?? 0.9}
                                                onChange={(e) => updateOutputControl('topP', parseFloat(e.target.value))}
                                            />
                                            <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
                                                {(outputControl.topP ?? 0.9).toFixed(2)}
                                            </span>
                                        </div>
                                        <span className="pktw-text-[10px] pktw-text-pk-foreground-faint">Nucleus sampling threshold</span>
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

                        {/* SDK Settings */}
                        <div>
                            <span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint">
                                SDK Settings
                            </span>
                            <div className="pktw-space-y-2.5 pktw-mt-2.5">
                                <FieldRow label="CLI Path Override">
                                    <input
                                        className={INPUT_CLS}
                                        defaultValue={sdkSettings.cliPathOverride ?? ''}
                                        placeholder="Leave empty for default"
                                        onBlur={(e) => updateSdk('cliPathOverride', e.target.value || null)}
                                    />
                                </FieldRow>
                                <FieldRow label="Pool Size">
                                    <input
                                        type="number" min="1" max="10"
                                        className={INPUT_CLS}
                                        value={sdkSettings.subprocessPoolSize}
                                        onChange={(e) => updateSdk('subprocessPoolSize', parseInt(e.target.value, 10) || 1)}
                                    />
                                </FieldRow>
                                <FieldRow label="Warmup on Load">
                                    <label className="pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={sdkSettings.warmupOnLoad}
                                            onChange={(e) => updateSdk('warmupOnLoad', e.target.checked)}
                                            className="pktw-rounded pktw-border-pk-border"
                                        />
                                        <span className="pktw-text-xs pktw-text-pk-foreground-faint">Pre-warm subprocess on plugin load</span>
                                    </label>
                                </FieldRow>
                            </div>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
