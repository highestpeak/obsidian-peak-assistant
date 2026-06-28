/**
 * Advanced tab — the only place internal vocabulary ("Harness", runtime
 * backend selectors, hooks DSL, diagnostics, SDK process) surfaces.
 *
 * Sections: Re-run setup wizard banner · Storage and folders · Maintenance · Developer.
 */

import React, { useState } from 'react';
import { Cog, FileText, Folder, HardDrive, Inbox, MessageSquare, Microscope, Sparkles, User, Wand2, type LucideIcon } from 'lucide-react';
import { Row, FormRow, FormGrid, Button } from '@/ui/components/primitives';
import { Input } from '@/ui/component/shared-ui/input';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { Switch } from '@/ui/component/shared-ui/switch';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AI_PATH_SUBFOLDERS } from '@/core/config/folderPaths';
import type { MyPluginSettings, HarnessSettings } from '@/core/config/settingsTypes';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import { MaintenanceTab } from '../MaintenanceTab';
import { useSettingsStrings } from '../settingsStrings';
import { SettingsRow, SettingsDisclosure, SettingsSection } from '../components/SettingsRow';

interface AdvancedTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function AdvancedTab({ settings, settingsUpdates }: AdvancedTabProps) {
    const strings = useSettingsStrings();
    const advCopy = strings.advanced;
    const { settingsActions } = useServiceContext();

    return (
        <div className="pkset-panel">
            <SettingsSection>
                <div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-accent pktw-bg-pk-accent-tint">
                    <Wand2 className="pktw-w-4 pktw-h-4 pktw-shrink-0 pktw-mt-0.5 pktw-text-pk-accent" />
                    <div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-0.5">
                        <span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">Re-run setup wizard</span>
                        <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                            Let the setup assistant re-pick tier bindings from your current environment.
                        </span>
                    </div>
                    <Button size="sm" onClick={settingsActions.setup.openHarnessWizard}>Run</Button>
                </div>
            </SettingsSection>

            <SettingsSection
                title={advCopy.general.sectionTitle}
                sub="Two primary folders. Everything else (Prompts, Attachments, Hub-Summaries, AI Analysis output, Skills, Inbox, Custom prompts) lives under them and can be overridden below."
            >
                <StorageSection settings={settings} settingsUpdates={settingsUpdates} />
            </SettingsSection>

            <SettingsSection title="Maintenance" sub="Manual operations Peak does not run automatically.">
                <MaintenanceTab />
            </SettingsSection>

            <SettingsSection title="Developer" sub="Power-user knobs. Most users should not change these.">
                <div className="pkset-row-list">
                    <SettingsRow
                        icon={Cog}
                        title="Attachment handling"
                        desc="How attachments are sent to the model. Direct needs vision support; Degrade to text uses OCR."
                        right={
                            <select
                                className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                                value={settings.ai?.attachmentHandlingDefault ?? 'direct'}
                                onChange={(e) =>
                                    settingsUpdates.updateAI(
                                        'attachmentHandlingDefault',
                                        e.target.value as 'direct' | 'degrade_to_text',
                                    )
                                }
                            >
                                <option value="direct">Direct (send raw)</option>
                                <option value="degrade_to_text">Degrade to text (OCR)</option>
                            </select>
                        }
                    />
                    <SettingsRow
                        icon={Cog}
                        title="DevTools graph inspector"
                        desc={<>Exposes <code>window.testGraphTools</code> in DevTools console for graph testing.</>}
                        right={<Switch checked={settings.enableDevTools ?? false} onChange={(v) => settingsUpdates.update('enableDevTools', v)} />}
                    />
                </div>
                <SdkProcessDisclosure settings={settings} settingsUpdates={settingsUpdates} />
            </SettingsSection>
        </div>
    );
}

/* StorageSection — canonical home for ALL folder configuration. */

