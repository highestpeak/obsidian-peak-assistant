import * as React from 'react';
import { Plus } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';
import { InsertTypeMenu } from './InsertTypeMenu';

export interface BetweenBlockInsertGapProps {
	anchorBlockId: string;
	nextSpacing: string;
	onSelectInsertType(typeId: string): void;
}

/**
 * Returns the real source owner only when two visible blocks are adjacent in
 * the parsed source. Folded/hidden content between them must fail closed.
 */
export function adjacentInsertionAnchor(
	blocks: readonly ComposerBlock[],
	previousBlockId: string,
	currentBlockId: string,
): string | null {
	const currentIndex = blocks.findIndex((block) => block.blockId === currentBlockId);
	if (currentIndex <= 0) return null;
	return blocks[currentIndex - 1]?.blockId === previousBlockId
		? previousBlockId
		: null;
}

/**
 * Zero-height insertion layer over the existing semantic block margin.
 *
 * Pointer movement only updates the horizontal anchor. Hovering/focusing the
 * plus freezes it and opens the shared type rail; no click is required.
 */
export function BetweenBlockInsertGap({
	anchorBlockId,
	nextSpacing,
	onSelectInsertType,
}: BetweenBlockInsertGapProps): React.ReactElement {
	const config = useComposerChrome().config.chrome;
	const closeDelayMs = config.surfacePreviewCloseDelayMs;
	const laneRef = React.useRef<HTMLDivElement | null>(null);
	const triggerRef = React.useRef<HTMLButtonElement | null>(null);
	const menuRef = React.useRef<HTMLDivElement | null>(null);
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const [open, setOpen] = React.useState(false);

	const clearClose = () => {
		if (!closeTimer.current) return;
		clearTimeout(closeTimer.current);
		closeTimer.current = null;
	};
	const positionMenu = () => {
		const lane = laneRef.current;
		const trigger = triggerRef.current;
		const menu = menuRef.current;
		if (!lane || !trigger || !menu) return;
		const laneRect = lane.getBoundingClientRect();
		const triggerRect = trigger.getBoundingClientRect();
		const anchorX = triggerRect.left - laneRect.left + triggerRect.width / 2;
		const centeredLeft = anchorX - menu.offsetWidth / 2;
		const boundedLeft = Math.max(0, Math.min(centeredLeft, lane.clientWidth - menu.offsetWidth));
		lane.style.setProperty('--pk-between-block-anchor-x', `${anchorX}px`);
		lane.style.setProperty('--pk-between-block-menu-left', `${boundedLeft}px`);
	};
	const openMenu = () => {
		clearClose();
		setOpen(true);
	};
	const scheduleClose = () => {
		clearClose();
		closeTimer.current = setTimeout(() => {
			closeTimer.current = null;
			setOpen(false);
		}, closeDelayMs);
	};
	const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
		if (open) return;
		const lane = laneRef.current;
		if (!lane) return;
		const hitAreaRect = event.currentTarget.getBoundingClientRect();
		lane.style.setProperty(
			'--pk-between-block-pointer-x',
			`${event.clientX - hitAreaRect.left}px`,
		);
	};

	React.useEffect(() => {
		if (!open) return;
		const lane = laneRef.current;
		const ownerWindow = lane?.ownerDocument.defaultView;
		const frame = ownerWindow?.requestAnimationFrame(positionMenu);
		ownerWindow?.addEventListener('resize', positionMenu);
		return () => {
			if (frame !== undefined) ownerWindow?.cancelAnimationFrame(frame);
			ownerWindow?.removeEventListener('resize', positionMenu);
		};
	}, [open]);
	React.useEffect(() => () => clearClose(), []);

	return (
		<div
			ref={laneRef}
			className="pk-between-block-insert"
			data-next-spacing={nextSpacing}
			data-insert-after-block={anchorBlockId}
			data-open={open || undefined}
			data-chrome="true"
			data-composer-surface-owner={anchorBlockId}
			onPointerEnter={clearClose}
			onPointerLeave={scheduleClose}
			onFocusCapture={clearClose}
			onBlurCapture={(event) => {
				if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
				scheduleClose();
			}}
			onKeyDown={(event) => {
				if (event.key !== 'Escape' || !open) return;
				event.preventDefault();
				clearClose();
				setOpen(false);
				triggerRef.current?.focus();
			}}
		>
			<div className="pk-between-block-insert__hit-area" onPointerMove={trackPointer}>
				<span className="pk-between-block-insert__line" aria-hidden />
				<Button
					ref={triggerRef}
					variant="ghost"
					size="sm"
					className="pk-between-block-insert__trigger"
					aria-label={config.insertDraft.chooserLabel}
					aria-haspopup="menu"
					aria-expanded={open}
					onPointerEnter={openMenu}
					onFocus={openMenu}
				>
					<Plus size={13} />
				</Button>
			</div>
			{open && (
				<div
					ref={menuRef}
					className="pk-between-block-insert__menu"
					onPointerEnter={clearClose}
				>
					<InsertTypeMenu
						onSelect={(typeId) => {
							clearClose();
							setOpen(false);
							onSelectInsertType(typeId);
						}}
					/>
				</div>
			)}
		</div>
	);
}
