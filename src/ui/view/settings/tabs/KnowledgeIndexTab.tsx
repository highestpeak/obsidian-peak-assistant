/**
 * Knowledge Index tab (PR-3, 2026-06-07).
 *
 * Full visual rewrite to match the mock at
 * docs/gstack/settings-redesign-2026-05-29/index.html#knowledgeIndex.
 *
 * Section order:
 *   1. Index readiness        — bordered panel, 5 rows + accent recommended row
 *   2. Index behavior         — segmented mode + auto-index + refresh interval +
 *                                document types + ignore patterns
 *   3. Search quality         — PageRank + Inspector links disclosure
 *   4. AI Analysis output     — auto-save + folder + history + exclude +
 *                                Summary lengths disclosure
 *   5. Advanced chunking      — disclosure (6 fields)
 *   6. Advanced rebuild       — disclosure (4 actions)
 *
 * Replaces the prior PR-D structure that embedded the legacy `SearchTab`
 * (ALL-CAPS muted SectionHeader + flat rows). The old `SearchTab.tsx` /
 * `SearchIndexSection.tsx` files are no longer referenced and will be
 * deleted in a follow-up cleanup PR.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Check,
    ChevronDown,
    Code,
    Cog,
    Database,
    FileText,
    Folder,
    HardDrive,
    LayoutDashboard,
    Microscope,
    RefreshCw,
    Search,
    Sparkles,
    X,
} from 'lucide-react';
import {
    Row,
    Chip,
    Pill,
    Button,
    Segmented,
    FormRow,
    FormGrid,
} from '@/ui/components/primitives';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Input } from '@/ui/component/shared-ui/input';
import { NumberInputWithConfirm } from '@/ui/component/shared-ui/number-input';
import { SettingsRow, SettingsDisclosure, SettingsSection } from '../components/SettingsRow';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { IndexLevel } from '@/core/search/indexTypes';
import type { DocumentType } from '@/core/document/types';
import type { MyPluginSettings, HarnessSettings } from '@/core/config/settingsTypes';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';

interface KnowledgeIndexTabProps {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}

export function KnowledgeIndexTab({ settings, settingsUpdates }: KnowledgeIndexTabProps) {
    return (
        <div className="pkset-panel">
            <IndexReadinessSection settings={settings} />
            <IndexBehaviorSection settings={settings} settingsUpdates={settingsUpdates} />
            <SearchQualitySection settings={settings} settingsUpdates={settingsUpdates} />
            <AIAnalysisSection settings={settings} settingsUpdates={settingsUpdates} />
            <AdvancedChunkingDisclosure settings={settings} settingsUpdates={settingsUpdates} />
            <AdvancedRebuildDisclosure />
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Index readiness
 * ───────────────────────────────────────────────────────────────────────── */

interface ReadinessSnapshot {
    storeReady: boolean;
    indexedDocs: number | null;
    totalDocs: number;
    missingChanged: number;
    semanticReady: boolean;
    mode: IndexLevel;
}

