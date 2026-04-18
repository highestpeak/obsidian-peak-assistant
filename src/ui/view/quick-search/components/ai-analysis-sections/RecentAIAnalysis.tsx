import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { History, Blend, Brain, Loader2, FileText, Clock, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { AppContext } from '@/app/context/AppContext';
import { CompletedAnalysisSnapshot, loadCompletedAnalysisSnapshot } from '../../store/aiAnalysisStore';
import type { AnalysisMode } from '@/ui/view/quick-search/store/aiAnalysisStore';
import { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { TFile } from 'obsidian';
import { humanReadableTime } from '@/core/utils/date-utils';
import { parse as parseAiSearchAnalysisDoc, toCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
import { useSharedStore } from '../../store/sharedStore';
import { useSearchSessionStore } from '../../store/searchSessionStore';
import { cn } from '@/ui/react/lib/utils';
import { BackgroundSessionManager, type BackgroundSession } from '@/service/BackgroundSessionManager';
import { QuickSearchModal } from '@/ui/view/QuickSearchModal';

/** Mode icon for history list; matches SearchModal preset icons. */
function PresetIcon({ mode, className }: { mode: AnalysisMode | null | undefined, className?: string }) {
    if (mode === 'aiGraph') return <Blend className={cn("pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-[#7c3aed]", className)} />;
    return <Brain className={cn("pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-[#7c3aed]", className)} />;
}

// ---------------------------------------------------------------------------
// Active Session Card (background sessions)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; spinning?: boolean }> = {
    streaming: { label: 'Analyzing...', color: '#7c3aed', spinning: true },
    'plan-ready': { label: 'Plan Ready', color: '#d97706' },
    queued: { label: 'Queued', color: '#6b7280' },
    completed: { label: 'Complete', color: '#059669' },
    error: { label: 'Failed', color: '#dc2626' },
};

const ActiveSessionCard: React.FC<{
    session: BackgroundSession;
    onRestore: (id: string) => void;
    onCancel: (id: string) => void;
}> = ({ session, onRestore, onCancel }) => {
    const config = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.streaming;
    const elapsed = Math.round((Date.now() - session.createdAt) / 1000);
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)}m`;
    const Icon = config.spinning ? Loader2 : session.status === 'plan-ready' ? FileText : Clock;

    return (
        <div
            onClick={() => onRestore(session.id)}
            className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f9fafb] pktw-cursor-pointer pktw-transition-colors pktw-group"
        >
            <Icon
                className={`pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 ${config.spinning ? 'pktw-animate-spin' : ''}`}
                style={{ color: config.color }}
            />
            <div className="pktw-flex-1 pktw-min-w-0">
                <span className="pktw-text-sm pktw-font-medium pktw-text-[#1f2937] pktw-truncate pktw-block">
                    {session.title || session.query.slice(0, 60)}
                </span>
                <span className="pktw-text-xs pktw-text-[#9ca3af]">{elapsedStr}</span>
            </div>
            <span
                className="pktw-text-xs pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded-full"
                style={{ color: config.color, backgroundColor: `${config.color}15` }}
            >
                {config.label}
            </span>
            <span
                onClick={(e) => { e.stopPropagation(); onCancel(session.id); }}
                className="pktw-p-1 pktw-text-[#9ca3af] hover:pktw-text-[#ef4444] pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity pktw-cursor-pointer"
                title="Cancel"
            >
                <X className="pktw-w-3.5 pktw-h-3.5" />
            </span>
        </div>
    );
};

// ---------------------------------------------------------------------------
// RecentAIAnalysis
// ---------------------------------------------------------------------------

export const RecentAIAnalysis: React.FC<{
    onClose?: () => void;
}> = ({ onClose }) => {

    // Background sessions subscription
    const bgSessions = useSyncExternalStore(
        (cb) => BackgroundSessionManager.getInstance().subscribe(cb),
        () => BackgroundSessionManager.getInstance().getSessions(),
    );

    const handleRestore = useCallback((sessionId: string) => {
        BackgroundSessionManager.pendingRestore = sessionId;
        onClose?.();
        // Open a new modal after a tick so the pending restore is picked up on mount
        setTimeout(() => {
            const ctx = AppContext.getInstance();
            const modal = new QuickSearchModal(ctx);
            modal.open();
        }, 100);
    }, [onClose]);

    const handleCancelBg = useCallback((sessionId: string) => {
        BackgroundSessionManager.getInstance().cancelSession(sessionId);
    }, []);

    const [recentRecords, setRecentRecords] = useState<AIAnalysisHistoryRecord[]>([]);
    const [recentOffset, setRecentOffset] = useState(0);
    const [recentHasMore, setRecentHasMore] = useState(true);
    const [recentTotal, setRecentTotal] = useState<number | null>(null);
    const historyPageSize = AppContext.getInstance().settings.search.aiAnalysisHistoryLimit!;
    const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled!;
    const aiAnalysisHistoryService = AppContext.getInstance().aiAnalysisHistoryService;
    const recentListRef = useRef<HTMLDivElement>(null);
    const recentSentinelRef = useRef<HTMLDivElement>(null);

    const loadSnapshotFromMarkdown = async (
        vaultRelPath: string,
        createdAtTs?: number
    ): Promise<{ snapshot: CompletedAnalysisSnapshot; query: string } | null> => {
        try {
            let md: string | null = null;
            const file = AppContext.getInstance().app.vault.getAbstractFileByPath(vaultRelPath);
            if (file && file instanceof TFile) {
                md = await AppContext.getInstance().app.vault.read(file);
            }
            if (!md) {
                const svc = aiAnalysisHistoryService as { getMarkdownForReplay?: (path: string) => Promise<string | null> };
                if (typeof svc.getMarkdownForReplay === 'function') {
                    md = await svc.getMarkdownForReplay(vaultRelPath);
                }
            }
            if (!md) return null;
            const docModel = parseAiSearchAnalysisDoc(md);
            const snapshot = toCompletedAnalysisSnapshot(docModel, Number.isFinite(createdAtTs) ? createdAtTs : undefined);
            return { snapshot, query: docModel.query ?? '' };
        } catch (e) {
            console.warn('[AISearchTab] load snapshot from markdown failed:', e);
            return null;
        }
    };

    const handleRecentReplay = async (item: AIAnalysisHistoryRecord, evt: React.MouseEvent<HTMLDivElement>) => {
        const path = String(item?.vault_rel_path ?? '').trim();
        const createdAt = Number(item?.created_at_ts ?? 0);
        const allowDirectOpen = evt.metaKey || evt.ctrlKey || evt.shiftKey;
        if (!path) return;

        if (allowDirectOpen) {
            await createOpenSourceCallback(onClose)(path);
            return;
        }

        const loaded = await loadSnapshotFromMarkdown(path, Number.isFinite(createdAt) ? createdAt : undefined);
        if (loaded) {
            const snapshot = {
                ...loaded.snapshot,
                analysisStartedAtMs: (loaded.snapshot.analysisStartedAtMs ?? (Number.isFinite(createdAt) ? createdAt : null)) ?? null,
            };
            loadCompletedAnalysisSnapshot(snapshot, path);
            if (loaded.query != null && loaded.query !== '') {
                useSharedStore.getState().setSearchQuery(loaded.query);
                // Also set on searchSessionStore so SourcesGraph/useGraphAgent can access it
                useSearchSessionStore.setState({ query: loaded.query });
            }
            return;
        }

        await createOpenSourceCallback(onClose)(path);
    };

    const loadRecentPage = async (offset: number) => {
        const rows = await aiAnalysisHistoryService.list({ limit: historyPageSize, offset });
        return rows as AIAnalysisHistoryRecord[];
    };

    useEffect(() => {
        console.log('refreshRecent');
        void refreshRecent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshRecent = async () => {
        try {
            const [rows, total] = await Promise.all([
                loadRecentPage(0),
                aiAnalysisHistoryService.count(),
            ]);
            setRecentRecords(rows);
            setRecentOffset(rows.length);
            setRecentHasMore(rows.length >= historyPageSize);
            setRecentTotal(total);
        } catch (e) {
            console.warn('[AISearchTab] load recent failed:', e);
        }
    };

    // Infinite scroll in the recent list card
    useEffect(() => {
        const root = recentListRef.current;
        const sentinel = recentSentinelRef.current;
        if (!root || !sentinel) return;
        const ob = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        void loadMoreRecent();
                    }
                }
            },
            { root, rootMargin: '120px', threshold: 0.01 },
        );
        ob.observe(sentinel);
        return () => ob.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recentHasMore, recentOffset, historyPageSize]);

    const loadMoreRecent = async () => {
        if (!recentHasMore) return;
        try {
            const rows = await loadRecentPage(recentOffset);
            setRecentRecords((prev) => {
                const merged = [...prev, ...rows];
                const seen = new Set<string>();
                return merged.filter((r) => {
                    const key = r.vault_rel_path;
                    if (!key) return false;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            });
            setRecentOffset((v) => v + rows.length);
            setRecentHasMore(rows.length >= historyPageSize);
        } catch (e) {
            console.warn('[AISearchTab] load more recent failed:', e);
        }
    };

    const clearHistory = async () => {
        const ok = window.confirm('Clear AI analysis history metadata? This will NOT delete the markdown files.');
        if (!ok) return;
        try {
            await aiAnalysisHistoryService.deleteAll();
            setRecentRecords([]);
            setRecentOffset(0);
            setRecentHasMore(false);
            setRecentTotal(0);
        } catch (e) {
            console.warn('[AISearchTab] clear history failed:', e);
        }
    };

    const saveFolder = AppContext.getInstance().settings.search.aiAnalysisAutoSaveFolder?.trim() || 'ChatFolder/AI-Analysis';

    return (
        <div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
            <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
                <History className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                <span className="pktw-text-sm pktw-font-semibold">Recent AI Analysis</span>
                <span className="pktw-text-xs pktw-text-[#999999]">({recentTotal ?? recentRecords.length})</span>
                <div className="pktw-flex-1" />
                <Button
                    size="sm"
                    variant="ghost"
                    style={{ cursor: 'pointer' }}
                    className="pktw-h-7 pktw-px-2 pktw-text-xs"
                    onClick={clearHistory}
                    title="Clear history metadata (keep files)"
                >
                    Clear History
                </Button>
            </div>
            {bgSessions.length > 0 && (
                <div className="pktw-px-1 pktw-pt-1 pktw-pb-2">
                    <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-uppercase pktw-tracking-wide">
                        Active Sessions
                    </span>
                    <div className="pktw-mt-1.5 pktw-flex pktw-flex-col pktw-gap-1.5">
                        {bgSessions.map((s) => (
                            <ActiveSessionCard
                                key={s.id}
                                session={s}
                                onRestore={handleRestore}
                                onCancel={handleCancelBg}
                            />
                        ))}
                    </div>
                </div>
            )}
            <div
                ref={recentListRef}
                className="pktw-space-y-2 pktw-max-h-72 pktw-overflow-y-auto pktw-pr-1"
            >
                {recentRecords.length === 0 && autoSaveEnabled ? (
                    <div className="pktw-py-4 pktw-px-2 pktw-text-center pktw-text-xs pktw-text-[#6b7280]">
                        <p className="pktw-mb-1">Auto-save is on. No saved analyses yet.</p>
                        <p className="pktw-text-[11px] pktw-opacity-90">Completed analyses will be saved to <code className="pktw-bg-white pktw-px-1 pktw-rounded">{saveFolder}</code></p>
                    </div>
                ) : null}
                {recentRecords.map((item) => (
                    <div
                        key={item.vault_rel_path}
                        onClick={(evt) => void handleRecentReplay(item, evt)}
                        title={item.vault_rel_path}
                        className={`
                            pktw-rounded-lg
                            pktw-bg-white 
                            pktw-transition-all
                            hover:pktw-border-[#7c3aed] hover:pktw-shadow-md
                            hover:pktw-bg-[#7c3aed]
                            pktw-group
                        `}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="pktw-flex pktw-flex-col pktw-p-2 pktw-gap-1.5 pktw-text-left">
                            <div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-2">
                                <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0 pktw-flex-1">
                                    <PresetIcon
                                        mode={(item.analysis_preset ?? undefined) as AnalysisMode | undefined}
                                        className="group-hover:pktw-text-white"
                                    />
                                    <span
                                        className="
                                            pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] 
                                            pktw-line-clamp-2 pktw-flex-1 pktw-min-w-0
                                            group-hover:pktw-text-white
                                        "
                                    >
                                        {item.title || item.query || '(empty query)'}
                                    </span>
                                </div>
                                <span
                                    className="
                                        pktw-text-[10px] pktw-text-[#9ca3af] pktw-mt-0.5
                                        pktw-whitespace-nowrap pktw-tabular-nums
                                        group-hover:pktw-text-[#ede9fe] 
                                    "
                                >
                                    {humanReadableTime(item.created_at_ts)}
                                </span>
                            </div>
                            <div
                                className="
                                    pktw-text-[11px] pktw-text-[#6b7280] pktw-truncate pktw-opacity-80
                                    group-hover:pktw-text-[#ddd6fe]
                                "
                            >
                                {item.vault_rel_path}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={recentSentinelRef} className="pktw-h-1" />
            </div>
            {!autoSaveEnabled ? (
                <div className="pktw-mt-3 pktw-text-xs pktw-text-[#9ca3af]">
                    Auto-save is disabled. Turn it on in Settings, or use “Save to File” after analysis.
                </div>
            ) : null}
        </div>
    );
};