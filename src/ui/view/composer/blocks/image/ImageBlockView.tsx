/**
 * Peak Composer — image block view + object toolbar (WP7 integration).
 *
 * Renders an image reference block with its object-toolbar AI actions wired to
 * the per-document {@link ImageCapabilityCoordinator}: 图注 (caption) streams a
 * figcaption into the SAME figure, and AI 改图 (instruction-first edit) opens an
 * inline instruction field then routes to the media-generation edit flow. Both
 * open a candidate review card under the block (the shared candidate host in
 * ComposerRoot), so accept lands atomically through the transaction hub.
 *
 * Availability is honest: with no coordinator composed (harness / read-only host)
 * OR no resolvable vault path, the actions render disabled with a reason — never
 * a fake button. The reference itself always renders verbatim (no hidden state).
 */

import * as React from 'react';
import { Captions, WandSparkles } from 'lucide-react';
import type { ComposerBlock, ComposerDocumentSnapshot, ComposerTarget } from '@/core/composer';
import { DEFAULT_IMAGE_ACTION_STRINGS, IMAGE_CAPABILITY_IDS } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_IMAGE_UI_STRINGS, loadImageActionStrings, loadImageUiStrings } from './imageUiConfig';

const CONTROL = 'h-[28px] rounded-[var(--pk-radius-md)]';

/** Resolve the vault path this image block references (first image native ref). */
function imagePathOf(snapshot: ComposerDocumentSnapshot | null, blockId: string): string | null {
	if (!snapshot) return null;
	const ref = snapshot.nativeRefs.find((r) => r.blockId === blockId && r.kind === 'image');
	return ref?.target ?? null;
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
	const sourcePath = imagePathOf(chrome.snapshot, block.blockId);
	const [editOpen, setEditOpen] = React.useState(false);
	const [instruction, setInstruction] = React.useState('');
	const [actionStrings, setActionStrings] = React.useState(DEFAULT_IMAGE_ACTION_STRINGS);
	const [uiStrings, setUiStrings] = React.useState(DEFAULT_IMAGE_UI_STRINGS);

	React.useEffect(() => {
		let cancelled = false;
		void loadImageActionStrings().then((s) => !cancelled && setActionStrings(s));
		void loadImageUiStrings().then((s) => !cancelled && setUiStrings(s));
		return () => {
			cancelled = true;
		};
	}, []);

	const ref = (
		<span
			className="pk-composer-ref"
			data-src-text-from={block.source.from}
			data-block-id={block.blockId}
		>
			{block.renderModel.raw}
		</span>
	);

	// Toolbar shows only in an editable document with a composed coordinator + hub.
	if (!editing || !coordinator || !hub) return ref;

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
			{ref}
			<span className="pk-composer-image-toolbar inline-flex items-center gap-1.5" data-chrome="true">
				<Button
					variant="secondary"
					className={`${CONTROL} px-2 gap-1`}
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
					className={`${CONTROL} px-2 gap-1`}
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
					className={`min-w-[220px] px-2 text-sm bg-transparent border border-[var(--background-modifier-border)] text-[var(--text-normal)] ${CONTROL}`}
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
