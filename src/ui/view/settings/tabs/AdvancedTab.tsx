/**
 * Advanced tab (PR-5, 2026-06-07).
 *
 * Per spec, the Advanced tab is the ONLY place internal vocabulary ("Harness",
 * runtime backend selectors, hooks DSL, diagnostics, SDK process) is allowed
 * to surface.
 *
 * Section order (mock-aligned):
 *   1. Agent runtime        — HarnessSettingsSection (carries Re-run banner)
 *   2. Storage and folders  — GeneralTab content
 *   3. Maintenance          — Index / Knowledge graph / Verification + Danger
 *   4. Developer            — SDK process disclosure (more disclosures
 *                              land with PR-5 follow-ups: Graph viz, Legacy)
 *
 * Removed in this PR:
 *   - The duplicate Re-run setup wizard banner that previously sat above
 *     HarnessSettingsSection (HarnessSettingsSection has its own).
 *   - The "Prompt Templates" section — not in mock IA.
 *   - The "Diagnostics" hero — Maintenance is the canonical name.
 */

import React, { useState } from 'react';
import { ChevronDown, Cog, FileText, Folder, HardDrive, Inbox, MessageSquare, Microscope, Sparkles, User, Wand2 } from 'lucide-react';
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
            {/* ── Re-run setup wizard (banner) ──────────────────────── */}
            <div className="pkset-section">
                <div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-accent pktw-bg-pk-accent-tint">
                    <Wand2 className="pktw-w-4 pktw-h-4 pktw-shrink-0 pktw-mt-0.5 pktw-text-pk-accent" />
                    <div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-0.5">
                        <span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">
                            Re-run setup wizard
                        </span>
                        <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                            Let the setup assistant re-pick tier bindings from your current
                            environment.
                        </span>
                    </div>
                    <Button size="sm" onClick={settingsActions.setup.openHarnessWizard}>
                        Run
                    </Button>
                </div>
            </div>

            {/* Safety moved to AI Setup — it gates how AI agents handle
                writes, which is an AI-behavior concern rather than runtime
                housekeeping. */}

            {/* ── Storage and folders ───────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">{advCopy.general.sectionTitle}</span>
                    <span className="pkset-section__sub">
                        Two primary folders. Everything else (Prompts, Attachments, Hub-Summaries,
                        AI Analysis output, Skills, Inbox, Custom prompts) lives under them and
                        can be overridden below.
                    </span>
                </div>
                <StorageSection settings={settings} settingsUpdates={settingsUpdates} />
            </div>

            {/* ── Maintenance ───────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">Maintenance</span>
                    <span className="pkset-section__sub">
                        Manual operations Peak does not run automatically.
                    </span>
                </div>
                <MaintenanceTab />
            </div>

            {/* ── Developer ─────────────────────────────────────────── */}
            <div className="pkset-section">
                <div className="pkset-section__head">
                    <span className="pkset-section__title">Developer</span>
                    <span className="pkset-section__sub">
                        Power-user knobs. Most users should not change these.
                    </span>
                </div>
                <div className="pkset-row-list">
                    <Row>
                        <Row.Icon><Cog size={16} /></Row.Icon>
                        <Row.Body>
                            <Row.Title>Attachment handling</Row.Title>
                            <Row.Desc>
                                How attachments are sent to the model. Direct needs vision
                                support; Degrade to text uses OCR.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
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
                        </Row.Right>
                    </Row>
                    <Row>
                        <Row.Icon><Cog size={16} /></Row.Icon>
                        <Row.Body>
                            <Row.Title>DevTools graph inspector</Row.Title>
                            <Row.Desc>
                                Exposes <code>window.testGraphTools</code> in DevTools console for
                                graph testing.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Switch
                                checked={settings.enableDevTools ?? false}
                                onChange={(v) => settingsUpdates.update('enableDevTools', v)}
                            />
                        </Row.Right>
                    </Row>
                </div>
                <SdkProcessDisclosure
                    settings={settings}
                    settingsUpdates={settingsUpdates}
                />
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * StorageSection — canonical home for ALL folder configuration.
 *
 * Two primary inputs (Data Storage Folder, Chat Root Folder) at the top.
 * A `Derived folders` disclosure shows every path computed from those two
 * roots, plus the vault-level folders (AI Analysis output, Skills, Inbox,
 * Custom prompts) that previously lived in Tools / Knowledge Index.
 * Computed paths under the chat root use the AI_PATH_SUBFOLDERS map and
 * are read-only here; override-able folders show an input.
 * ───────────────────────────────────────────────────────────────────────── */

