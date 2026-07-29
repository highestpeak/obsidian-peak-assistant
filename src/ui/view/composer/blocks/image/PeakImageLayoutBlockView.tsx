/**
 * Renderer for the deliberately narrow, vault-backed image-layout HTML contract.
 * The layout header controls write the `data-layout` attribute back through the
 * shared transaction hub; they are absent in a read-only document.
 */

import * as React from 'react';
import { Code2, FileImage } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import {
	parsePeakImageLayout,
	replacePeakImageLayoutMode,
	type ParsedPeakImageLayout,
	type PeakImageLayoutMode,
} from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { ComposerImageLightbox } from './ComposerImageLightbox';
import { DEFAULT_IMAGE_UI_STRINGS, loadImageUiStrings } from './imageUiConfig';

const LAYOUT_MODES: readonly PeakImageLayoutMode[] = ['grid', 'hero', 'strip', 'story'];

function LayoutImageTile({
	path,
	alt,
	caption,
	onError,
	onOpen,
}: {
	path: string;
	alt: string;
	caption: string;
	onError: () => void;
	onOpen: () => void;
}): React.ReactElement {
	return (
		<figure className="peak-image-layout__item">
			<img
				className="peak-image-layout__image"
				src={path}
				alt={alt}
				role="button"
				tabIndex={0}
				aria-label={alt}
				onError={onError}
				onClick={onOpen}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					onOpen();
				}}
			/>
			{caption ? <figcaption className="peak-image-layout__caption">{caption}</figcaption> : null}
		</figure>
	);
}

function layoutFallbackTile(item: ParsedPeakImageLayout['items'][number], loadFailed: string): React.ReactElement {
	return (
		<figure className="peak-image-layout__item">
			<span className="pk-composer-image-fallback" title={loadFailed}>
				<FileImage size={18} />
				<span className="pk-composer-image-fallback-text">{item.caption || item.alt || item.src}</span>
			</span>
			{item.caption ? <figcaption className="peak-image-layout__caption">{item.caption}</figcaption> : null}
		</figure>
	);
}

export function PeakImageLayoutBlockView({ block, editing }: { block: ComposerBlock; editing: boolean }): React.ReactElement {
	const chrome = useComposerChrome();
	const parsed = parsePeakImageLayout(block.renderModel.raw);
	const hub = chrome.runtime.hub;
	const resolvePreviewUri = chrome.runtime.imagePreviewResolver;
	const [imageErrors, setImageErrors] = React.useState<Record<number, boolean>>({});
	const [lightbox, setLightbox] = React.useState<{ src: string; alt: string } | null>(null);
	const [uiStrings, setUiStrings] = React.useState(DEFAULT_IMAGE_UI_STRINGS);
	const rootRef = React.useRef<HTMLDivElement | null>(null);
	const layoutIdentity = parsed
		? `${block.blockId}:${parsed.kind}:${parsed.items.map((item) => item.src).join('|')}`
		: block.renderModel.raw;

	React.useEffect(() => {
		let cancelled = false;
		void loadImageUiStrings().then((strings) => !cancelled && setUiStrings(strings));
		return () => {
			cancelled = true;
		};
	}, []);
	React.useEffect(() => {
		setImageErrors({});
	}, [layoutIdentity]);

	if (!parsed) {
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}

	const canChangeMode = editing && Boolean(hub);
	const changeMode = (mode: PeakImageLayoutMode): void => {
		if (!hub || mode === parsed.kind) return;
		const nextSource = replacePeakImageLayoutMode(block.renderModel.raw, mode);
		if (!nextSource) return;
		void hub.commit({
			origin: 'direct',
			label: uiStrings.layoutTitle,
			operations: [{ kind: 'replaceRange', from: block.source.from, to: block.source.to, text: nextSource }],
			target: { kind: 'block', blockId: block.blockId },
			expectedBlockDelta: 0,
		});
	};
	const tile = (item: ParsedPeakImageLayout['items'][number], index: number): React.ReactElement => {
		const resolved = item.src ? resolvePreviewUri?.(item.src, chrome.snapshot?.filePath) : undefined;
		const src = resolved && resolved.length > 0 ? resolved : item.src;
		if (!src || imageErrors[index]) return layoutFallbackTile(item, uiStrings.loadFailed);
		return (
			<LayoutImageTile
				key={`${item.src}-${index}`}
				path={src}
				alt={item.alt}
				caption={item.caption}
				onError={() => setImageErrors((previous) => ({ ...previous, [index]: true }))}
				onOpen={() => setLightbox({ src, alt: item.caption || item.alt })}
			/>
		);
	};

	return (
		<div className="pk-composer-image-layout" ref={rootRef} data-src-text-from={block.source.from} data-block-id={block.blockId}>
			<div className="image-layout-shell">
				<div className="image-layout-head">
					<span>
						<strong>{uiStrings.layoutTitle}</strong>
						<small>{uiStrings.layoutDescription}</small>
					</span>
					{canChangeMode ? (
						<div className="image-layout-modes" role="group" aria-label={uiStrings.layoutModeAria}>
							{LAYOUT_MODES.map((mode) => (
								<Button
									key={mode}
									variant="ghost"
									className="pk-composer-image-layout-mode"
									aria-pressed={mode === parsed.kind}
									onClick={() => changeMode(mode)}
								>
									{uiStrings.layoutModes[mode]}
								</Button>
							))}
						</div>
					) : null}
				</div>
				<div className="peak-image-layout" data-layout={parsed.kind}>
					{parsed.items.map(tile)}
				</div>
				<div className="image-layout-source">
					<Code2 aria-hidden="true" />
					<span>
						{uiStrings.layoutSource} · <code>{`data-layout="${parsed.kind}"`}</code>
					</span>
				</div>
			</div>
			{lightbox ? (
				<ComposerImageLightbox
					anchor={rootRef.current}
					initialSrc={lightbox.src}
					initialAlt={lightbox.alt}
					labels={uiStrings.lightbox}
					onClose={() => setLightbox(null)}
				/>
			) : null}
		</div>
	);
}
