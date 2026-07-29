/**
 * Peak Composer — Excalidraw read-only preview (WP8, §10.12).
 *
 * Renders the actual Excalidraw embed through Obsidian's Markdown renderer
 * first. The parsed-scene SVG is retained as a fallback for environments where
 * the Excalidraw processor is unavailable; compressed formats still fail closed
 * in that fallback rather than being displayed as a broken image.
 */

import * as React from 'react';
import { PenTool } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { parseExcalidrawScene, type ExcalidrawElement, type ExcalidrawScene } from '@/service/composer';
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

export function ExcalidrawBlockView({
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
	const scene = React.useMemo(() => {
		const parsed = parseExcalidrawScene(raw);
		return parsed.ok ? parsed.scene : null;
	}, [raw]);
	const sourceFrom = loaded ? undefined : block.source.from;
	const target = nativeTargetOf(nativePreview);
	const fallback = scene ? <ExcalidrawSceneView scene={scene} /> : <div className="pk-native-empty">{strings.excalidrawUnsupported}</div>;

	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			nativeTarget={target}
			icon={<PenTool size={17} />}
			kindLabel={strings.excalidrawLabel}
			title={target ? basename(target) : strings.excalidrawLabel}
			description={strings.excalidrawDescription}
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
					kind="excalidraw"
					markdown={`![[${target}]]`}
					fallback={fallback}
				/>
			) : fallback}
		</NativeBlockFrame>
	);
}

function ExcalidrawSceneView({ scene }: { scene: ExcalidrawScene }): React.ReactElement {
	const visible = scene.elements.filter((element) => !element.isDeleted);
	if (visible.length === 0) return <div className="pk-native-empty">0 elements</div>;
	const bounds = elementBounds(visible);
	return (
		<svg
			className="pk-native-excalidraw__scene"
			viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
			role="img"
			aria-label={`${visible.length} Excalidraw elements`}
		>
			<defs>
				<marker id="pk-excalidraw-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
					<path d="M0,0 L8,4 L0,8 z" className="pk-native-excalidraw__arrow" />
				</marker>
			</defs>
			{visible.map((element, index) => <SceneElement key={String(element.id ?? index)} element={element} />)}
		</svg>
	);
}

function SceneElement({ element }: { element: ExcalidrawElement }): React.ReactElement | null {
	const x = numberOf(element.x);
	const y = numberOf(element.y);
	const width = Math.abs(numberOf(element.width));
	const height = Math.abs(numberOf(element.height));
	const stroke = stringOf(element.strokeColor, '#5c6472');
	const fill = stringOf(element.backgroundColor, 'transparent');
	const opacity = Math.max(0, Math.min(1, numberOf(element.opacity, 100) / 100));
	const common = { stroke, fill: fill === 'transparent' ? 'none' : fill, opacity, strokeWidth: Math.max(1, numberOf(element.strokeWidth, 2)) };
	if (element.type === 'rectangle' || element.type === 'frame') {
		return <rect x={x} y={y} width={width} height={height} rx={numberOf(element.roundness) ? 10 : 2} {...common} />;
	}
	if (element.type === 'ellipse') return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...common} />;
	if (element.type === 'diamond') {
		return <path d={`M ${x + width / 2} ${y} L ${x + width} ${y + height / 2} L ${x + width / 2} ${y + height} L ${x} ${y + height / 2} Z`} {...common} />;
	}
	if (element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw') {
		const points = pointsOf(element.points);
		if (points.length < 2) return null;
		const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x + point[0]} ${y + point[1]}`).join(' ');
		return <path d={d} fill="none" stroke={stroke} opacity={opacity} strokeWidth={common.strokeWidth} markerEnd={element.type === 'arrow' ? 'url(#pk-excalidraw-arrow)' : undefined} />;
	}
	if (element.type === 'text') {
		const text = stringOf(element.text, '');
		return (
			<text x={x} y={y + Math.max(16, numberOf(element.fontSize, 20))} fill={stroke} opacity={opacity} fontSize={numberOf(element.fontSize, 20)}>
				{text.split(/\r?\n/).slice(0, 4).map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : '1.2em'}>{line}</tspan>)}
			</text>
		);
	}
	return null;
}

function elementBounds(elements: ExcalidrawElement[]): { x: number; y: number; width: number; height: number } {
	const x0 = Math.min(...elements.map((element) => numberOf(element.x))) - 32;
	const y0 = Math.min(...elements.map((element) => numberOf(element.y))) - 32;
	const x1 = Math.max(...elements.map((element) => numberOf(element.x) + Math.abs(numberOf(element.width)))) + 32;
	const y1 = Math.max(...elements.map((element) => numberOf(element.y) + Math.abs(numberOf(element.height)))) + 32;
	return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

function numberOf(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOf(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function pointsOf(value: unknown): Array<[number, number]> {
	if (!Array.isArray(value)) return [];
	return value.filter((point): point is [number, number] =>
		Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number');
}

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

function nativeTargetOf(state: NativePreviewLoadState | undefined): string | undefined {
	if (!state) return undefined;
	if ('targetPath' in state && state.targetPath) return state.targetPath;
	return 'requestedTarget' in state ? state.requestedTarget : undefined;
}