function StorageSection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { update, updateAI, updateSearch } = settingsUpdates;
    const [derivedOpen, setDerivedOpen] = useState(false);
    const chatRoot = settings.ai.rootFolder.trim() || 'ChatFolder';

    const derivedPath = (subPath: string) =>
        `${chatRoot.replace(/\/+$/, '')}/${subPath}`;

    return (
        <div className="pkset-row-list">
            {/* Primary 1: Data storage folder */}
            <Row>
                <Row.Icon>
                    <HardDrive size={16} />
                </Row.Icon>
                <Row.Body>
                    <Row.Title>Data storage folder</Row.Title>
                    <Row.Desc>
                        SQLite database + plugin data. Leave empty to use the plugin directory.
                    </Row.Desc>
                </Row.Body>
                <Row.Right>
                    <div className="pktw-w-56">
                        <Input
                            value={settings.dataStorageFolder ?? ''}
                            placeholder="Leave empty for plugin directory"
                            onChange={(e) => update('dataStorageFolder', e.target.value.trim())}
                        />
                    </div>
                </Row.Right>
            </Row>

            {/* Primary 2: Chat root folder */}
            <Row>
                <Row.Icon>
                    <MessageSquare size={16} />
                </Row.Icon>
                <Row.Body>
                    <Row.Title>Chat root folder</Row.Title>
                    <Row.Desc>
                        Root for AI conversation data. Prompts, Attachments, Hub-Summaries and
                        more derive from this folder automatically.
                    </Row.Desc>
                </Row.Body>
                <Row.Right>
                    <div className="pktw-w-56">
                        <Input
                            value={settings.ai.rootFolder}
                            placeholder="ChatFolder"
                            onChange={(e) => updateAI('rootFolder', e.target.value)}
                        />
                    </div>
                </Row.Right>
            </Row>

            {/* Derived folders disclosure */}
            <details>
                <summary>
                    <Row disclosure>
                        <Row.Icon>
                            <Folder size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>Derived folders</Row.Title>
                            <Row.Desc>
                                Auto-generated paths and override-able vault folders.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Row.Meta>9 paths</Row.Meta>
                            <ChevronDown
                                size={14}
                                style={{ color: 'var(--pk-text-tertiary)' }}
                            />
                        </Row.Right>
                    </Row>
                </summary>
                <div className="pk-disclosure-body">
                    <div className="pkset-row-list">
                        {/* Computed paths under chat root — read-only */}
                        <DerivedRow
                            icon={FileText}
                            title="Prompts"
                            desc="Built-in agent prompts."
                            value={derivedPath(AI_PATH_SUBFOLDERS.Prompts)}
                        />
                        <DerivedRow
                            icon={FileText}
                            title="Attachments"
                            desc="Files uploaded via chat."
                            value={derivedPath(AI_PATH_SUBFOLDERS.Attachments)}
                        />
                        <DerivedRow
                            icon={FileText}
                            title="Resources summary cache"
                            desc="Per-resource summaries cached for retrieval."
                            value={derivedPath(AI_PATH_SUBFOLDERS.ResourcesSummary)}
                        />
                        <DerivedRow
                            icon={FileText}
                            title="Hub summaries"
                            desc="Generated hub-note summaries."
                            value={derivedPath(AI_PATH_SUBFOLDERS.HubSummaries)}
                        />
                        <DerivedRow
                            icon={User}
                            title="User profile"
                            desc="LLM-derived user profile note."
                            value={derivedPath(AI_PATH_SUBFOLDERS.UserProfile)}
                        />

                        {/* Override-able vault folders — editable. Default
                            placeholders match the legacy values used in
                            Tools / Knowledge Index before consolidation. */}
                        <OverrideRow
                            icon={Microscope}
                            title="AI Analysis output"
                            desc="Saved AI Analysis runs."
                            value={
                                settings.search.aiAnalysisAutoSaveFolder ??
                                'ChatFolder/AI-Analysis'
                            }
                            placeholder="ChatFolder/AI-Analysis"
                            onChange={(v) => updateSearch('aiAnalysisAutoSaveFolder', v)}
                        />
                        <OverrideRow
                            icon={Sparkles}
                            title="Skills folder"
                            desc="Vault folder Peak scans for skill packs."
                            value={settings.skillsFolder ?? '_skills'}
                            placeholder="_skills"
                            onChange={(v) => update('skillsFolder', v)}
                        />
                        <OverrideRow
                            icon={Inbox}
                            title="Inbox folder"
                            desc="Quick captures and ambient suggestions."
                            value={settings.inboxFolder ?? '_inbox'}
                            placeholder="_inbox"
                            onChange={(v) => update('inboxFolder', v)}
                        />
                        <OverrideRow
                            icon={Folder}
                            title="Custom prompts folder"
                            desc="Where Peak picks up your hand-written prompt templates."
                            value={settings.customPromptsFolder ?? '_prompts'}
                            placeholder="_prompts"
                            onChange={(v) => update('customPromptsFolder', v)}
                        />
                    </div>
                </div>
            </details>
        </div>
    );
}

