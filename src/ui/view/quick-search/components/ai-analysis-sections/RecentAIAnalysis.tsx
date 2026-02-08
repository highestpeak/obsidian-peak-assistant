import React, { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { AppContext } from '@/app/context/AppContext';
import { CompletedAnalysisSnapshot, useAIAnalysisStore } from '../../store/aiAnalysisStore';
import { AIAnalysisHistoryRecord } from '@/service/AIAnalysisHistoryService';
import { TFile } from 'obsidian';
import { humanReadableTime } from '@/core/utils/date-utils';
import { parse as parseAiSearchAnalysisDoc, toCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';

export const RecentAIAnalysis: React.FC<{
    onClose?: () => void;
}> = ({ onClose }) => {

    const [recentRecords, setRecentRecords] = useState<AIAnalysisHistoryRecord[]>([]);
    const [recentOffset, setRecentOffset] = useState(0);
    const [recentHasMore, setRecentHasMore] = useState(true);
    const [recentTotal, setRecentTotal] = useState<number | null>(null);
    const historyPageSize = AppContext.getInstance().settings.search.aiAnalysisHistoryLimit!;
    const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled!;
    const aiAnalysisHistoryService = AppContext.getInstance().aiAnalysisHistoryService;
    const recentListRef = useRef<HTMLDivElement>(null);
    const recentSentinelRef = useRef<HTMLDivElement>(null);

    const loadSnapshotFromMarkdown = async (vaultRelPath: string, createdAtTs?: number): Promise<CompletedAnalysisSnapshot | null> => {
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
            return toCompletedAnalysisSnapshot(docModel, Number.isFinite(createdAtTs) ? createdAtTs : undefined);
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

        const snapshot = await loadSnapshotFromMarkdown(path, Number.isFinite(createdAt) ? createdAt : undefined);
        if (snapshot) {
            useAIAnalysisStore.getState().loadCompletedAnalysis(
                {
                    ...snapshot,
                    analysisStartedAtMs: (snapshot.analysisStartedAtMs ?? (Number.isFinite(createdAt) ? createdAt : null)) ?? null,
                },
                path
            );
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

    return (recentRecords.length <= 0 ? null :
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
            <div
                ref={recentListRef}
                className="pktw-space-y-2 pktw-max-h-72 pktw-overflow-y-auto pktw-pr-1"
            >
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
                            <div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-4">
                                <span
                                    className="
                                        pktw-text-sm pktw-font-semibold pktw-text-[#1a1c1e] 
                                        pktw-line-clamp-2 pktw-flex-1
                                        group-hover:pktw-text-white
                                    "
                                >
                                    {item.query || '(empty query)'}
                                </span>
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