/**
 * Peak Composer — `.base` (embedded reference) read-only preview (WP8, §10.12).
 *
 * A `.base` reference inside a Markdown note appears as an embed. This view
 * renders a structured, data-driven summary of the referenced base (views,
 * columns, filters, formulas) parsed with the CST-preserving `.base` adapter —
 * never a placeholder. The full canvas render is out of scope for the read-only
 * host; the summary + source toggle is the honest, real-data preview.
 *
 * When the block is a Markdown embed pointing at a separate `.base` file, the
 * referenced content is not inline, so we render the embed target + a hint; when
 * the block source itself is YAML `.base` content (rare inline case), we parse
 * and summarize it.
 */

import * as React from 'react';
import type { ComposerBlock } from '@/core/composer';
import { buildBasePreview } from '@/service/composer';
import { NativeBlockFrame, NativeSourceView, NativeStatRow, useNativeStrings, type NativeViewMode } from '../nativeBlockShared';

export function BaseBlockView({ block }: { block: ComposerBlock }): React.ReactElement {
	const strings = useNativeStrings();
	const [mode, setMode] = React.useState<NativeViewMode>('preview');
	const raw = block.renderModel.raw;
	const preview = React.useMemo(() => buildBasePreview(raw), [raw]);

	return (
		<NativeBlockFrame blockId={block.blockId} sourceFrom={block.source.from} mode={mode} onMode={setMode} strings={strings}>
			{mode === 'source' ? (
				<NativeSourceView raw={raw} blockId={block.blockId} sourceFrom={block.source.from} />
			) : preview.valid ? (
				<div className="pk-native-base">
					{preview.views.map((view, i) => (
						<div key={`${view.name}-${i}`} className="pk-native-base__view">
							<span className="pk-native-base__name">{view.name}</span>
							<span className="pk-native-base__type">{view.type}</span>
							<NativeStatRow
								items={[
									{ label: strings.baseColumnsLabel, value: view.order.length },
									{ label: strings.baseFiltersLabel, value: view.filterCount },
									{ label: strings.baseFormulasLabel, value: view.formulaKeys.length },
								]}
							/>
							{view.order.length > 0 && (
								<div className="pk-native-base__cols">
									{view.order.map((col) => (
										<span key={col} className="pk-native-chip">
											{col}
										</span>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			) : (
				<div className="pk-native-empty">{preview.reason ?? strings.baseInvalid}</div>
			)}
		</NativeBlockFrame>
	);
}
