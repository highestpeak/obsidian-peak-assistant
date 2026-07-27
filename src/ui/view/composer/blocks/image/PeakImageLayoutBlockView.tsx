/**
 * Peak Composer — renderer for the fixture HTML contract:
 * `<div class="peak-image-layout" data-layout="hero">...</div>`.
 */

import * as React from 'react';
import { Captions, FileImage, WandSparkles } from 'lucide-react';
import type { ComposerBlock, ComposerTarget } from '@/core/composer';
import { parsePeakImageLayout, type ParsedPeakImageLayout } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { IMAGE_TOOLBAR_CONTROL } from './ImageBlockView';

function LayoutImageTile({
	path,
	alt,
	caption,
	textSource,
	onError,
}: {
	path: string;
	alt: string;
	caption: string;
	textSource: number;
	onError: () => void;
}): React.ReactElement {
	return (
		<figure className="pk-composer-image-figure peak-image-layout__item" data-src-text-from={textSource}>
			<img className="pk-composer-image-element peak-image-layout__image" src={path} alt={alt} onError={onError} />
			{caption ? <figcaption className="pk-composer-image-caption peak-image-layout__caption">{caption}</figcaption> : null}
		</figure>
	);
}

function layoutFallbackTile(item: ParsedPeakImageLayout['items'][number], sourceTextFrom: number): React.ReactElement {
	return (
		<figure className="pk-composer-image-figure peak-image-layout__item" data-src-text-from={sourceTextFrom}>
			<span className="pk-composer-image-fallback" title="图片加载失败">
				<FileImage size={18} />
				<span className="pk-composer-image-fallback-text">{item.caption || item.alt || item.src}</span>
			</span>
			{item.caption ? <figcaption className="pk-composer-image-caption peak-image-layout__caption">{item.caption}</figcaption> : null}
		</figure>
	);
}

export function PeakImageLayoutBlockView({ block, editing }: { block: ComposerBlock; editing: boolean }): React.ReactElement {
	const chrome = useComposerChrome();
	const parsed = parsePeakImageLayout(block.renderModel.raw);
	const coordinator = chrome.runtime.imageCoordinator;
	const hub = chrome.runtime.hub;
	const resolvePreviewUri = chrome.runtime.imagePreviewResolver;
	const [imageErrors, setImageErrors] = React.useState<Record<number, boolean>>({});
	const textSource = block.source.from;
	const target: ComposerTarget = { kind: 'block', blockId: block.blockId };

	if (!parsed) {
		return (
			<pre className="pk-composer-mono" data-src-text-from={block.source.from} data-block-id={block.blockId}>
				{block.renderModel.raw}
			</pre>
		);
	}

	const hero = parsed.items[0];
	const thumbs = parsed.items.slice(1);
	const toolbarOpen = editing && Boolean(coordinator) && Boolean(hub);
	const showToolbar = editing;

	const runCaption = (): void => {
		if (!coordinator || !hub) return;
		coordinator.beginCaption({ blockId: block.blockId });
	};
	const runEdit = (): void => {
		if (!coordinator || !hub || !hero.src) return;
		coordinator.beginAiEdit({ instruction: '', target, sourcePath: hero.src });
	};

	const tile = (item: ParsedPeakImageLayout['items'][number], idx: number): React.ReactElement => {
		const resolved = item.src ? resolvePreviewUri?.(item.src) : undefined;
		const src = resolved && resolved.length > 0 ? resolved : item.src;
		if (!src || imageErrors[idx]) {
			return layoutFallbackTile(item, textSource);
		}
		return (
			<LayoutImageTile
				path={src}
				textSource={textSource}
				alt={item.alt}
				caption={item.caption}
				onError={() => {
					setImageErrors((prev) => ({ ...prev, [idx]: true }));
				}}
			/>
		);
	};

	const heroSrc = hero.src ? resolvePreviewUri?.(hero.src) ?? hero.src : '';
	const heroNode = heroSrc && !imageErrors[0] ? tile(hero, 0) : layoutFallbackTile(hero, textSource);

	return (
		<span className="pk-composer-image-layout" data-src-text-from={block.source.from} data-block-id={block.blockId}>
			<div className="peak-image-layout" data-layout={parsed.kind}>
				{heroNode}
				<div className="peak-image-layout__thumbs">{thumbs.map((item, i) => tile(item, i + 1))}</div>
			</div>
			{showToolbar ? (
				<span className="pk-composer-image-toolbar inline-flex items-center gap-1.5" data-chrome="true">
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1`}
						disabled={!toolbarOpen}
						title={toolbarOpen ? undefined : '需编辑权限'}
						onClick={runEdit}
					>
						<WandSparkles size={14} />
						AI 改图
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1`}
						disabled={!toolbarOpen}
						title={toolbarOpen ? undefined : '需编辑权限'}
						onClick={runCaption}
					>
						<Captions size={14} />
						图注
					</Button>
					</span>
			) : null}
		</span>
	);
}
