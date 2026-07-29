/**
 * Peak Composer — `.canvas` (JSON Canvas) read-only preview (WP8, §10.12).
 *
 * Renders the native Obsidian Canvas embed first. The data-driven SVG scene
 * remains as an explicit fallback when the native renderer or Canvas view is
 * unavailable, so a valid JSON Canvas never degrades to a placeholder image.
 */

import * as React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { parseCanvasModel, type CanvasModel, type CanvasNode } from '@/service/composer';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import {
	NativeBlockFrame,
	NativeEmbedHost,
	NativePreviewStatusView,
	NativeSourceView,
	useNativeStrings,
	type NativePreviewLoadState,
	type NativeViewMode,
} from '../nativeBlockShared';

export function CanvasBlockView({
	block,
	nativePreview,
	onReload,
}: {
	block: ComposerBlock;
	nativePreview?: NativePreviewLoadState;
	onReload?: () => void;
}): React.ReactElement {
	const strings = useNativeStrings();
	const chrome = useComposerChrome();
	const { onOpenLink } = chrome;
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const loaded = nativePreview?.status === 'loaded' ? nativePreview : null;
	const raw = loaded?.text ?? block.renderModel.raw;
	const model = React.useMemo(() => {
		try {
			return parseCanvasModel(raw);
		} catch {
			return null;
		}
	}, [raw]);
	const sourceFrom = loaded ? undefined : block.source.from;
	const target = nativeTargetOf(nativePreview);
	const fallback = model ? <CanvasScene model={model} /> : <div className="pk-native-empty">{strings.canvasInvalid}</div>;

	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			nativeTarget={target}
			icon={<LayoutGrid size={17} />}
			kindLabel={strings.canvasLabel}
			title={target ? basename(target) : strings.canvasLabel}
			description={strings.canvasDescription}
			onOpen={target ? () => onOpenLink?.('vault', target) : undefined}
			sourceReference={target}
		>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={sourceFrom} nativeTarget={loaded?.targetPath} />
			) : nativePreview && nativePreview.status !== 'loaded' ? (
				<NativePreviewStatusView state={nativePreview} strings={strings} onReload={onReload} />
			) : loaded && target && chrome.snapshot ? (
				<NativeEmbedHost
					renderer={chrome.runtime.nativeEmbedRenderer}
					sourcePath={chrome.snapshot.filePath}
					target={target}
					kind="canvas"
					markdown={`![[${target}]]`}
					fallback={fallback}
				/>
			) : fallback}
		</NativeBlockFrame>
	);
}

function CanvasScene({ model }: { model: CanvasModel }): React.ReactElement {
	if (model.nodes.length === 0) return <div className="pk-native-empty">0 nodes</div>;
	const bounds = sceneBounds(model.nodes);
	const nodes = new Map(model.nodes.map((node) => [node.id, node]));
	return (
		<svg
			className="pk-native-canvas__scene"
			viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
			role="img"
			aria-label={`${model.nodes.length} nodes, ${model.edges.length} edges`}
		>
			<defs>
				<marker id="pk-canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
					<path d="M0,0 L8,4 L0,8 z" className="pk-native-canvas__arrow" />
				</marker>
			</defs>
			{model.edges.map((edge) => {
				const from = nodes.get(edge.fromNode);
				const to = nodes.get(edge.toNode);
				if (!from || !to) return null;
				const a = center(from);
				const b = center(to);
				return (
					<g key={edge.id}>
						<path className="pk-native-canvas__edge-line" d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} markerEnd="url(#pk-canvas-arrow)" />
						{edge.label && <text className="pk-native-canvas__edge-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8}>{edge.label}</text>}
					</g>
				);
			})}
			{model.nodes.map((node) => (
				<g key={node.id} className="pk-native-canvas__node" data-node-type={node.type}>
					<rect x={node.x} y={node.y} width={node.width} height={node.height} rx="8" />
					<text x={node.x + 14} y={node.y + 24}>
						<tspan className="pk-native-canvas__node-type">{node.type.toUpperCase()}</tspan>
						<tspan x={node.x + 14} dy="24" className="pk-native-canvas__node-label">{nodeLabel(node)}</tspan>
					</text>
				</g>
			))}
		</svg>
	);
}

function sceneBounds(nodes: CanvasNode[]): { x: number; y: number; width: number; height: number } {
	const x0 = Math.min(...nodes.map((node) => node.x)) - 36;
	const y0 = Math.min(...nodes.map((node) => node.y)) - 36;
	const x1 = Math.max(...nodes.map((node) => node.x + node.width)) + 36;
	const y1 = Math.max(...nodes.map((node) => node.y + node.height)) + 36;
	return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

function center(node: CanvasNode): { x: number; y: number } {
	return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function nodeLabel(node: CanvasNode): string {
	const text = typeof node.label === 'string' ? node.label : typeof node.text === 'string' ? node.text : node.file ?? node.type;
	const first = text.split(/\r?\n/).find((line) => line.trim()) ?? text;
	return first.replace(/^#+\s*/, '').trim().slice(0, 42);
}

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

function nativeTargetOf(state: NativePreviewLoadState | undefined): string | undefined {
	if (!state) return undefined;
	if ('targetPath' in state && state.targetPath) return state.targetPath;
	return 'requestedTarget' in state ? state.requestedTarget : undefined;
}
