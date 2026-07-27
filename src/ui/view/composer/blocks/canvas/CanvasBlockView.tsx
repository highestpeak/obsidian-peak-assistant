/**
 * Peak Composer — `.canvas` (JSON Canvas) read-only preview (WP8, §10.12).
 *
 * Renders a data-driven structural summary of the canvas — node counts by type,
 * a labelled node list and the edge list — parsed with the id-addressed canvas
 * adapter. Not a full pan/zoom canvas (out of scope for the read-only host) but
 * a real parse of the JSON, never a placeholder image.
 */

import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import { buildCanvasPreview } from '@/service/composer';
import {
	NativeBlockFrame,
	NativePreviewStatusView,
	NativeSourceView,
	NativeStatRow,
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
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const loaded = nativePreview?.status === 'loaded' ? nativePreview : null;
	const raw = loaded?.text ?? block.renderModel.raw;
	const preview = React.useMemo(() => buildCanvasPreview(raw), [raw]);
	const sourceFrom = loaded ? undefined : block.source.from;

	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			nativeTarget={nativeTargetOf(nativePreview)}
		>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={sourceFrom} nativeTarget={loaded?.targetPath} />
			) : nativePreview && nativePreview.status !== 'loaded' ? (
				<NativePreviewStatusView state={nativePreview} strings={strings} onReload={onReload} />
			) : preview.valid ? (
				<div className="pk-native-canvas">
					<NativeStatRow
						items={[
							{ label: strings.canvasNodesLabel, value: preview.nodeCount },
							{ label: strings.canvasEdgesLabel, value: preview.edgeCount },
						]}
					/>
					<div className="pk-native-canvas__nodes">
						{preview.nodes.map((node) => (
							<span key={node.id} className="pk-native-node" data-node-type={node.type} data-canvas-color={node.color}>
								<span className="pk-native-node__type">{node.type}</span>
								<span className="pk-native-node__label">{node.label}</span>
							</span>
						))}
					</div>
					{preview.edges.length > 0 && (
						<div className="pk-native-canvas__edges">
							{preview.edges.map((edge) => (
								<span key={edge.id} className="pk-native-edge">
									{edge.from} → {edge.to}
									{edge.label ? ` · ${edge.label}` : ''}
								</span>
							))}
						</div>
					)}
				</div>
			) : (
				<div className="pk-native-empty">{preview.reason ?? strings.canvasInvalid}</div>
			)}
		</NativeBlockFrame>
	);
}

function nativeTargetOf(state: NativePreviewLoadState | undefined): string | undefined {
	if (!state) return undefined;
	if ('targetPath' in state && state.targetPath) return state.targetPath;
	return 'requestedTarget' in state ? state.requestedTarget : undefined;
}
