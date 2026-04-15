import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, List, Network, Info } from 'lucide-react';
import { useSearchSessionStore } from '../store/searchSessionStore';
import { createOpenSourceCallback } from '../callbacks/open-source-file';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';

type SourceViewMode = 'list' | 'graph';

interface V2SourcesViewProps {
    onClose?: () => void;
}

const SourcesGraph: React.FC<{ sources: Array<{ path: string; title: string }> }> = ({ sources }) => {
    const mermaid = useMemo(() => {
        const folders = new Map<string, string[]>();
        for (const s of sources) {
            const folder = s.path.split('/')[0] || 'root';
            const list = folders.get(folder) ?? [];
            list.push(s.title);
            folders.set(folder, list);
        }
        let md = '```mermaid\nmindmap\n  root((Sources))\n';
        for (const [folder, titles] of folders) {
            md += `    ${folder}\n`;
            for (const t of titles.slice(0, 5)) {
                md += `      ${t.slice(0, 20)}\n`;
            }
            if (titles.length > 5) {
                md += `      +${titles.length - 5} more\n`;
            }
        }
        md += '```';
        return md;
    }, [sources]);
    return <StreamdownIsolated>{mermaid}</StreamdownIsolated>;
};

export const V2SourcesView: React.FC<V2SourcesViewProps> = ({ onClose }) => {
    const sources = useSearchSessionStore((s) => s.v2Sources);
    const [viewMode, setViewMode] = useState<SourceViewMode>('list');
    const handleOpen = useMemo(() => createOpenSourceCallback(onClose), [onClose]);

    const viewModes: Array<{ id: SourceViewMode; icon: typeof List; label: string }> = [
        { id: 'list', icon: List, label: 'List' },
        { id: 'graph', icon: Network, label: 'Graph' },
    ];

    const grouped = useMemo(() => {
        const map = new Map<string, typeof sources>();
        for (const src of sources) {
            const folder = src.path.split('/').slice(0, -1).join('/') || '/';
            const list = map.get(folder) ?? [];
            list.push(src);
            map.set(folder, list);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
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

            {/* List view — grouped by folder */}
            {viewMode === 'list' && (
                <div>
                    {grouped.map(([folder, items]) => (
                        <div key={folder}>
                            <div className="pktw-text-xs pktw-text-[#9ca3af] pktw-font-mono pktw-py-1 pktw-px-1 pktw-mt-2">
                                {folder} ({items.length})
                            </div>
                            <div className="pktw-space-y-0 pktw-divide-y pktw-divide-[#e5e7eb]">
                                {items.map((source, i) => (
                                    <motion.div
                                        key={source.path}
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: i * 0.05 }}
                                        className="pktw-py-3 pktw-px-1 hover:pktw-bg-[#fafafa] pktw-cursor-pointer pktw-transition-all pktw-group"
                                        onClick={() => handleOpen(source.path)}
                                    >
                                        <div className="pktw-flex pktw-items-center pktw-gap-2">
                                            <FileText className="pktw-w-4 pktw-h-4 pktw-text-[#9ca3af] pktw-shrink-0" />
                                            <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] group-hover:pktw-text-[#7c3aed] pktw-transition-colors">
                                                {source.title}
                                            </span>
                                        </div>
                                        {source.reasoning && (
                                            <div className="pktw-ml-6 pktw-mt-1.5 pktw-flex pktw-items-start pktw-gap-1.5">
                                                <Info className="pktw-w-3 pktw-h-3 pktw-text-[#999999] pktw-shrink-0 pktw-mt-0.5" />
                                                <span className="pktw-text-xs pktw-text-[#6c757d] pktw-leading-relaxed pktw-line-clamp-2">
                                                    {source.reasoning}
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Graph view */}
            {viewMode === 'graph' && (
                <div className="pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-xl pktw-p-4 pktw-min-h-[300px]">
                    <SourcesGraph sources={sources} />
                </div>
            )}
        </motion.div>
    );
};
