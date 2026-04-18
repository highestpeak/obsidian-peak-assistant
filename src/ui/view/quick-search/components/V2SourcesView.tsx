import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileText, List, Network, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import type { V2Source } from '../types/search-steps';
import { useGraphAgent } from '../hooks/useGraphAgent';

type SourceViewMode = 'list' | 'graph';

interface V2SourcesViewProps {
    onClose?: () => void;
}

const SourcesGraph: React.FC<{ sources: V2Source[]; onOpen: (path: string) => void }> = ({ sources, onOpen }) => {
    const searchQuery = useSearchSessionStore(s => s.query);
    const sourceItems = useMemo(
        () => sources.map(s => ({ path: s.path, title: s.title, score: sources.length - sources.indexOf(s) })),
        [sources],
    );
    const { graphData, loading, steps, start } = useGraphAgent(sourceItems, searchQuery);

    const handleExpand = useCallback(async () => {
        const { AppContext } = await import('@/app/context/AppContext');
        const { GRAPH_FULLSCREEN_VIEW_TYPE } = await import('@/ui/view/graph-fullscreen/GraphFullscreenView');
        const app = AppContext.getInstance().app;
        const leaf = app.workspace.getLeaf('split');
        await leaf.setViewState({ type: GRAPH_FULLSCREEN_VIEW_TYPE, active: true });
        app.workspace.revealLeaf(leaf);
    }, []);

    return (
        <div className="pktw-h-[500px] pktw-w-full pktw-border pktw-border-[--background-modifier-border] pktw-rounded-lg pktw-overflow-hidden">
            <MultiLensGraph
                graphData={graphData}
                defaultLens="topology"
                showControls
                onNodeClick={onOpen}
                className="pktw-h-full"
                loading={loading}
                loadingSteps={steps}
                onRequestGenerate={start}
                onExpand={handleExpand}
            />
        </div>
    );
};

function SourceItem({ source, onClick }: { source: V2Source; onClick: () => void }) {
    const refCount = useSearchSessionStore(s =>
        s.v2PlanSections.filter(sec => sec.evidencePaths?.includes(source.path)).length
    );

    return (
        <div
            className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full pktw-text-left pktw-text-xs pktw-py-1.5 pktw-px-2 hover:pktw-bg-[--background-secondary] pktw-rounded pktw-cursor-pointer pktw-group"
            onClick={onClick}
        >
            <FileText className="pktw-w-3 pktw-h-3 pktw-text-[--text-muted] pktw-shrink-0" />
            <span className="pktw-truncate pktw-flex-1">{source.title}</span>
            {refCount > 0 && (
                <span className="pktw-text-[10px] pktw-px-1 pktw-rounded pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]">
                    x{refCount}
                </span>
            )}
            {source.reasoning && (
                <span className="pktw-hidden group-hover:pktw-inline pktw-text-[10px] pktw-text-[--text-muted] pktw-max-w-[200px] pktw-truncate">
                    {source.reasoning}
                </span>
            )}
        </div>
    );
}

export const V2SourcesView: React.FC<V2SourcesViewProps> = ({ onClose }) => {
    const sources = useSearchSessionStore((s) => s.v2Sources);
    const [viewMode, setViewMode] = useState<SourceViewMode>('list');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const handleOpen = useMemo(() => createOpenSourceCallback(onClose), [onClose]);

    const toggleGroup = (prefix: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(prefix) ? next.delete(prefix) : next.add(prefix);
            return next;
        });
    };

    const viewModes: Array<{ id: SourceViewMode; icon: typeof List; label: string }> = [
        { id: 'list', icon: List, label: 'List' },
        { id: 'graph', icon: Network, label: 'Graph' },
    ];

    const grouped = useMemo(() => {
        const groups = new Map<string, V2Source[]>();
        for (const src of sources) {
            const parts = src.path.split('/');
            const prefix = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0] ?? 'root';
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix)!.push(src);
        }
        return Array.from(groups.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([prefix, srcs]) => ({
                prefix,
                sources: srcs.sort((a, b) => b.readAt - a.readAt),
            }));
    }, [sources]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pktw-px-1 pktw-py-3"
        >
            {/* Header */}
            <div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-4 pktw-px-1">
                <div className="pktw-flex pktw-items-center pktw-gap-2">
                    <FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
                    <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
                        Top Sources
                    </span>
                    <span className="pktw-text-xs pktw-text-[#999999]">
                        ({sources.length} files)
                    </span>
                </div>
                <div className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-0.5">
                    {viewModes.map(({ id, icon: Icon, label }) => (
                        <div
                            key={id}
                            onClick={() => setViewMode(id)}
                            className={`pktw-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-1 pktw-text-xs pktw-font-medium pktw-rounded pktw-cursor-pointer pktw-transition-colors ${
                                viewMode === id
                                    ? 'pktw-bg-gray-100 pktw-text-[#2e3338]'
                                    : 'pktw-text-[#6b7280] hover:pktw-bg-[#f9fafb]'
                            }`}
                        >
                            <Icon className="pktw-w-3.5 pktw-h-3.5" />
                            {label}
                        </div>
                    ))}
                </div>
            </div>

            {/* List view — grouped by folder prefix */}
            {viewMode === 'list' && (
                <div>
                    {grouped.map(({ prefix, sources: items }) => (
                        <div key={prefix} className="pktw-mb-2">
                            <div
                                className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-w-full pktw-text-left pktw-text-xs pktw-font-medium pktw-text-[--text-muted] pktw-py-1.5 pktw-px-2 hover:pktw-bg-[--background-secondary] pktw-rounded pktw-cursor-pointer"
                                onClick={() => toggleGroup(prefix)}
                            >
                                <ChevronRight className={`pktw-w-3 pktw-h-3 pktw-transition-transform ${!collapsedGroups.has(prefix) ? 'pktw-rotate-90' : ''}`} />
                                <Folder className="pktw-w-3 pktw-h-3" />
                                <span className="pktw-truncate">{prefix}</span>
                                <span className="pktw-ml-auto pktw-text-[--text-faint]">{items.length}</span>
                            </div>
                            {!collapsedGroups.has(prefix) && (
                                <div className="pktw-ml-5 pktw-space-y-0.5">
                                    {items.map(src => (
                                        <SourceItem key={src.path} source={src} onClick={() => handleOpen(src.path)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Graph view */}
            {viewMode === 'graph' && (
                <SourcesGraph sources={sources} onOpen={handleOpen} />
            )}
        </motion.div>
    );
};
