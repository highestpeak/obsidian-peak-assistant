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
import { NativeBlockFrame, NativeSourceView, NativeStatRow, useNativeStrings, type NativeViewMode } from '../nativeBlockShared';

export function CanvasBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const raw = block.renderModel.raw;
	const preview = React.useMemo(() => buildCanvasPreview(raw), [raw]);

	return (
		<NativeBlockFrame blockId={block.blockId} sourceFrom={block.source.from} mode={mode} onMode={setMode} strings={strings}>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={block.source.from} />
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
