import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@/ui/react/lib/utils";
import { Button } from "@/ui/component/shared-ui/button";
import { X } from "lucide-react";
import { runInspectorGraph, runInspectorPath } from "@/service/search/inspectorService";
import { GraphVisualization, GraphVisualizationHandle, UIPreviewGraph } from "@/ui/component/mine/graph-viz/GraphVisualization";
import { convertGraphToGraphPreview } from "@/ui/view/shared/graph-utils";
import { createObsidianGraphPreset, ObsidianGraphPresetResult } from "../../presets/obsidianGraphPreset";
import { createOpenSourceCallback } from "../../callbacks/open-source-file";
import { openFile } from "@/core/utils/obsidian-utils";
import { AppContext } from "@/app/context/AppContext";
import { copyText } from "@/ui/view/shared/common-utils";
import { useGraphAnimationStore, useGraphQueuePump } from "@/ui/component/mine/graph-viz/graphAnimationStore";
import { PATH_STRING_SEPARATOR } from "@/service/tools/search-graph-inspector/find-path";

/** Max height for the graph + toolbar block; allow more room for the graph. */
const GRAPH_VIZ_MAX_HEIGHT = 560;

type InspectorHops = 1 | 2 | 3;

type PathResult = { paths?: string[]; markdown?: string } | null;

