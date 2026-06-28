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
        <div className="pkset-section">
            <div className="pkset-section__head">
                <span className="pkset-section__title">Index readiness</span>
                <span className="pkset-section__sub">
                    Detected from your current vault and index state. Peak does not auto-rebuild.
                </span>
            </div>

            <div className="pkset-readiness-panel">
                <Row>
                    <Row.Icon>
                        <HardDrive size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>SQLite store</Row.Title>
                        <Row.Desc>On-disk index database.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        {snap.storeReady ? (
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
                    </Row.Right>
                </Row>

                <Row>
                    <Row.Icon>
                        <FileText size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Current index</Row.Title>
                        <Row.Desc>Notes already indexed for search.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Row.Value>
                            {snap.indexedDocs?.toLocaleString() ?? '—'} files
                        </Row.Value>
                        {coveragePct !== null && (
                            <Row.Meta>{coveragePct}% coverage</Row.Meta>
                        )}
                    </Row.Right>
                </Row>

                <Row>
                    <Row.Icon>
                        <AlertTriangle size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Missing or changed notes</Row.Title>
                        <Row.Desc>Files that need an update to reflect current content.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        {snap.missingChanged > 0 ? (
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
                    </Row.Right>
                </Row>

                <Row>
                    <Row.Icon>
                        <Sparkles size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Semantic readiness</Row.Title>
                        <Row.Desc>Whether meaning-based search can run.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        {snap.semanticReady ? (
                            <Chip variant="success">
                                <Check size={11} style={{ marginRight: 4 }} />
                                Provider connected
                            </Chip>
                        ) : (
                            <Chip variant="neutral">No embedding provider</Chip>
                        )}
                    </Row.Right>
                </Row>

                <Row>
                    <Row.Icon>
                        <LayoutDashboard size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Current mode</Row.Title>
                        <Row.Desc>What kind of index Peak maintains right now.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Row.Value>{formatIndexLevel(snap.mode)}</Row.Value>
                    </Row.Right>
                </Row>

                {snap.missingChanged > 0 && (
                    <div className="pkset-recommended-row">
                        <Row.Icon>
                            <RefreshCw size={16} />
                        </Row.Icon>
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
        </div>
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
        <div className="pkset-section">
            <div className="pkset-section__head">
                <span className="pkset-section__title">Index behavior</span>
            </div>
            <div className="pkset-row-list">
                <Row>
                    <Row.Icon>
                        <LayoutDashboard size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Index mode</Row.Title>
                        <Row.Desc>
                            Fast Index is local-only. Semantic and Full add meaning-based search
                            and LLM tags.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Segmented<IndexLevel>
                            value={pendingLevel ?? currentLevel}
                            onValueChange={handleLevelPick}
                            options={[
                                { value: 'fast', label: 'Fast Index' },
                                {
                                    value: 'semantic',
                                    label: 'Semantic Index',
                                    disabled: !embeddingReady,
                                },
                                {
                                    value: 'full',
                                    label: 'Full Knowledge Index',
                                    disabled: !embeddingReady,
                                },
                            ]}
                            aria-label="Index mode"
                        />
                    </Row.Right>
                </Row>

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

                <Row>
                    <Row.Icon>
                        <RefreshCw size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Auto-index on startup</Row.Title>
                        <Row.Desc>Check for changed files when Obsidian launches.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Switch
                            checked={settings.search.autoIndex}
                            onChange={(v) => updateSearch('autoIndex', v)}
                        />
                    </Row.Right>
                </Row>

                <Row>
                    <Row.Icon>
                        <RefreshCw size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Refresh interval</Row.Title>
                        <Row.Desc>
                            How often Peak rechecks for changed files in the background.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <FormRow.Number
                            value={Math.round((settings.search.indexRefreshInterval ?? 5000) / 1000)}
                            unit="sec"
                            min={1}
                            onChange={(e) => {
                                const sec = Math.max(1, parseInt(e.target.value, 10) || 5);
                                void updateSearch('indexRefreshInterval', sec * 1000);
                            }}
                        />
                    </Row.Right>
                </Row>

                <div
                    className="pk-row"
                    style={{
                        gridTemplateColumns: '32px 1fr',
                        alignItems: 'start',
                        rowGap: 12,
                    }}
                >
                    <Row.Icon>
                        <FileText size={16} />
                    </Row.Icon>
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

                <Row>
                    <Row.Icon>
                        <X size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Ignore patterns</Row.Title>
                        <Row.Desc>Glob patterns for files Peak should not index.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Row.Meta>
                            {settings.search.ignorePatterns?.length ?? 0} patterns
                        </Row.Meta>
                        <Pill onClick={() => setEditingPatterns((v) => !v)}>
                            {editingPatterns ? 'Close' : 'Edit'}
                        </Pill>
                    </Row.Right>
                </Row>
            </div>

            {editingPatterns && (
                <div className="pktw-px-4 pktw-pt-2 pktw-pb-3 pktw-space-y-2">
                    <textarea
                        value={patternsText}
                        onChange={(e) => setPatternsText(e.target.value)}
                        placeholder={'.git/\nnode_modules/\n*.tmp'}
                        className="pktw-w-full pktw-h-28 pktw-px-3 pktw-py-2 pktw-border pktw-border-border pktw-rounded-md pktw-text-xs pktw-font-mono pktw-resize-vertical focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring"
                    />
                    <Button size="sm" onClick={saveIgnorePatterns}>
                        Save
                    </Button>
                </div>
            )}
        </div>
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

    return (
        <div className="pkset-section">
            <div className="pkset-section__head">
                <span className="pkset-section__title">Search quality</span>
            </div>
            <div className="pkset-row-list">
                <Row>
                    <Row.Icon>
                        <BarChart3 size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Personalized PageRank</Row.Title>
                        <Row.Desc>
                            Rerank results using per-query graph walks. Surfaces related notes
                            that keyword and vector search miss.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Switch
                            checked={settings.search.enablePPR ?? true}
                            onChange={(v) => updateSearch('enablePPR', v)}
                        />
                    </Row.Right>
                </Row>

                <details>
                    <summary>
                        <Row disclosure>
                            <Row.Icon>
                                <Cog size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Inspector links</Row.Title>
                                <Row.Desc>
                                    Side-panel suggestions for related notes around a query.
                                </Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <Row.Meta>{summary}</Row.Meta>
                                <ChevronDown
                                    size={14}
                                    style={{ color: 'var(--pk-text-tertiary)' }}
                                />
                            </Row.Right>
                        </Row>
                    </summary>
                    <div className="pk-disclosure-body">
                        <div className="pkset-row-list">
                            <Row compact>
                                <Row.Icon>
                                    <Search size={16} />
                                </Row.Icon>
                                <Row.Body>
                                    <Row.Title>Keyword link count</Row.Title>
                                    <Row.Desc>
                                        How many keyword-based related notes to show.
                                    </Row.Desc>
                                </Row.Body>
                                <Row.Right>
                                    <FormRow.Number
                                        value={inspector.keywordTopN}
                                        min={0}
                                        onChange={(e) =>
                                            updateInspectorLinks(
                                                'keywordTopN',
                                                Math.max(0, parseInt(e.target.value, 10) || 0),
                                            )
                                        }
                                    />
                                </Row.Right>
                            </Row>
                            <Row compact>
                                <Row.Icon>
                                    <Search size={16} />
                                </Row.Icon>
                                <Row.Body>
                                    <Row.Title>Tag link count</Row.Title>
                                    <Row.Desc>How many tag-based related notes to show.</Row.Desc>
                                </Row.Body>
                                <Row.Right>
                                    <FormRow.Number
                                        value={inspector.tagTopN}
                                        min={0}
                                        onChange={(e) =>
                                            updateInspectorLinks(
                                                'tagTopN',
                                                Math.max(0, parseInt(e.target.value, 10) || 0),
                                            )
                                        }
                                    />
                                </Row.Right>
                            </Row>
                            <Row compact>
                                <Row.Icon>
                                    <Folder size={16} />
                                </Row.Icon>
                                <Row.Body>
                                    <Row.Title>Folder grouping</Row.Title>
                                    <Row.Desc>
                                        Group related notes by their containing folder.
                                    </Row.Desc>
                                </Row.Body>
                                <Row.Right>
                                    <Switch
                                        checked={inspector.folderGroupingEnabled}
                                        onChange={(v) =>
                                            updateInspectorLinks('folderGroupingEnabled', v)
                                        }
                                    />
                                </Row.Right>
                            </Row>
                            <Row compact>
                                <Row.Icon>
                                    <Folder size={16} />
                                </Row.Icon>
                                <Row.Body>
                                    <Row.Title>Folder group minimum count</Row.Title>
                                    <Row.Desc>
                                        Only form a group if a folder has at least this many notes.
                                    </Row.Desc>
                                </Row.Body>
                                <Row.Right>
                                    <FormRow.Number
                                        value={inspector.folderGroupMinCount}
                                        min={1}
                                        onChange={(e) =>
                                            updateInspectorLinks(
                                                'folderGroupMinCount',
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                    />
                                </Row.Right>
                            </Row>
                            <Row compact>
                                <Row.Icon>
                                    <Folder size={16} />
                                </Row.Icon>
                                <Row.Body>
                                    <Row.Title>Folder group max depth</Row.Title>
                                    <Row.Desc>Max folder depth Peak will group by.</Row.Desc>
                                </Row.Body>
                                <Row.Right>
                                    <FormRow.Number
                                        value={inspector.folderGroupMaxDepth}
                                        min={1}
                                        onChange={(e) =>
                                            updateInspectorLinks(
                                                'folderGroupMaxDepth',
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                    />
                                </Row.Right>
                            </Row>
                        </div>
                    </div>
                </details>
            </div>
        </div>
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

    return (
        <div className="pkset-section">
            <div className="pkset-section__head">
                <span className="pkset-section__title">AI Analysis output</span>
            </div>
            <div className="pkset-row-list">
                <Row>
                    <Row.Icon>
                        <Microscope size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Auto-save results</Row.Title>
                        <Row.Desc>Save AI Analysis outputs to a folder in your vault.</Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Switch
                            checked={settings.search.aiAnalysisAutoSaveEnabled ?? true}
                            onChange={(v) => updateSearch('aiAnalysisAutoSaveEnabled', v)}
                        />
                    </Row.Right>
                </Row>
                {/* Save folder moved to Advanced > Storage > Derived folders
                    (consolidated folder config). */}
                <Row>
                    <Row.Icon>
                        <FileText size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Recent history</Row.Title>
                        <Row.Desc>
                            How many recent AI Analysis runs to keep in the panel.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <div className="pktw-w-24">
                            <NumberInputWithConfirm
                                value={settings.search.aiAnalysisHistoryLimit ?? 5}
                                onConfirm={(v) =>
                                    void updateSearch('aiAnalysisHistoryLimit', v)
                                }
                                min={1}
                                max={50}
                                placeholder="5"
                            />
                        </div>
                    </Row.Right>
                </Row>
                <Row>
                    <Row.Icon>
                        <X size={16} />
                    </Row.Icon>
                    <Row.Body>
                        <Row.Title>Exclude saved analyses from search</Row.Title>
                        <Row.Desc>
                            Prevent prior AI Analysis output from polluting future search results.
                        </Row.Desc>
                    </Row.Body>
                    <Row.Right>
                        <Switch
                            checked={
                                settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true
                            }
                            onChange={(v) =>
                                updateSearch('aiAnalysisExcludeAutoSaveFolderFromSearch', v)
                            }
                        />
                    </Row.Right>
                </Row>

                <details>
                    <summary>
                        <Row disclosure>
                            <Row.Icon>
                                <Cog size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Summary lengths (advanced)</Row.Title>
                                <Row.Desc>
                                    Word counts Peak targets when generating summaries.
                                </Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <Row.Meta>{summary}</Row.Meta>
                                <ChevronDown
                                    size={14}
                                    style={{ color: 'var(--pk-text-tertiary)' }}
                                />
                            </Row.Right>
                        </Row>
                    </summary>
                    <div className="pk-disclosure-body">
                        <FormGrid style={{ padding: 4 }}>
                            <FormRow>
                                <FormRow.Label>
                                    Session summary word count
                                    <FormRow.LabelHint>
                                        Target length when summarizing one analysis session.
                                    </FormRow.LabelHint>
                                </FormRow.Label>
                                <FormRow.Control>
                                    <FormRow.Number
                                        value={session}
                                        unit="words"
                                        min={1}
                                        onChange={(e) =>
                                            updateSearch(
                                                'aiAnalysisSessionSummaryWordCount',
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                    />
                                </FormRow.Control>
                            </FormRow>
                            <FormRow>
                                <FormRow.Label>
                                    Short summary length
                                    <FormRow.LabelHint>
                                        Target length for inline short summaries.
                                    </FormRow.LabelHint>
                                </FormRow.Label>
                                <FormRow.Control>
                                    <FormRow.Number
                                        value={short}
                                        unit="words"
                                        min={1}
                                        onChange={(e) =>
                                            updateSearch(
                                                'shortSummaryLength',
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                    />
                                </FormRow.Control>
                            </FormRow>
                            <FormRow>
                                <FormRow.Label>
                                    Full summary length
                                    <FormRow.LabelHint>
                                        Target length for detailed summaries.
                                    </FormRow.LabelHint>
                                </FormRow.Label>
                                <FormRow.Control>
                                    <FormRow.Number
                                        value={full}
                                        unit="words"
                                        min={1}
                                        onChange={(e) =>
                                            updateSearch(
                                                'fullSummaryLength',
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                    />
                                </FormRow.Control>
                            </FormRow>
                        </FormGrid>
                    </div>
                </details>
            </div>
        </div>
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

    return (
        <div className="pkset-section">
            <details>
                <summary>
                    <Row disclosure>
                        <Row.Icon>
                            <Cog size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>Advanced chunking</Row.Title>
                            <Row.Desc>
                                Chunk size, overlap, and code-block handling for embedding.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Row.Meta>6 fields</Row.Meta>
                            <ChevronDown
                                size={14}
                                style={{ color: 'var(--pk-text-tertiary)' }}
                            />
                        </Row.Right>
                    </Row>
                </summary>
                <div className="pk-disclosure-body">
                    <div className="pkset-row-list">
                        <Row compact>
                            <Row.Icon>
                                <Cog size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Max chunk size</Row.Title>
                                <Row.Desc>Characters per chunk before splitting.</Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <FormRow.Number
                                    value={chunking.maxChunkSize ?? 1000}
                                    unit="chars"
                                    min={1}
                                    onChange={(e) =>
                                        updateChunking(
                                            'maxChunkSize',
                                            Math.max(1, parseInt(e.target.value, 10) || 1000),
                                        )
                                    }
                                />
                            </Row.Right>
                        </Row>
                        <Row compact>
                            <Row.Icon>
                                <Cog size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Chunk overlap</Row.Title>
                                <Row.Desc>Characters shared between adjacent chunks.</Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <FormRow.Number
                                    value={chunking.chunkOverlap ?? 200}
                                    unit="chars"
                                    min={0}
                                    onChange={(e) =>
                                        updateChunking(
                                            'chunkOverlap',
                                            Math.max(0, parseInt(e.target.value, 10) || 200),
                                        )
                                    }
                                />
                            </Row.Right>
                        </Row>
                        <Row compact>
                            <Row.Icon>
                                <FileText size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Minimum document size for chunking</Row.Title>
                                <Row.Desc>Smaller docs are embedded whole, not split.</Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <FormRow.Number
                                    value={chunking.minDocSizeToChunk ?? 0}
                                    unit="chars"
                                    min={0}
                                    onChange={(e) =>
                                        updateChunking(
                                            'minDocSizeToChunk',
                                            Math.max(0, parseInt(e.target.value, 10) || 0),
                                        )
                                    }
                                />
                            </Row.Right>
                        </Row>
                        <Row compact>
                            <Row.Icon>
                                <Code size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Skip code blocks when chunking</Row.Title>
                                <Row.Desc>
                                    Replace code blocks with a placeholder instead of embedding
                                    them.
                                </Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <Switch
                                    checked={chunking.skipCodeBlocksInChunking ?? false}
                                    onChange={(v) =>
                                        updateChunking('skipCodeBlocksInChunking', v)
                                    }
                                />
                            </Row.Right>
                        </Row>
                        <Row compact>
                            <Row.Icon>
                                <Code size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Code block placeholder</Row.Title>
                                <Row.Desc>String used when a code block is skipped.</Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <div className="pktw-w-40">
                                    <Input
                                        value={chunking.codeBlockPlaceholder ?? '[code omitted]'}
                                        onChange={(e) =>
                                            updateChunking('codeBlockPlaceholder', e.target.value)
                                        }
                                        placeholder="[code omitted]"
                                    />
                                </div>
                            </Row.Right>
                        </Row>
                        <Row compact>
                            <Row.Icon>
                                <Code size={16} />
                            </Row.Icon>
                            <Row.Body>
                                <Row.Title>Max code block chars</Row.Title>
                                <Row.Desc>
                                    Max characters of code embedded inline when not skipped.
                                </Row.Desc>
                            </Row.Body>
                            <Row.Right>
                                <FormRow.Number
                                    value={chunking.maxCodeChunkChars ?? 0}
                                    unit="chars"
                                    min={0}
                                    onChange={(e) =>
                                        updateChunking(
                                            'maxCodeChunkChars',
                                            Math.max(0, parseInt(e.target.value, 10) || 0),
                                        )
                                    }
                                />
                            </Row.Right>
                        </Row>
                    </div>
                </div>
            </details>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Advanced rebuild disclosure
 * ───────────────────────────────────────────────────────────────────────── */

function AdvancedRebuildDisclosure() {
    const { settingsActions } = useServiceContext();
    const knowledgeIndex = settingsActions.knowledgeIndex;
    return (
        <div className="pkset-section">
            <details>
                <summary>
                    <Row disclosure>
                        <Row.Icon>
                            <RefreshCw size={16} />
                        </Row.Icon>
                        <Row.Body>
                            <Row.Title>Advanced rebuild</Row.Title>
                            <Row.Desc>
                                Heavier operations. Peak does not run these automatically.
                            </Row.Desc>
                        </Row.Body>
                        <Row.Right>
                            <Row.Meta>4 actions</Row.Meta>
                            <ChevronDown
                                size={14}
                                style={{ color: 'var(--pk-text-tertiary)' }}
                            />
                        </Row.Right>
                    </Row>
                </summary>
                <div className="pk-disclosure-body">
                    <div className="pkset-action-strip">
                        <Button variant="outline" size="sm" onClick={() => void knowledgeIndex.startStagedFullIndexing()}>
                            <RefreshCw className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            Full re-index
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void knowledgeIndex.runVectorEnrichmentPending()}>
                            <Database className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            Rebuild vectors
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void knowledgeIndex.runLlmEnrichmentPending()}>
                            <Sparkles className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            Run LLM enrichment
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void knowledgeIndex.compareSearchResults()}>
                            <BarChart3 className="pktw-mr-1.5 pktw-h-3.5 pktw-w-3.5" />
                            Compare PPR search
                        </Button>
                    </div>
                </div>
            </details>
        </div>
    );
}

/* Re-exported types kept so adjacent modules importing this file's old
 * structure still typecheck. None today, but cheap to keep. */
export type { HarnessSettings };