function DerivedRow({
    icon: Icon,
    title,
    desc,
    value,
}: {
    icon: React.ElementType;
    title: string;
    desc: string;
    value: string;
}) {
    return (
        <Row compact>
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{title}</Row.Title>
                <Row.Desc>{desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <Row.Value>{value}</Row.Value>
            </Row.Right>
        </Row>
    );
}

function OverrideRow({
    icon: Icon,
    title,
    desc,
    value,
    placeholder,
    onChange,
}: {
    icon: React.ElementType;
    title: string;
    desc: string;
    value: string;
    placeholder: string;
    onChange: (next: string) => void;
}) {
    return (
        <Row compact>
            <Row.Icon>
                <Icon size={16} />
            </Row.Icon>
            <Row.Body>
                <Row.Title>{title}</Row.Title>
                <Row.Desc>{desc}</Row.Desc>
            </Row.Body>
            <Row.Right>
                <div className="pktw-w-48">
                    <Input
                        value={value}
                        placeholder={placeholder}
                        onChange={(e) => onChange(e.target.value)}
                    />
                </div>
            </Row.Right>
        </Row>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Developer → SDK process disclosure
 *
 * Moved here from AI Setup → Advanced model controls (PR-2 cut). Same data
 * path: persisted through `settings.profileSettings.sdkSettings`, read via
 * `ProfileRegistry.getSdkSettings()`.
 * ───────────────────────────────────────────────────────────────────────── */

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
        <details>
            <summary>
                <Row disclosure>
                    <Row.Icon>
                        <Cog size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>SDK process</Row.Title>
                        <Row.Desc>
                            Claude Agent SDK subprocess CLI path, pool size, and warmup.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <span className="pk-row__meta">3 fields</span>
                        <ChevronDown size={14} style={{ color: 'var(--pk-text-tertiary)' }} />
                    </Row.Right>
                </Row>
            </summary>
            <div className="pk-disclosure-body">
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
                                    updateSdk(
                                        'subprocessPoolSize',
                                        Math.max(1, parseInt(e.target.value, 10) || 1),
                                    )
                                }
                            />
                        </FormRow.Control>
                    </FormRow>
                    <FormRow>
                        <FormRow.Label>
                            Warmup on load
                            <FormRow.LabelHint>
                                Pre-warm an SDK subprocess when the plugin starts.
                            </FormRow.LabelHint>
                        </FormRow.Label>
                        <FormRow.Control>
                            <Switch
                                checked={sdkSettings.warmupOnLoad}
                                onChange={(v) => updateSdk('warmupOnLoad', v)}
                            />
                        </FormRow.Control>
                    </FormRow>
                </FormGrid>
            </div>
        </details>
    );
}