export const GraphSection = React.forwardRef<HTMLDivElement, {
    ref: React.RefObject<HTMLDivElement>;
    graphIncludeSemantic: boolean;
    currentPath: string | null;
    className?: string;
    onClose?: () => void;
    /** Controlled fullscreen: when true, overlay is shown; close via onFullscreenClose. */
    fullscreenOpen?: boolean;
    onFullscreenClose?: () => void;
}>(({ graphIncludeSemantic, currentPath, className, onClose, fullscreenOpen = false, onFullscreenClose }, ref) => {
    const [hops, setHops] = useState<InspectorHops>(1);
    const [uiGraph, setUIGraph] = useState<UIPreviewGraph | null>(null);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphError, setGraphError] = useState<string | null>(null);

    const [pathResult, setPathResult] = useState<{ paths?: string[]; markdown?: string } | null>(null);

    const runGraph = useCallback(async () => {
        if (!currentPath?.trim()) return;
        setGraphLoading(true);
        setGraphError(null);
        // Keep previous graph visible while loading so "Waiting for graph events…" does not block (e.g. when switching hops).
        try {
            const result = await runInspectorGraph(currentPath, hops, graphIncludeSemantic);
            if (result.error) {
                setGraphError(result.error);
                return;
            }
            if (!result.graph) return;
            const fullGraph = convertGraphToGraphPreview(result.graph);
            setUIGraph(fullGraph ?? null);
        } catch (e) {
            setGraphError(e instanceof Error ? e.message : 'Graph failed');
        } finally {
            setGraphLoading(false);
        }
    }, [currentPath, hops, graphIncludeSemantic]);

    useEffect(() => {
        if (currentPath?.trim()) void runGraph();
    }, [currentPath, runGraph]);

    const onSetPathResult = useCallback((result: PathResult) => {
        setPathResult(result);
        // Run graph path find animation: animate nodes step by step
        if (result?.paths?.length) {
            try {
                // Each path string is a string of node ids joined by " -> "
                // We'll split by '->', trim and step through each node
                const pathStr = result.paths[0];
                const nodeIds = pathStr
                    .split(PATH_STRING_SEPARATOR)
                    .map(s => s.trim())
                    .filter(Boolean);

                // Animate: at each step, highlight from start to i-th node
                // Use the graph animation queue to schedule focus effect per step
                // We'll dispatch a 'effect' for each prefix of the path, step by step
                // Small delay between each for smooth animation
                nodeIds.forEach((_, idx) => {
                    const focusPath = nodeIds.slice(0, idx + 1);
                    window.setTimeout(() => {
                        // Send effect to queue
                        useGraphAnimationStore.getState().enqueue({
                            id: `path-anim-${Date.now()}-${idx}`,
                            kind: 'effect',
                            ts: Date.now(),
                            payload: {
                                effect: {
                                    type: 'path',
                                    intensity: 1,
                                    focusNodeIds: focusPath,
                                }
                            }
                        });
                    }, idx * 330); // step animation delay (ms)
                });
            } catch (e) {
                // Ignore animation error
                // (optionally: setGraphError('Path animation failed'))
                console.error('[GraphSection] Path animation failed', e);
            }
        }
    }, [setPathResult]);

    const obsidianPreset = useMemo<ObsidianGraphPresetResult>(() => {
        return createObsidianGraphPreset({
            onOpenPath: onClose ? createOpenSourceCallback(onClose) : undefined,
            openFile: (path) => openFile(AppContext.getInstance().app, path, true),
            copyText,
        })
    }, [onClose]);

    useGraphQueuePump();

    const effect = useGraphAnimationStore((s) => s.effect);

    const graphRef = useRef<GraphVisualizationHandle>(null);
    const inlineContainerRef = useRef<HTMLDivElement>(null);
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (fullscreenOpen) {
            setTimeout(() => graphRef.current?.fitToView(true), 100);
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onFullscreenClose?.();
            };
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
        }
    }, [fullscreenOpen, onFullscreenClose]);

    // Fit to view when graph loads (give simulation time to settle)
    useEffect(() => {
        if (!uiGraph?.nodes?.length) return;
        const t = setTimeout(() => graphRef.current?.fitToView(true), 500);
        return () => clearTimeout(t);
    }, [uiGraph]);

    /** Single content block: graph + capability toolbar (Hops, Find path) rendered inside GraphVisualization. */
    const toolbarConfig = useMemo(
        () => ({
            hops: {
                value: hops,
                onChange: (h: InspectorHops) => {
                    if (h !== hops) {
                        setUIGraph(null);
                        setGraphError(null);
                    }
                    setHops(h);
                },
            },
            findPath: {
                pathStart: currentPath,
                runFindPath: (startPath: string, targetPath: string) =>
                    runInspectorPath(startPath, targetPath, graphIncludeSemantic),
                onPathResult: onSetPathResult,
                candidatePaths: [],
            },
        }),
        [hops, currentPath, graphIncludeSemantic, onSetPathResult]
    );

    /** Single GraphVisualization instance; portal moves it between inline and fullscreen without remount. */
    const graphVizElement = (
        <GraphVisualization
            ref={graphRef}
            {...obsidianPreset}
            graph={uiGraph}
            effect={effect}
            title={currentPath ? `Graph: ${currentPath.split('/').pop() ?? currentPath}` : undefined}
            hideTitle={fullscreenOpen}
            containerClassName={fullscreenOpen ? 'pktw-w-full pktw-h-full pktw-min-h-[280px]' : undefined}
            graphBelowExtraAnalysisArea={toolbarConfig}
            nodeContextMenu={{
                onOpenSource: onClose ? createOpenSourceCallback(onClose) : undefined,
            }}
        />
    );

    const portalTarget = fullscreenOpen
        ? fullscreenContainerRef.current
        : inlineContainerRef.current;

    return (
        <div ref={ref} className={cn('pktw-flex-shrink-0 pktw-flex pktw-flex-col pktw-border-b pktw-border-[#e5e7eb]', className)}>
            {/* Inline container: always in DOM for portal target; hidden when fullscreen */}
            <div
                ref={inlineContainerRef}
                className={cn(
                    'pktw-flex-shrink-0 pktw-flex pktw-flex-col pktw-overflow-hidden pktw-p-2',
                    fullscreenOpen && 'pktw-hidden'
                )}
                style={!fullscreenOpen ? { minHeight: 320, maxHeight: GRAPH_VIZ_MAX_HEIGHT } : undefined}
            />

            {/* Fullscreen overlay: panel always in DOM so fullscreenContainerRef stays stable; visibility via CSS */}
            <div
                className={cn(
                    'pktw-fixed pktw-inset-0 pktw-bg-black/30 pktw-z-[10000] pktw-flex pktw-items-center pktw-justify-center pktw-p-4',
                    !fullscreenOpen && 'pktw-pointer-events-none pktw-invisible'
                )}
                style={fullscreenOpen ? undefined : { visibility: 'hidden' }}
                onClick={(e) => fullscreenOpen && e.target === e.currentTarget && onFullscreenClose?.()}
            >
                <motion.div
                    initial={false}
                    animate={{ opacity: fullscreenOpen ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="pktw-bg-white pktw-rounded-lg pktw-shadow-xl pktw-border pktw-border-[#e5e7eb] pktw-w-full pktw-h-full pktw-max-w-[95vw] pktw-max-h-[95vh] pktw-flex pktw-flex-col pktw-overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={!fullscreenOpen ? { pointerEvents: 'none' } : undefined}
                >
                    <div className="pktw-flex pktw-items-center pktw-justify-between pktw-p-2 pktw-border-b pktw-border-[#e5e7eb] pktw-shrink-0">
                        <span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
                            {currentPath ? `Graph: ${currentPath.split('/').pop() ?? currentPath}` : 'Graph'}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="pktw-rounded-md"
                            title="Close"
                            onClick={() => onFullscreenClose?.()}
                        >
                            <X className="pktw-w-5 pktw-h-5" />
                        </Button>
                    </div>
                    <div
                        ref={fullscreenContainerRef}
                        className="pktw-flex-1 pktw-min-h-0 pktw-flex pktw-flex-col pktw-p-4 pktw-overflow-hidden"
                    />
                </motion.div>
            </div>

            {portalTarget && createPortal(graphVizElement, portalTarget)}
        </div>
    );
});