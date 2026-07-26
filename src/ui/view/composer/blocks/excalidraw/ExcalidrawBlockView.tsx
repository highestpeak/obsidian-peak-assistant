/**
 * Peak Composer — Excalidraw read-only preview (WP8, §10.12).
 *
 * Parses the embedded scene (parsed variant) and renders a structural summary:
 * element counts by type and a sample of text elements. The compressed-json
 * variant is detected and reported as not-previewable with a reason (fail-safe)
 * rather than shown as a broken image. Real data, never a placeholder.
 */

import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import { buildExcalidrawPreview } from '@/service/composer';
import { NativeBlockFrame, NativeSourceView, NativeStatRow, useNativeStrings, type NativeViewMode } from '../nativeBlockShared';

export function ExcalidrawBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const raw = block.renderModel.raw;
	const preview = React.useMemo(() => buildExcalidrawPreview(raw), [raw]);
	const typeItems = preview.elementTypes
		? Object.entries(preview.elementTypes).map(([type, count]) => ({ label: type, value: count }))
		: [];

	return (
		<NativeBlockFrame blockId={block.blockId} sourceFrom={block.source.from} mode={mode} onMode={setMode} strings={strings}>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={block.source.from} />
			) : preview.supported ? (
				<div className="pk-native-excalidraw">
					<NativeStatRow items={[{ label: strings.excalidrawElementsLabel, value: preview.elementCount ?? 0 }, ...typeItems]} />
					{preview.textSample && preview.textSample.length > 0 && (
						<div className="pk-native-excalidraw__text">
							<span className="pk-native-excalidraw__text-label">{strings.excalidrawTextLabel}</span>
							{preview.textSample.map((t, i) => (
								<span key={i} className="pk-native-chip">
									{t}
								</span>
							))}
						</div>
					)}
				</div>
			) : (
				<div className="pk-native-empty">{preview.reason ?? strings.excalidrawUnsupported}</div>
			)}
		</NativeBlockFrame>
	);
}
