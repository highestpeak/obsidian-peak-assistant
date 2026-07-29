/**
 * Peak Composer — `.base` (embedded reference) read-only preview (WP8, §10.12).
 *
 * A `.base` reference inside a Markdown note appears as an embed. This view
 * first asks Obsidian to render the actual embedded Base. The structured,
 * data-driven summary remains a fallback for a missing native renderer or a
 * failing embedded plugin, so the view never becomes an empty placeholder.
 *
 * When the block is a Markdown embed pointing at a separate `.base` file, the
 * referenced content is not inline, the native renderer receives the original
 * `![[...]]` form. When it cannot render, the referenced bytes are parsed for
 * the fallback summary; rare inline YAML is handled the same way.
 */

import * as React from 'react';
import { Table2 } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { buildBasePreview } from '@/service/composer';
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

export function BaseBlockView({
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
	const preview = React.useMemo(() => buildBasePreview(raw), [raw]);
	const sourceFrom = loaded ? undefined : block.source.from;
	const target = nativeTargetOf(nativePreview);
	const fallback = preview.valid ? (
		<div className="pk-native-base" data-native-fallback="structured-summary">
			{preview.views.map((view, i) => (
				<div key={`${view.name}-${i}`} className="pk-native-base__view">
					<div className="pk-native-base__view-heading">
						<span className="pk-native-base__name">{view.name}</span>
						<span className="pk-native-base__type">{view.type}</span>
						<span className="pk-native-base__meta">{view.filterCount} {strings.baseFiltersLabel} · {view.formulaKeys.length} {strings.baseFormulasLabel}</span>
					</div>
					<div className="pk-native-base__grid" role="table" aria-label={view.name}>
						<div className="pk-native-base__grid-row" role="row">
							{view.order.map((column) => <span key={column} role="columnheader">{column}</span>)}
						</div>
						<div className="pk-native-base__grid-row pk-native-base__grid-row--formula" role="row">
							{view.order.map((column) => {
								const formula = view.formulas.find((entry) => entry.key === column);
								return <span key={column} role="cell">{formula?.expression || '—'}</span>;
							})}
						</div>
					</div>
				</div>
			))}
		</div>
	) : (
		<div className="pk-native-empty">{preview.reason ?? strings.baseInvalid}</div>
	);

	return (
		<NativeBlockFrame
			blockId={block.blockId}
			sourceFrom={block.source.from}
			mode={mode}
			onMode={setMode}
			strings={strings}
			nativeTarget={target}
			icon={<Table2 size={17} />}
			kindLabel={strings.baseLabel}
			title={target ? basename(target) : strings.baseLabel}
			description={strings.baseDescription}
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
					kind="base"
					markdown={`![[${target}]]`}
					fallback={fallback}
				/>
			) : fallback}
		</NativeBlockFrame>
	);
}

function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

function nativeTargetOf(state: NativePreviewLoadState | undefined): string | undefined {
	if (!state) return undefined;
	if ('targetPath' in state && state.targetPath) return state.targetPath;
	return 'requestedTarget' in state ? state.requestedTarget : undefined;
}
