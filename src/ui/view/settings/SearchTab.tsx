import React, { useState, useEffect } from 'react';
import { Database, Scissors, Sparkles, FileText } from 'lucide-react';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from './hooks/useSettingsUpdate';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { NumberInputWithConfirm } from '@/ui/component/shared-ui/number-input';
import { DocTypeGrid } from './components/DocTypeGrid';

interface SearchTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-4">
            <Icon className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-muted" />
            <span className="pktw-text-base pktw-font-bold pktw-text-foreground">{title}</span>
        </div>
    );
}

function SettingRow({ label, description, children }: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-4 pktw-py-2">
            <div className="pktw-flex-1 pktw-min-w-0">
                <span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{label}</span>
                {description && (
                    <span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">{description}</span>
                )}
            </div>
            <div className="pktw-flex-shrink-0">{children}</div>
        </div>
    );
}

export function SearchTab({ settings, settingsUpdates }: SearchTabProps) {
    const { updateSearch, updateChunking, updateDocumentType } = settingsUpdates;

    // Ignore patterns editing state
    const [editingPatterns, setEditingPatterns] = useState(false);
    const [patternsText, setPatternsText] = useState('');

    useEffect(() => {
        setPatternsText(settings.search.ignorePatterns?.join('\n') ?? '');
    }, [settings.search.ignorePatterns]);

    const saveIgnorePatterns = () => {
        const patterns = patternsText.split('\n').map(l => l.trim()).filter(Boolean);
        updateSearch('ignorePatterns', patterns);
        setEditingPatterns(false);
    };

    return (
        <div className="peak-settings-card pktw-space-y-8">
            {/* ── Indexing ── */}
            <section>
                <SectionHeading icon={Database} title="Indexing" />

                <SettingRow label="Auto-index on startup" description="Run FTS index when Obsidian opens">
                    <Switch
                        checked={settings.search.autoIndex}
                        onChange={(v) => updateSearch('autoIndex', v)}
                    />
                </SettingRow>

                <SettingRow label="Document types" description="File types included in the search index">
                    <span />
                </SettingRow>
                <DocTypeGrid
                    types={settings.search.includeDocumentTypes}
                    onToggle={(type, val) => updateDocumentType(type, val)}
                />

                <SettingRow label="Ignore patterns" description="Glob patterns to exclude (one per line)">
                    <Button variant="outline" size="sm" onClick={() => setEditingPatterns(!editingPatterns)}>
                        {editingPatterns ? 'Close' : 'Edit'}
                    </Button>
                </SettingRow>
                {editingPatterns && (
                    <div className="pktw-mt-1 pktw-space-y-2">
                        <textarea
                            value={patternsText}
                            onChange={(e) => setPatternsText(e.target.value)}
                            placeholder={'.git/\nnode_modules/\n*.tmp'}
                            className="pktw-w-full pktw-h-28 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-xs pktw-font-mono pktw-resize-vertical focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
                        />
                        <Button size="sm" onClick={saveIgnorePatterns}>Save</Button>
                    </div>
                )}
            </section>

            {/* ── Chunking ── */}
            <section>
                <SectionHeading icon={Scissors} title="Chunking" />

                <SettingRow label="Max chunk size" description="Maximum characters per chunk (default 1000)">
                    <div className="pktw-w-36">
                        <NumberInputWithConfirm
                            value={settings.search.chunking?.maxChunkSize ?? 1000}
                            onConfirm={(v) => updateChunking('maxChunkSize', v)}
                            min={1}
                            placeholder="1000"
                        />
                    </div>
                </SettingRow>

                <SettingRow label="Chunk overlap" description="Overlap characters between chunks (default 200)">
                    <div className="pktw-w-36">
                        <NumberInputWithConfirm
                            value={settings.search.chunking?.chunkOverlap ?? 200}
                            onConfirm={(v) => updateChunking('chunkOverlap', v)}
                            min={0}
                            placeholder="200"
                        />
                    </div>
                </SettingRow>
            </section>

            {/* ── AI Analysis ── */}
            <section>
                <SectionHeading icon={Sparkles} title="AI Analysis" />

                <SettingRow label="Auto-save results" description="Save completed analysis to vault">
                    <Switch
                        checked={settings.search.aiAnalysisAutoSaveEnabled ?? true}
                        onChange={(v) => updateSearch('aiAnalysisAutoSaveEnabled', v)}
                    />
                </SettingRow>

                <SettingRow label="Save folder" description="Vault-relative path for saved analyses">
                    <div className="pktw-w-48">
                        <Input
                            value={settings.search.aiAnalysisAutoSaveFolder ?? 'Analysis/AI Searches'}
                            onChange={(e) => updateSearch('aiAnalysisAutoSaveFolder', e.target.value)}
                            placeholder="Analysis/AI Searches"
                        />
                    </div>
                </SettingRow>

                <SettingRow label="Recent history limit" description="Items shown in Recent AI Analysis list">
                    <div className="pktw-w-36">
                        <NumberInputWithConfirm
                            value={settings.search.aiAnalysisHistoryLimit ?? 5}
                            onConfirm={(v) => updateSearch('aiAnalysisHistoryLimit', v)}
                            min={1}
                            max={50}
                            placeholder="5"
                        />
                    </div>
                </SettingRow>
            </section>

        </div>
    );
}
