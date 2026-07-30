/**
 * Advanced tab — the only place internal vocabulary ("Harness", runtime
 * backend selectors, hooks DSL, and diagnostics) surfaces.
 *
 * Sections: Re-run setup wizard banner · Storage and folders · Maintenance · Developer.
 */

import React from 'react';
import { Bug, Cog, FileText, Folder, HardDrive, Inbox, MessageSquare, Microscope, Palette, Sparkles, User, Wand2, type LucideIcon } from 'lucide-react';
import { Row, FormRow, FormGrid, Button } from '@/ui/components/primitives';
import { Input } from '@/ui/component/shared-ui/input';
import { Switch } from '@/ui/component/shared-ui/switch';
import { useServiceContext } from '@/ui/context/ServiceContext';
import {
    DEFAULT_DEBUG_TRACE_SETTINGS,
    normalizeCodeBlockTheme,
    type CodeBlockThemeId,
    type DebugTraceSettings,
} from '@/core/config/settingsTypes';
import {
	AI_PATH_SUBFOLDERS,
	getAIAnalysisFolder,
	getAICustomPromptsFolder,
	getAIDataStoreFolder,
	getAIInboxFolder,
	getAISkillsFolder,
} from '@/core/config/folderPaths';
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
                        <span className="pktw-text-pk-sm pktw-text-pk-foreground-faint">
                            Let the setup assistant re-pick tier bindings from your current environment.
                        </span>
                    </div>
                    <Button size="sm" onClick={settingsActions.setup.openHarnessWizard}>Run</Button>
                </div>
            </SettingsSection>

            <SettingsSection
                title={advCopy.storage.sectionTitle}
                sub="Peak keeps plugin-owned folders under the chat root by default. Advanced users can override individual paths below."
            >
                <StorageSection settings={settings} settingsUpdates={settingsUpdates} />
            </SettingsSection>

            <SettingsSection title={advCopy.appearance.sectionTitle} sub={advCopy.appearance.sectionSub}>
                <div className="pkset-row-list">
                    <SettingsRow
                        icon={Palette}
                        title={advCopy.appearance.codeTheme.title}
                        desc={advCopy.appearance.codeTheme.desc}
                        right={
                            <select
                                className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                                value={normalizeCodeBlockTheme(settings.codeBlockTheme)}
                                onChange={(e) => settingsUpdates.update('codeBlockTheme', e.target.value as CodeBlockThemeId)}
                            >
                                <option value="github-dark">{advCopy.appearance.codeTheme.options.githubDark}</option>
                                <option value="one-dark-pro">{advCopy.appearance.codeTheme.options.oneDarkPro}</option>
                                <option value="nord">{advCopy.appearance.codeTheme.options.nord}</option>
                                <option value="dracula">{advCopy.appearance.codeTheme.options.dracula}</option>
                                <option value="vitesse-dark">{advCopy.appearance.codeTheme.options.vitesseDark}</option>
                            </select>
                        }
                    />
                </div>
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
                <DebugTracesSection settings={settings} settingsUpdates={settingsUpdates} />
            </SettingsSection>
        </div>
    );
}

/* Developer → Debug traces */