function IndexReadinessSection({ settings }: { settings: MyPluginSettings }) {
    const { settingsActions } = useServiceContext();
    const snap = useReadinessSnapshot(settings.search.indexLevel);
    const coveragePct =
        snap.indexedDocs != null && snap.totalDocs > 0
            ? Math.min(100, Math.round((snap.indexedDocs / snap.totalDocs) * 100))
            : null;

    return (
        <SettingsSection
            title="Index readiness"
            sub="Detected from your current vault and index state. Peak does not auto-rebuild."
        >
            <div className="pkset-readiness-panel">
                <SettingsRow
                    icon={HardDrive}
                    title="SQLite store"
                    desc="On-disk index database."
                    right={snap.storeReady ? (
                        <Chip variant="success">
                            <Check size={11} style={{ marginRight: 4 }} />
                            Ready
                        </Chip>
                    ) : (
                        <Chip variant="warning">
                            <AlertTriangle size={11} style={{ marginRight: 4 }} />
                            Not initialized
                        </Chip>
                    )}
                />
                <SettingsRow
                    icon={FileText}
                    title="Current index"
                    desc="Notes already indexed for search."
                    right={<>
                        <Row.Value>{snap.indexedDocs?.toLocaleString() ?? '—'} files</Row.Value>
                        {coveragePct !== null && <Row.Meta>{coveragePct}% coverage</Row.Meta>}
                    </>}
                />
                <SettingsRow
                    icon={AlertTriangle}
                    title="Missing or changed notes"
                    desc="Files that need an update to reflect current content."
                    right={snap.missingChanged > 0 ? (
                        <Chip variant="warning">
                            <AlertTriangle size={11} style={{ marginRight: 4 }} />
                            {snap.missingChanged} to update
                        </Chip>
                    ) : (
                        <Chip variant="success">
                            <Check size={11} style={{ marginRight: 4 }} />
                            Up to date
                        </Chip>
                    )}
                />
                <SettingsRow
                    icon={Sparkles}
                    title="Semantic readiness"
                    desc="Whether meaning-based search can run."
                    right={snap.semanticReady ? (
                        <Chip variant="success">
                            <Check size={11} style={{ marginRight: 4 }} />
                            Provider connected
                        </Chip>
                    ) : (
                        <Chip variant="neutral">No embedding provider</Chip>
                    )}
                />
                <SettingsRow
                    icon={LayoutDashboard}
                    title="Current mode"
                    desc="What kind of index Peak maintains right now."
                    right={<Row.Value>{formatIndexLevel(snap.mode)}</Row.Value>}
                />

                {snap.missingChanged > 0 && (
                    <div className="pkset-recommended-row">
                        <Row.Icon><RefreshCw size={16} /></Row.Icon>
                        <Row.Body>
                            <Row.Title>Recommended action</Row.Title>
                            <Row.Desc>Update changed notes</Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Button size="sm" onClick={() => void settingsActions.knowledgeIndex.startStagedFullIndexing()}>
                                <RefreshCw className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                                Update now
                            </Button>
                        </Row.Right>
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}

function useReadinessSnapshot(currentLevel: IndexLevel): ReadinessSnapshot {
    const { vaultStats } = useServiceContext();
    const [snap, setSnap] = useState<ReadinessSnapshot>({
        storeReady: false,
        indexedDocs: null,
        totalDocs: 0,
        missingChanged: 0,
        semanticReady: false,
        mode: currentLevel,
    });

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const storeReady = sqliteStoreManager.isInitialized();
            const totalDocs = vaultStats.markdownCount();
            const semanticReady =
                ProfileRegistry.getInstance().getActiveEmbeddingProfile() !== null;

            let indexedDocs: number | null = null;
            if (storeReady) {
                try {
                    const { IndexService } = await import('@/service/search/index/indexService');
                    const status = await IndexService.getInstance().getIndexStatus();
                    indexedDocs = status.indexedDocs;
                } catch {
                    indexedDocs = null;
                }
            }
            if (cancelled) return;

            const missingChanged =
                indexedDocs != null ? Math.max(0, totalDocs - indexedDocs) : 0;

            setSnap({
                storeReady,
                indexedDocs,
                totalDocs,
                missingChanged,
                semanticReady,
                mode: currentLevel,
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [currentLevel, vaultStats]);

    return snap;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Index level confirm banner — surfaces under the Index mode segmented
 * control whenever the user picks a new level. Persists + triggers staged
 * indexing only when the user explicitly confirms.
 * ───────────────────────────────────────────────────────────────────────── */

function IndexLevelConfirmBanner({
    from,
    to,
    onConfirm,
    onCancel,
}: {
    from: IndexLevel;
    to: IndexLevel;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const isUpgrade =
        (from === 'fast' && (to === 'semantic' || to === 'full')) ||
        (from === 'semantic' && to === 'full');
    return (
        <div
            className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-accent pktw-bg-pk-accent-tint"
            role="alert"
        >
            <AlertTriangle
                className="pktw-w-4 pktw-h-4 pktw-shrink-0 pktw-mt-0.5 pktw-text-pk-accent"
            />
            <div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-1">
                <span className="pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">
                    Switch to {formatIndexLevel(to)}?
                </span>
                <span className="pktw-text-[11px] pktw-text-pk-foreground-faint">
                    Currently {formatIndexLevel(from)}.{' '}
                    {isUpgrade
                        ? 'Confirming will start a staged re-index in the background and may take a while.'
                        : 'Confirming will switch the index mode immediately.'}
                </span>
            </div>
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-shrink-0">
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" onClick={onConfirm}>
                    Confirm
                </Button>
            </div>
        </div>
    );
}

function formatIndexLevel(level: IndexLevel): string {
    switch (level) {
        case 'fast':
            return 'Fast Index';
        case 'semantic':
            return 'Semantic Index';
        case 'full':
            return 'Full Knowledge Index';
    }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Index behavior
 * ───────────────────────────────────────────────────────────────────────── */

interface DocTypeChoice {
    key: DocumentType;
    label: string;
}

const DOC_TYPES: DocTypeChoice[] = [
    { key: 'markdown', label: 'Markdown' },
    { key: 'pdf', label: 'PDF' },
    { key: 'image', label: 'Images' },
    { key: 'excalidraw', label: 'Excalidraw' },
    { key: 'csv', label: 'CSV' },
    { key: 'json', label: 'JSON' },
    { key: 'html', label: 'HTML' },
    { key: 'docx', label: 'DOCX' },
    { key: 'xlsx', label: 'XLSX' },
    { key: 'pptx', label: 'PPTX' },
    { key: 'canvas', label: 'Canvas' },
    { key: 'url', label: 'URL' },
];

function IndexBehaviorSection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { settingsActions } = useServiceContext();
    const { updateSearch, updateDocumentType } = settingsUpdates;
    const [editingPatterns, setEditingPatterns] = useState(false);
    const [patternsText, setPatternsText] = useState('');
    const embeddingReady =
        ProfileRegistry.getInstance().getActiveEmbeddingProfile() !== null;

    useEffect(() => {
        setPatternsText(settings.search.ignorePatterns?.join('\n') ?? '');
    }, [settings.search.ignorePatterns]);

    const saveIgnorePatterns = () => {
        const patterns = patternsText
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        updateSearch('ignorePatterns', patterns);
        setEditingPatterns(false);
    };

    const currentLevel: IndexLevel = settings.search.indexLevel ?? 'fast';

    // Holds the user's pending segmented-control pick that has not been
    // confirmed yet. We do NOT persist or trigger reindex until the user
    // explicitly confirms in the banner below the row. This avoids the
    // foot-gun where a stray click into "Full Knowledge Index" silently
    // kicks off an expensive embedding + LLM-tagging pass.
    const [pendingLevel, setPendingLevel] = useState<IndexLevel | null>(null);

    const applyLevelChange = useCallback(
        (level: IndexLevel) => {
            void updateSearch('indexLevel', level);
            void settingsActions.knowledgeIndex.startStagedFullIndexing({ level }).catch((e) => {
                console.error('[KnowledgeIndexTab] Staged index after mode change failed:', e);
            });
        },
        [updateSearch, settingsActions],
    );

    const handleLevelPick = useCallback(
        (level: IndexLevel) => {
            if (level === currentLevel) {
                setPendingLevel(null);
                return;
            }
            if ((level === 'semantic' || level === 'full') && !embeddingReady) return;
            setPendingLevel(level);
        },
        [currentLevel, embeddingReady],
    );

    return (
        <SettingsSection title="Index behavior">
            <div className="pkset-row-list">
                <SettingsRow
                    icon={LayoutDashboard}
                    title="Index mode"
                    desc="Fast Index is local-only. Semantic and Full add meaning-based search and LLM tags."
                    right={
                        <Segmented<IndexLevel>
                            value={pendingLevel ?? currentLevel}
                            onValueChange={handleLevelPick}
                            options={[
                                { value: 'fast', label: 'Fast Index' },
                                { value: 'semantic', label: 'Semantic Index', disabled: !embeddingReady },
                                { value: 'full', label: 'Full Knowledge Index', disabled: !embeddingReady },
                            ]}
                            aria-label="Index mode"
                        />
                    }
                />

                {pendingLevel && (
                    <IndexLevelConfirmBanner
                        from={currentLevel}
                        to={pendingLevel}
                        onConfirm={() => {
                            const next = pendingLevel;
                            setPendingLevel(null);
                            applyLevelChange(next);
                        }}
                        onCancel={() => setPendingLevel(null)}
                    />
                )}

                <SettingsRow
                    icon={RefreshCw}
                    title="Auto-index on startup"
                    desc="Check for changed files when Obsidian launches."
                    right={<Switch checked={settings.search.autoIndex} onChange={(v) => updateSearch('autoIndex', v)} />}
                />
                <SettingsRow
                    icon={RefreshCw}
                    title="Refresh interval"
                    desc="How often Peak rechecks for changed files in the background."
                    right={
                        <FormRow.Number
                            value={Math.round((settings.search.indexRefreshInterval ?? 5000) / 1000)}
                            unit="sec"
                            min={1}
                            onChange={(e) => {
                                const sec = Math.max(1, parseInt(e.target.value, 10) || 5);
                                void updateSearch('indexRefreshInterval', sec * 1000);
                            }}
                        />
                    }
                />

                <div
                    className="pk-row"
                    style={{ gridTemplateColumns: '32px 1fr', alignItems: 'start', rowGap: 12 }}
                >
                    <Row.Icon><FileText size={16} /></Row.Icon>
                    <Row.Body>
                        <Row.Title>Document types</Row.Title>
                        <Row.Desc>Which file types Peak will read and index.</Row.Desc>
                    </Row.Body>
                    <div style={{ gridColumn: '2 / 3' }}>
                        <DocTypeChips
                            types={settings.search.includeDocumentTypes}
                            onToggle={updateDocumentType}
                        />
                    </div>
                </div>

                <SettingsRow
                    icon={X}
                    title="Ignore patterns"
                    desc="Glob patterns for files Peak should not index."
                    right={<>
                        <Row.Meta>{settings.search.ignorePatterns?.length ?? 0} patterns</Row.Meta>
                        <Pill onClick={() => setEditingPatterns((v) => !v)}>
                            {editingPatterns ? 'Close' : 'Edit'}
                        </Pill>
                    </>}
                />
            </div>

            {editingPatterns && (
                <div className="pktw-px-4 pktw-pt-2 pktw-pb-3 pktw-space-y-2">
                    <textarea
                        value={patternsText}
                        onChange={(e) => setPatternsText(e.target.value)}
                        placeholder={'.git/\nnode_modules/\n*.tmp'}
                        className="pktw-w-full pktw-h-28 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-xs pktw-font-mono pktw-resize-vertical focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
                    />
                    <Button size="sm" onClick={saveIgnorePatterns}>Save</Button>
                </div>
            )}
        </SettingsSection>
    );
}

function DocTypeChips({
    types,
    onToggle,
}: {
    types: Record<string, boolean>;
    onToggle: (type: string, value: boolean) => void;
}) {
    return (
        <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
            {DOC_TYPES.map(({ key, label }) => {
                const enabled = !!types[key];
                return (
                    <span
                        key={key}
                        data-selected={enabled ? 'true' : 'false'}
                        className="pk-pill"
                        onClick={() => onToggle(key, !enabled)}
                        style={{ cursor: 'pointer' }}
                    >
                        {label}
                    </span>
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Search quality
 * ───────────────────────────────────────────────────────────────────────── */

function SearchQualitySection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { updateSearch, updateInspectorLinks } = settingsUpdates;
    const inspector = settings.search.inspectorLinks ?? {
        keywordTopN: 8,
        tagTopN: 8,
        folderGroupingEnabled: true,
        folderGroupMinCount: 6,
        folderGroupMaxDepth: 4,
    };
    const summary = `Keyword ${inspector.keywordTopN} · Tag ${inspector.tagTopN} · Folders ${
        inspector.folderGroupingEnabled ? 'on' : 'off'
    }`;

    const numHandler = (key: 'keywordTopN' | 'tagTopN' | 'folderGroupMinCount' | 'folderGroupMaxDepth', min: number) =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            updateInspectorLinks(key, Math.max(min, parseInt(e.target.value, 10) || min));

    return (
        <SettingsSection title="Search quality">
            <div className="pkset-row-list">
                <SettingsRow
                    icon={BarChart3}
                    title="Personalized PageRank"
                    desc="Rerank results using per-query graph walks. Surfaces related notes that keyword and vector search miss."
                    right={<Switch checked={settings.search.enablePPR ?? true} onChange={(v) => updateSearch('enablePPR', v)} />}
                />

                <SettingsDisclosure
                    icon={Cog}
                    title="Inspector links"
                    desc="Side-panel suggestions for related notes around a query."
                    meta={summary}
                >
                    <div className="pkset-row-list">
                        <SettingsRow
                            compact icon={Search}
                            title="Keyword link count"
                            desc="How many keyword-based related notes to show."
                            right={<FormRow.Number value={inspector.keywordTopN} min={0} onChange={numHandler('keywordTopN', 0)} />}
                        />
                        <SettingsRow
                            compact icon={Search}
                            title="Tag link count"
                            desc="How many tag-based related notes to show."
                            right={<FormRow.Number value={inspector.tagTopN} min={0} onChange={numHandler('tagTopN', 0)} />}
                        />
                        <SettingsRow
                            compact icon={Folder}
                            title="Folder grouping"
                            desc="Group related notes by their containing folder."
                            right={<Switch checked={inspector.folderGroupingEnabled} onChange={(v) => updateInspectorLinks('folderGroupingEnabled', v)} />}
                        />
                        <SettingsRow
                            compact icon={Folder}
                            title="Folder group minimum count"
                            desc="Only form a group if a folder has at least this many notes."
                            right={<FormRow.Number value={inspector.folderGroupMinCount} min={1} onChange={numHandler('folderGroupMinCount', 1)} />}
                        />
                        <SettingsRow
                            compact icon={Folder}
                            title="Folder group max depth"
                            desc="Max folder depth Peak will group by."
                            right={<FormRow.Number value={inspector.folderGroupMaxDepth} min={1} onChange={numHandler('folderGroupMaxDepth', 1)} />}
                        />
                    </div>
                </SettingsDisclosure>
            </div>
        </SettingsSection>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. AI Analysis output
 * ───────────────────────────────────────────────────────────────────────── */

function AIAnalysisSection({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { updateSearch } = settingsUpdates;
    const session = settings.search.aiAnalysisSessionSummaryWordCount ?? 3000;
    const short = settings.search.shortSummaryLength ?? 150;
    const full = settings.search.fullSummaryLength ?? 2000;
    const summary = `Session ${session} · Short ${short} · Full ${full}`;

    const updateNum = (key: 'aiAnalysisSessionSummaryWordCount' | 'shortSummaryLength' | 'fullSummaryLength') =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            updateSearch(key, Math.max(1, parseInt(e.target.value, 10) || 1));

    return (
        <SettingsSection title="AI Analysis output">
            <div className="pkset-row-list">
                <SettingsRow
                    icon={Microscope}
                    title="Auto-save results"
                    desc="Save AI Analysis outputs to a folder in your vault."
                    right={<Switch
                        checked={settings.search.aiAnalysisAutoSaveEnabled ?? true}
                        onChange={(v) => updateSearch('aiAnalysisAutoSaveEnabled', v)}
                    />}
                />
                <SettingsRow
                    icon={FileText}
                    title="Recent history"
                    desc="How many recent AI Analysis runs to keep in the panel."
                    right={
                        <div className="pktw-w-24">
                            <NumberInputWithConfirm
                                value={settings.search.aiAnalysisHistoryLimit ?? 5}
                                onConfirm={(v) => void updateSearch('aiAnalysisHistoryLimit', v)}
                                min={1}
                                max={50}
                                placeholder="5"
                            />
                        </div>
                    }
                />
                <SettingsRow
                    icon={X}
                    title="Exclude saved analyses from search"
                    desc="Prevent prior AI Analysis output from polluting future search results."
                    right={<Switch
                        checked={settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true}
                        onChange={(v) => updateSearch('aiAnalysisExcludeAutoSaveFolderFromSearch', v)}
                    />}
                />

                <SettingsDisclosure
                    icon={Cog}
                    title="Summary lengths (advanced)"
                    desc="Word counts Peak targets when generating summaries."
                    meta={summary}
                >
                    <FormGrid style={{ padding: 4 }}>
                        <FormRow>
                            <FormRow.Label>
                                Session summary word count
                                <FormRow.LabelHint>Target length when summarizing one analysis session.</FormRow.LabelHint>
                            </FormRow.Label>
                            <FormRow.Control>
                                <FormRow.Number value={session} unit="words" min={1} onChange={updateNum('aiAnalysisSessionSummaryWordCount')} />
                            </FormRow.Control>
                        </FormRow>
                        <FormRow>
                            <FormRow.Label>
                                Short summary length
                                <FormRow.LabelHint>Target length for inline short summaries.</FormRow.LabelHint>
                            </FormRow.Label>
                            <FormRow.Control>
                                <FormRow.Number value={short} unit="words" min={1} onChange={updateNum('shortSummaryLength')} />
                            </FormRow.Control>
                        </FormRow>
                        <FormRow>
                            <FormRow.Label>
                                Full summary length
                                <FormRow.LabelHint>Target length for detailed summaries.</FormRow.LabelHint>
                            </FormRow.Label>
                            <FormRow.Control>
                                <FormRow.Number value={full} unit="words" min={1} onChange={updateNum('fullSummaryLength')} />
                            </FormRow.Control>
                        </FormRow>
                    </FormGrid>
                </SettingsDisclosure>
            </div>
        </SettingsSection>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Advanced chunking disclosure
 * ───────────────────────────────────────────────────────────────────────── */

function AdvancedChunkingDisclosure({
    settings,
    settingsUpdates,
}: {
    settings: MyPluginSettings;
    settingsUpdates: SettingsUpdates;
}) {
    const { updateChunking } = settingsUpdates;
    const chunking = settings.search.chunking;

    const updateNum = (key: 'maxChunkSize' | 'chunkOverlap' | 'minDocSizeToChunk' | 'maxCodeChunkChars', fallback: number) =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            updateChunking(key, Math.max(key === 'maxChunkSize' ? 1 : 0, parseInt(e.target.value, 10) || fallback));

    return (
        <SettingsSection>
            <SettingsDisclosure
                icon={Cog}
                title="Advanced chunking"
                desc="Chunk size, overlap, and code-block handling for embedding."
                meta="6 fields"
            >
                <div className="pkset-row-list">
                    <SettingsRow
                        compact icon={Cog} title="Max chunk size" desc="Characters per chunk before splitting."
                        right={<FormRow.Number value={chunking.maxChunkSize ?? 1000} unit="chars" min={1} onChange={updateNum('maxChunkSize', 1000)} />}
                    />
                    <SettingsRow
                        compact icon={Cog} title="Chunk overlap" desc="Characters shared between adjacent chunks."
                        right={<FormRow.Number value={chunking.chunkOverlap ?? 200} unit="chars" min={0} onChange={updateNum('chunkOverlap', 200)} />}
                    />
                    <SettingsRow
                        compact icon={FileText} title="Minimum document size for chunking" desc="Smaller docs are embedded whole, not split."
                        right={<FormRow.Number value={chunking.minDocSizeToChunk ?? 0} unit="chars" min={0} onChange={updateNum('minDocSizeToChunk', 0)} />}
                    />
                    <SettingsRow
                        compact icon={Code} title="Skip code blocks when chunking" desc="Replace code blocks with a placeholder instead of embedding them."
                        right={<Switch checked={chunking.skipCodeBlocksInChunking ?? false} onChange={(v) => updateChunking('skipCodeBlocksInChunking', v)} />}
                    />
                    <SettingsRow
                        compact icon={Code} title="Code block placeholder" desc="String used when a code block is skipped."
                        right={
                            <div className="pktw-w-40">
                                <Input
                                    value={chunking.codeBlockPlaceholder ?? '[code omitted]'}
                                    onChange={(e) => updateChunking('codeBlockPlaceholder', e.target.value)}
                                    placeholder="[code omitted]"
                                />
                            </div>
                        }
                    />
                    <SettingsRow
                        compact icon={Code} title="Max code block chars" desc="Max characters of code embedded inline when not skipped."
                        right={<FormRow.Number value={chunking.maxCodeChunkChars ?? 0} unit="chars" min={0} onChange={updateNum('maxCodeChunkChars', 0)} />}
                    />
                </div>
            </SettingsDisclosure>
        </SettingsSection>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Advanced rebuild disclosure
 * ───────────────────────────────────────────────────────────────────────── */

function AdvancedRebuildDisclosure() {
    const { settingsActions } = useServiceContext();
    const knowledgeIndex = settingsActions.knowledgeIndex;
    const actions: Array<{ icon: typeof RefreshCw; label: string; onClick: () => void }> = [
        { icon: RefreshCw, label: 'Full re-index', onClick: () => void knowledgeIndex.startStagedFullIndexing() },
        { icon: Database, label: 'Rebuild vectors', onClick: () => void knowledgeIndex.runVectorEnrichmentPending() },
        { icon: Sparkles, label: 'Run LLM enrichment', onClick: () => void knowledgeIndex.runLlmEnrichmentPending() },
        { icon: BarChart3, label: 'Compare PPR search', onClick: () => void knowledgeIndex.compareSearchResults() },
    ];
    return (
        <SettingsSection>
            <SettingsDisclosure
                icon={RefreshCw}
                title="Advanced rebuild"
                desc="Heavier operations. Peak does not run these automatically."
                meta="4 actions"
            >
                <div className="pkset-action-strip">
                    {actions.map(({ icon: Icon, label, onClick }) => (
                        <Button key={label} variant="outline" size="sm" onClick={onClick}>
                            <Icon className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            {label}
                        </Button>
                    ))}
                </div>
            </SettingsDisclosure>
        </SettingsSection>
    );
}

/* Re-exported types kept so adjacent modules importing this file's old
 * structure still typecheck. None today, but cheap to keep. */
export type { HarnessSettings };