function StorageSection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { update, updateAI, updateSearch } = settingsUpdates;
    const chatRoot = settings.ai.rootFolder.trim() || 'ChatFolder';
    const derivedPath = (subPath: string) => `${chatRoot.replace(/\/+$/, '')}/${subPath}`;

    const derived: Array<{ icon: LucideIcon; title: string; desc: string; value: string }> = [
        { icon: FileText, title: 'Prompts', desc: 'Built-in agent prompts.', value: derivedPath(AI_PATH_SUBFOLDERS.Prompts) },
        { icon: FileText, title: 'Attachments', desc: 'Files uploaded via chat.', value: derivedPath(AI_PATH_SUBFOLDERS.Attachments) },
        { icon: FileText, title: 'Resources summary cache', desc: 'Per-resource summaries cached for retrieval.', value: derivedPath(AI_PATH_SUBFOLDERS.ResourcesSummary) },
        { icon: FileText, title: 'Hub summaries', desc: 'Generated hub-note summaries.', value: derivedPath(AI_PATH_SUBFOLDERS.HubSummaries) },
        { icon: User, title: 'User profile', desc: 'LLM-derived user profile note.', value: derivedPath(AI_PATH_SUBFOLDERS.UserProfile) },
    ];

    const overrides: Array<{ icon: LucideIcon; title: string; desc: string; value: string; placeholder: string; onChange: (v: string) => void }> = [
        { icon: Microscope, title: 'AI Analysis output', desc: 'Saved AI Analysis runs.', value: settings.search.aiAnalysisAutoSaveFolder ?? 'ChatFolder/AI-Analysis', placeholder: 'ChatFolder/AI-Analysis', onChange: (v) => updateSearch('aiAnalysisAutoSaveFolder', v) },
        { icon: Sparkles, title: 'Skills folder', desc: 'Vault folder Peak scans for skill packs.', value: settings.skillsFolder ?? '_skills', placeholder: '_skills', onChange: (v) => update('skillsFolder', v) },
        { icon: Inbox, title: 'Inbox folder', desc: 'Quick captures and ambient suggestions.', value: settings.inboxFolder ?? '_inbox', placeholder: '_inbox', onChange: (v) => update('inboxFolder', v) },
        { icon: Folder, title: 'Custom prompts folder', desc: 'Where Peak picks up your hand-written prompt templates.', value: settings.customPromptsFolder ?? '_prompts', placeholder: '_prompts', onChange: (v) => update('customPromptsFolder', v) },
    ];

    return (
        <div className="pkset-row-list">
            <SettingsRow
                icon={HardDrive}
                title="Data storage folder"
                desc="SQLite database + plugin data. Leave empty to use the plugin directory."
                right={
                    <div className="pktw-w-56">
                        <Input
                            value={settings.dataStorageFolder ?? ''}
                            placeholder="Leave empty for plugin directory"
                            onChange={(e) => update('dataStorageFolder', e.target.value.trim())}
                        />
                    </div>
                }
            />
            <SettingsRow
                icon={MessageSquare}
                title="Chat root folder"
                desc="Root for AI conversation data. Prompts, Attachments, Hub-Summaries and more derive from this folder automatically."
                right={
                    <div className="pktw-w-56">
                        <Input
                            value={settings.ai.rootFolder}
                            placeholder="ChatFolder"
                            onChange={(e) => updateAI('rootFolder', e.target.value)}
                        />
                    </div>
                }
            />

            <SettingsDisclosure
                icon={Folder}
                title="Derived folders"
                desc="Auto-generated paths and override-able vault folders."
                meta="9 paths"
            >
                <div className="pkset-row-list">
                    {derived.map((d) => (
                        <SettingsRow
                            key={d.title}
                            compact icon={d.icon} title={d.title} desc={d.desc}
                            right={<Row.Value>{d.value}</Row.Value>}
                        />
                    ))}
                    {overrides.map((o) => (
                        <SettingsRow
                            key={o.title}
                            compact icon={o.icon} title={o.title} desc={o.desc}
                            right={
                                <div className="pktw-w-48">
                                    <Input value={o.value} placeholder={o.placeholder} onChange={(e) => o.onChange(e.target.value)} />
                                </div>
                            }
                        />
                    ))}
                </div>
            </SettingsDisclosure>
        </div>
    );
}

/* Developer → SDK process disclosure */

function SdkProcessDisclosure({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const registry = ProfileRegistry.getInstance();
    const sdkSettings = registry.getSdkSettings();
    const [tick, setTick] = useState(0);
    void tick;

    const updateSdk = (
        field: 'cliPathOverride' | 'subprocessPoolSize' | 'warmupOnLoad',
        value: unknown,
    ) => {
        const current = registry.getSdkSettings();
        const updated = { ...current, [field]: value };
        settingsUpdates.update('profileSettings', {
            ...settings.profileSettings!,
            sdkSettings: updated,
        });
        setTick((t) => t + 1);
    };

    return (
        <SettingsDisclosure
            icon={Cog}
            title="SDK process"
            desc="Claude Agent SDK subprocess CLI path, pool size, and warmup."
            meta="3 fields"
        >
            <FormGrid style={{ padding: 4 }}>
                <FormRow>
                    <FormRow.Label>
                        CLI path override
                        <FormRow.LabelHint>Leave empty for the bundled SDK.</FormRow.LabelHint>
                    </FormRow.Label>
                    <FormRow.Control>
                        <FormRow.Input
                            type="text"
                            defaultValue={sdkSettings.cliPathOverride ?? ''}
                            placeholder="Leave empty for default"
                            onBlur={(e) => updateSdk('cliPathOverride', e.target.value || null)}
                        />
                    </FormRow.Control>
                </FormRow>
                <FormRow>
                    <FormRow.Label>
                        Pool size
                        <FormRow.LabelHint>How many subprocesses to keep alive.</FormRow.LabelHint>
                    </FormRow.Label>
                    <FormRow.Control>
                        <FormRow.Number
                            value={sdkSettings.subprocessPoolSize}
                            min={1}
                            max={10}
                            onChange={(e) =>
                                updateSdk('subprocessPoolSize', Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                        />
                    </FormRow.Control>
                </FormRow>
                <FormRow>
                    <FormRow.Label>
                        Warmup on load
                        <FormRow.LabelHint>Pre-warm an SDK subprocess when the plugin starts.</FormRow.LabelHint>
                    </FormRow.Label>
                    <FormRow.Control>
                        <Switch checked={sdkSettings.warmupOnLoad} onChange={(v) => updateSdk('warmupOnLoad', v)} />
                    </FormRow.Control>
                </FormRow>
            </FormGrid>
        </SettingsDisclosure>
    );
}

export type { HarnessSettings };