function DebugTracesSection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const dt: DebugTraceSettings = settings.debugTrace ?? DEFAULT_DEBUG_TRACE_SETTINGS;
    const { debugTracePort } = useServiceContext();

    const update = <K extends keyof DebugTraceSettings>(key: K, value: DebugTraceSettings[K]) => {
        const next: DebugTraceSettings = { ...dt, [key]: value };
        // includeRawContent is only meaningful in raw mode; auto-clear it
        // when leaving raw so the setting can't quietly re-enable next time.
        if (key === 'mode' && value !== 'raw' && next.includeRawContent) {
            next.includeRawContent = false;
        }
        settingsUpdates.update('debugTrace', next);
        // Propagate to the live recorder if the composition layer wired one.
        if (key === 'mode') debugTracePort?.setMode(value as DebugTraceSettings['mode']);
    };

    return (
        <SettingsDisclosure
            icon={Bug}
            title="Debug traces"
            desc="Per-run receipts (chat / search / agent / ambient / analyze). Off by default; enable for troubleshooting."
            meta={dt.mode === 'off' ? 'Off' : dt.mode === 'redacted' ? 'Redacted' : 'Full local'}
        >
            <div className="pkset-row-list">
                <SettingsRow
                    icon={Bug}
                    title="Mode"
                    desc="Redacted keeps excerpts + hashes; Full local keeps raw payloads (secrets still scrubbed)."
                    right={
                        <select
                            className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                            value={dt.mode}
                            onChange={(e) => update('mode', e.target.value as DebugTraceSettings['mode'])}
                        >
                            <option value="off">Off</option>
                            <option value="redacted">Redacted (recommended)</option>
                            <option value="raw">Full local (warn)</option>
                        </select>
                    }
                />
                <SettingsRow
                    icon={Cog}
                    title="Retention"
                    desc="How many finished runs to keep in memory."
                    right={
                        <select
                            className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                            value={String(dt.retention)}
                            onChange={(e) => {
                                const raw = e.target.value;
                                const next: DebugTraceSettings['retention'] =
                                    raw === '20' ? 20 : raw === '100' ? 100 : 'session';
                                update('retention', next);
                            }}
                        >
                            <option value="20">Last 20</option>
                            <option value="100">Last 100</option>
                            <option value="session">Session (clear on restart)</option>
                        </select>
                    }
                />
                <SettingsRow
                    icon={FileText}
                    title="Copy format"
                    desc="Format used when copying a receipt to the clipboard."
                    right={
                        <select
                            className="pktw-text-sm pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5"
                            value={dt.copyFormat}
                            onChange={(e) => update('copyFormat', e.target.value as DebugTraceSettings['copyFormat'])}
                        >
                            <option value="markdown">Markdown</option>
                            <option value="json">JSON</option>
                            <option value="both">Both (Markdown + JSON appendix)</option>
                        </select>
                    }
                />
                {dt.mode === 'raw' && (
                    <>
                        <SettingsRow
                            icon={Bug}
                            title="Include raw content in copies"
                            desc="Prompt / context / tool payload text is embedded in the receipt. Do NOT share verbatim."
                            right={<Switch checked={dt.includeRawContent} onChange={(v) => update('includeRawContent', v)} />}
                        />
                        <div className="pktw-text-pk-sm pktw-text-pk-warning pktw-px-3">
                            Full local retains raw prompt / context / tool arguments. It may include vault content and account information. Do not share Full-local receipts.
                        </div>
                    </>
                )}
                <SettingsRow
                    icon={Cog}
                    title="Clear all debug traces"
                    desc="Remove every retained run from memory. This is safe and reversible only by re-running the surface."
                    right={
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => debugTracePort?.clearAll()}
                        >
                            Clear
                        </Button>
                    }
                />
            </div>
        </SettingsDisclosure>
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
    const dataStoreFolder = settings.dataStorageFolder || getAIDataStoreFolder(chatRoot);

    const derived: Array<{ icon: LucideIcon; title: string; desc: string; value: string }> = [
        { icon: FileText, title: 'Prompts', desc: 'Built-in agent prompts.', value: derivedPath(AI_PATH_SUBFOLDERS.Prompts) },
        { icon: Folder, title: 'Custom prompts', desc: 'User-authored Copilot prompt actions.', value: settings.customPromptsFolder ?? getAICustomPromptsFolder(chatRoot) },
        { icon: Sparkles, title: 'Skills', desc: 'User-authored agent skill packs.', value: settings.skillsFolder ?? getAISkillsFolder(chatRoot) },
        { icon: Inbox, title: 'Inbox', desc: 'Quick captures and ambient suggestions.', value: settings.inboxFolder ?? getAIInboxFolder(chatRoot) },
        { icon: FileText, title: 'Attachments', desc: 'Files uploaded via chat.', value: derivedPath(AI_PATH_SUBFOLDERS.Attachments) },
        { icon: Microscope, title: 'AI Analysis output', desc: 'Saved AI Analysis runs.', value: settings.search.aiAnalysisAutoSaveFolder ?? getAIAnalysisFolder(chatRoot) },
        { icon: FileText, title: 'Resources summary cache', desc: 'Per-resource summaries cached for retrieval.', value: derivedPath(AI_PATH_SUBFOLDERS.ResourcesSummary) },
        { icon: FileText, title: 'Hub summaries', desc: 'Generated hub-note summaries.', value: derivedPath(AI_PATH_SUBFOLDERS.HubSummaries) },
        { icon: User, title: 'User profile', desc: 'LLM-derived user profile note.', value: derivedPath(AI_PATH_SUBFOLDERS.UserProfile) },
        { icon: HardDrive, title: 'DataStore', desc: 'SQLite database and plugin data.', value: dataStoreFolder },
    ];

    const overrides: Array<{ icon: LucideIcon; title: string; desc: string; value: string; placeholder: string; onChange: (v: string) => void }> = [
        { icon: Microscope, title: 'AI Analysis output', desc: 'Saved AI Analysis runs.', value: settings.search.aiAnalysisAutoSaveFolder ?? getAIAnalysisFolder(chatRoot), placeholder: getAIAnalysisFolder(chatRoot), onChange: (v) => updateSearch('aiAnalysisAutoSaveFolder', v) },
        { icon: Sparkles, title: 'Skills folder', desc: 'Vault folder Peak scans for skill packs.', value: settings.skillsFolder ?? getAISkillsFolder(chatRoot), placeholder: getAISkillsFolder(chatRoot), onChange: (v) => update('skillsFolder', v) },
        { icon: Inbox, title: 'Inbox folder', desc: 'Quick captures and ambient suggestions.', value: settings.inboxFolder ?? getAIInboxFolder(chatRoot), placeholder: getAIInboxFolder(chatRoot), onChange: (v) => update('inboxFolder', v) },
        { icon: Folder, title: 'Custom prompts folder', desc: 'Where Peak picks up your hand-written prompt templates.', value: settings.customPromptsFolder ?? getAICustomPromptsFolder(chatRoot), placeholder: getAICustomPromptsFolder(chatRoot), onChange: (v) => update('customPromptsFolder', v) },
    ];

    return (
        <div className="pkset-row-list">
            <SettingsRow
                icon={HardDrive}
                title="Data storage folder"
                desc="SQLite database + plugin data. Defaults under the chat root; override only if you want it elsewhere."
                right={
                    <div className="pktw-w-56">
                        <Input
                            value={dataStoreFolder}
                            placeholder={getAIDataStoreFolder(chatRoot)}
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
                desc="Auto-generated paths and advanced override targets."
                meta="10 paths"
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

export type { HarnessSettings };
