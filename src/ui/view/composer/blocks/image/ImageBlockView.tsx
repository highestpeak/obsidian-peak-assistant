/**
 * Peak Composer — image block view + object toolbar (WP7 integration).
 *
 * Renders an image reference block as a real image preview using an
 * app-owned URI resolver, while keeping the existing AI actions and source mapping
 * intact. Availability stays honest: without a coordinator / hub, this is a
 * read-only preview only. If the image cannot be resolved, a graceful missing
 * state is shown instead of leaving an empty or broken tile.
 */

import * as React from 'react';
import { Captions, FileImage, WandSparkles } from 'lucide-react';
import type { ComposerBlock, ComposerDocumentSnapshot, ComposerTarget } from '@/core/composer';
import { DEFAULT_IMAGE_ACTION_STRINGS, IMAGE_CAPABILITY_IDS, parseImageBlock } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_IMAGE_UI_STRINGS, loadImageActionStrings, loadImageUiStrings } from './imageUiConfig';

export const IMAGE_TOOLBAR_CONTROL = 'h-[28px] rounded-[var(--pk-radius-md)]';

/** Resolve the referenced image path from block source; keep a fallback for tests / legacy references. */
function imageRefOf(snapshot: ComposerDocumentSnapshot | null, raw: string, blockId: string): string | null {
	const parsed = parseImageBlock(raw);
	if (parsed) return parsed.path;
	if (!snapshot) return null;
	const ref = snapshot.nativeRefs.find((r) => r.blockId === blockId && r.kind === 'image');
	return ref?.target ?? null;
}

function imageMetaFromSource(raw: string): { alt: string; caption: string } {
	const parsed = parseImageBlock(raw);
	if (!parsed) return { alt: '', caption: '' };
	const alt = parsed.alt ?? '';
	return {
		alt,
		caption: parsed.caption ?? alt,
	};
}

export function ImageBlockView({
	block,
	editing,
}: {
	block: ComposerBlock;
	editing: boolean;
}): React.ReactElement {
	const chrome = useComposerChrome();
	const coordinator = chrome.runtime.imageCoordinator;
	const hub = chrome.runtime.hub;
	const resolvePreviewUri = chrome.runtime.imagePreviewResolver;
	const sourcePath = imageRefOf(chrome.snapshot, block.renderModel.raw, block.blockId);
	const { alt, caption } = imageMetaFromSource(block.renderModel.raw);
	const resolvedUri = sourcePath ? resolvePreviewUri?.(sourcePath) ?? sourcePath : '';
	const [editOpen, setEditOpen] = React.useState(false);
	const [instruction, setInstruction] = React.useState('');
	const [imageError, setImageError] = React.useState(false);
	const [actionStrings, setActionStrings] = React.useState(DEFAULT_IMAGE_ACTION_STRINGS);
	const [uiStrings, setUiStrings] = React.useState(DEFAULT_IMAGE_UI_STRINGS);

	React.useEffect(() => {
		let cancelled = false;
		void loadImageActionStrings().then((s) => !cancelled && setActionStrings(s));
		void loadImageUiStrings().then((s) => !cancelled && setUiStrings(s));
		setImageError(false);
		return () => {
			cancelled = true;
		};
	}, [resolvedUri]);

	const figure = (
		<figure className="pk-composer-image-figure" data-src-text-from={block.source.from} data-block-id={block.blockId}>
			{sourcePath && !imageError ? (
				<img
					className="pk-composer-image-elem"
					src={resolvedUri}
					alt={alt}
					onError={() => setImageError(true)}
				/>
			) : (
				<span className="pk-composer-image-fallback" title={sourcePath ? '图片加载失败' : '图片路径缺失'}>
					<FileImage size={18} />
					<span className="pk-composer-image-fallback-text">{sourcePath ? caption || alt || sourcePath : '图片源不可用'}</span>
				</span>
			)}
			{caption ? <figcaption className="pk-composer-image-caption">{caption}</figcaption> : null}
		</figure>
	);

	// Toolbar shows only in an editable document with a composed coordinator + hub.
	if (!editing || !coordinator || !hub) return figure;

	const target: ComposerTarget = { kind: 'block', blockId: block.blockId };
	const disabledReason = sourcePath ? undefined : uiStrings.stale;

	const runCaption = (): void => {
		coordinator.beginCaption({ blockId: block.blockId });
	};
	const runEdit = (): void => {
		if (!sourcePath) return;
		coordinator.beginAiEdit({ instruction: instruction.trim(), target, sourcePath });
		setInstruction('');
		setEditOpen(false);
	};

	return (
		<span className="pk-composer-image-block inline-flex flex-col gap-1.5 items-start">
			{figure}
			<span className="pk-composer-image-toolbar inline-flex items-center gap-1.5" data-chrome="true">
				<Button
					variant="secondary"
					className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1`}
					disabled={Boolean(disabledReason)}
					title={disabledReason}
					aria-label={actionStrings.editTitle}
					onClick={() => setEditOpen((v) => !v)}
				>
					<WandSparkles size={14} />
					{actionStrings.editTitle}
				</Button>
				<Button
					variant="secondary"
					className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1`}
					aria-label={actionStrings.captionTitle}
					onClick={runCaption}
				>
					<Captions size={14} />
					{actionStrings.captionTitle}
				</Button>
			</span>
			{editOpen && sourcePath && (
				<input
					autoFocus
					type="text"
					className={`min-w-[220px] px-2 text-sm bg-transparent border border-[var(--background-modifier-border)] text-[var(--text-normal)] ${IMAGE_TOOLBAR_CONTROL}`}
					value={instruction}
					aria-label={uiStrings.editInstructionAria}
					placeholder={uiStrings.editInstructionPlaceholder}
					data-capability-id={IMAGE_CAPABILITY_IDS.edit}
					onChange={(e) => setInstruction(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							runEdit();
						}
						if (e.key === 'Escape') setEditOpen(false);
					}}
				/>
			)}
		</span>
	);
}
