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
import { Captions, Copy, FileImage, Maximize2, Pencil, ScanLine, WandSparkles } from 'lucide-react';
import type { ComposerBlock, ComposerDocumentSnapshot, ComposerTarget } from '@/core/composer';
import { DEFAULT_IMAGE_ACTION_STRINGS, IMAGE_CAPABILITY_IDS, parseImageBlock } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { EasyCopyMenu } from '../../chrome/EasyCopyMenu';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { ComposerImageLightbox } from './ComposerImageLightbox';
import { ImageConverterPanel } from './ImageConverterPanel';
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

function imageMetaFromSource(raw: string): { alt: string; caption: string; width?: number } {
	const parsed = parseImageBlock(raw);
	if (!parsed) return { alt: '', caption: '' };
	const alt = parsed.alt ?? '';
	return {
		alt,
		caption: parsed.caption ?? alt,
		...(parsed.width !== undefined ? { width: parsed.width } : {}),
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
	const imagePath = imageRefOf(chrome.snapshot, block.renderModel.raw, block.blockId);
	const { alt, caption, width } = imageMetaFromSource(block.renderModel.raw);
	const resolvedUri = imagePath
		? resolvePreviewUri?.(imagePath, chrome.snapshot?.filePath) ?? imagePath
		: '';
	const [editOpen, setEditOpen] = React.useState(false);
	const [converterOpen, setConverterOpen] = React.useState(false);
	const [renameOpen, setRenameOpen] = React.useState(false);
	const [copyOpen, setCopyOpen] = React.useState(false);
	const [lightboxOpen, setLightboxOpen] = React.useState(false);
	const [instruction, setInstruction] = React.useState('');
	const [renameValue, setRenameValue] = React.useState('');
	const [imageError, setImageError] = React.useState(false);
	const [actionStrings, setActionStrings] = React.useState(DEFAULT_IMAGE_ACTION_STRINGS);
	const [uiStrings, setUiStrings] = React.useState(DEFAULT_IMAGE_UI_STRINGS);
	const figureRef = React.useRef<HTMLElement | null>(null);
	const imageRef = React.useRef<HTMLImageElement | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		void loadImageActionStrings().then((s) => !cancelled && setActionStrings(s));
		void loadImageUiStrings().then((s) => !cancelled && setUiStrings(s));
		setImageError(false);
		return () => {
			cancelled = true;
		};
	}, [resolvedUri]);

	const toolbarOpen = editing && Boolean(coordinator) && Boolean(hub);
	const target: ComposerTarget = { kind: 'block', blockId: block.blockId };
	const runCaption = (): void => {
		if (!coordinator || !hub) return;
		coordinator.beginCaption({ blockId: block.blockId });
	};
	const runEdit = (): void => {
		if (!coordinator || !hub || !imagePath) return;
		coordinator.beginAiEdit({ instruction: instruction.trim(), target, sourcePath: imagePath });
		setInstruction('');
		setEditOpen(false);
	};
	const runRename = (): void => {
		const value = renameValue.trim();
		if (!coordinator || !hub || !imagePath || !value || value === baseNameOfPath(imagePath)) return;
		coordinator.beginRename({
			sourcePath: imagePath,
			blockId: block.blockId,
			desiredBaseName: value,
			...(imageRef.current?.naturalWidth ? { width: imageRef.current.naturalWidth } : {}),
			...(imageRef.current?.naturalHeight ? { height: imageRef.current.naturalHeight } : {}),
		});
		setRenameValue('');
		setRenameOpen(false);
	};
	const runConvert = async (output: {
		bytes: Uint8Array;
		mimeType: string;
		width: number;
		height: number;
	}): Promise<void> => {
		if (!coordinator || !imagePath) return;
		await coordinator.beginConvert({
			...output,
			baseName: `${baseNameOfPath(imagePath)}-edited`,
			replaceBlockId: block.blockId,
			originalPath: imagePath,
		});
		setConverterOpen(false);
	};
	const figure = (
		<figure
			ref={figureRef}
			className="pk-composer-image-figure real-image-frame"
			data-src-text-from={block.source.from}
			data-block-id={block.blockId}
			style={width ? { width: `${width}px`, maxWidth: '100%' } : undefined}
		>
			{imagePath && !imageError ? (
				<img
					ref={imageRef}
					className="pk-composer-image-elem"
					src={resolvedUri}
					alt={alt}
					role="button"
					tabIndex={0}
					aria-label={uiStrings.fullscreen}
					onError={() => setImageError(true)}
					onClick={() => setLightboxOpen(true)}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						setLightboxOpen(true);
					}}
				/>
			) : (
				<span className="pk-composer-image-fallback" title={imagePath ? uiStrings.loadFailed : uiStrings.sourceUnavailable}>
					<FileImage size={18} />
					<span className="pk-composer-image-fallback-text">{imagePath ? caption || alt || imagePath : uiStrings.sourceUnavailable}</span>
				</span>
			)}
			{caption ? <figcaption className="pk-composer-image-caption">{caption}</figcaption> : null}
			{toolbarOpen ? (
				<span className="pk-composer-image-toolbar image-toolbar inline-flex items-center gap-1.5" data-chrome="true">
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						disabled={!imagePath}
						aria-label={uiStrings.fullscreen}
						onClick={() => setLightboxOpen(true)}
					>
						<Maximize2 size={14} />
						{uiStrings.fullscreen}
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						disabled={!imagePath || imageError}
						aria-label={uiStrings.editImage}
						onClick={() => {
							setConverterOpen((value) => !value);
							setEditOpen(false);
							setRenameOpen(false);
							setCopyOpen(false);
						}}
					>
						<Pencil size={14} />
						{uiStrings.editImage}
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						disabled={!imagePath}
						aria-label={uiStrings.rename}
						onClick={() => {
							setRenameValue(baseNameOfPath(imagePath ?? ''));
							setRenameOpen((value) => !value);
							setConverterOpen(false);
							setEditOpen(false);
							setCopyOpen(false);
						}}
					>
						<ScanLine size={14} />
						{uiStrings.rename}
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						aria-label={uiStrings.copy}
						onClick={() => {
							setCopyOpen((value) => !value);
							setConverterOpen(false);
							setEditOpen(false);
							setRenameOpen(false);
						}}
					>
						<Copy size={14} />
						{uiStrings.copy}
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						aria-label={actionStrings.captionTitle}
						onClick={runCaption}
					>
						<Captions size={14} />
						{actionStrings.captionTitle}
					</Button>
					<Button
						variant="secondary"
						className={`${IMAGE_TOOLBAR_CONTROL} px-2 gap-1 pk-composer-image-toolbar__text`}
						disabled={!imagePath}
						title={imagePath ? undefined : uiStrings.stale}
						aria-label={actionStrings.editTitle}
						onClick={() => {
							setEditOpen((value) => !value);
							setConverterOpen(false);
							setRenameOpen(false);
							setCopyOpen(false);
						}}
					>
						<WandSparkles size={14} />
						{actionStrings.editTitle}
					</Button>
				</span>
			) : null}
		</figure>
	);

	if (!toolbarOpen) {
		return (
			<>
				{figure}
				{lightboxOpen && imagePath && !imageError ? (
					<ComposerImageLightbox
						anchor={figureRef.current}
						initialSrc={resolvedUri}
						initialAlt={caption || alt}
						labels={uiStrings.lightbox}
						onClose={() => setLightboxOpen(false)}
					/>
				) : null}
			</>
		);
	}

	return (
		<div className="pk-composer-image-block inline-flex flex-col gap-1.5 items-start">
			{figure}
			{lightboxOpen && imagePath && !imageError ? (
				<ComposerImageLightbox
					anchor={figureRef.current}
					initialSrc={resolvedUri}
					initialAlt={caption || alt}
					labels={uiStrings.lightbox}
					onClose={() => setLightboxOpen(false)}
				/>
			) : null}
			{copyOpen ? (
				<EasyCopyMenu
					markdown={block.renderModel.raw}
					blockKind={block.kind}
					rasterTargetRef={figureRef}
					onClose={() => setCopyOpen(false)}
				/>
			) : null}
			{renameOpen && imagePath ? (
				<span className="pk-composer-image-inline-form pk-composer-panel" data-chrome="true">
					<input
						autoFocus
						type="text"
						value={renameValue}
						aria-label={uiStrings.renameAria}
						placeholder={uiStrings.renamePlaceholder}
						onChange={(event) => setRenameValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								runRename();
							}
							if (event.key === 'Escape') setRenameOpen(false);
						}}
					/>
					<Button
						variant="primary"
						disabled={!renameValue.trim() || renameValue.trim() === baseNameOfPath(imagePath)}
						onClick={runRename}
					>
						{uiStrings.renameApply}
					</Button>
				</span>
			) : null}
			{converterOpen && imageRef.current && coordinator ? (
				<ImageConverterPanel
					image={imageRef.current}
					labels={uiStrings.converter}
					defaultQuality={coordinator.converterDefaultQuality}
					onCancel={() => setConverterOpen(false)}
					onConvert={runConvert}
				/>
			) : null}
			{editOpen && imagePath && (
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
		</div>
	);
}

function baseNameOfPath(path: string): string {
	const file = path.slice(path.lastIndexOf('/') + 1);
	const dot = file.lastIndexOf('.');
	return dot > 0 ? file.slice(0, dot) : file;
}
