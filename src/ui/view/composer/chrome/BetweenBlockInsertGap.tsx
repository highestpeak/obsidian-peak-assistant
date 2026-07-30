import * as React from 'react';
import { Plus } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';
import { InsertTypeMenu } from './InsertTypeMenu';
import { useComposerSurfaces } from './ComposerSurfaceCoordinator';

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
 * Entering the gap captures one horizontal anchor. Hovering/focusing the stable
 * plus opens the shared type rail after the configured intent delay; no click
 * is required.
 */
export function BetweenBlockInsertGap({
	anchorBlockId,
	nextSpacing,
	onSelectInsertType,
}: BetweenBlockInsertGapProps): React.ReactElement {
	const config = useComposerChrome().config.chrome;
	const closeDelayMs = config.surfacePreviewCloseDelayMs;
	const surfaces = useComposerSurfaces();
	const {
		active: activeSurface,
		canClaim: canClaimSurface,
		claim: claimSurface,
		release: releaseSurface,
	} = surfaces;
	const surfaceId = React.useId();
	const laneRef = React.useRef<HTMLDivElement | null>(null);
	const triggerRef = React.useRef<HTMLButtonElement | null>(null);
	const menuRef = React.useRef<HTMLDivElement | null>(null);
	const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const anchorCaptured = React.useRef(false);
	const [armed, setArmed] = React.useState(false);
	const [open, setOpen] = React.useState(false);

	const anchorBlock = (): HTMLElement | null => {
		const candidate = laneRef.current?.previousElementSibling;
		if (!(candidate instanceof HTMLElement)) return null;
		return candidate.dataset.blockId === anchorBlockId ? candidate : null;
	};
	const clearAnchorHoverBridge = () => {
		anchorBlock()?.removeAttribute('data-gap-hover-bridge');
	};
	const startAnchorHoverBridge = (relatedTarget: EventTarget | null) => {
		const anchor = anchorBlock();
		const NodeCtor = anchor?.ownerDocument.defaultView?.Node;
		if (!anchor || !NodeCtor || !(relatedTarget instanceof NodeCtor)) return;
		if (!anchor.contains(relatedTarget)) return;
		anchor.setAttribute('data-gap-hover-bridge', 'true');
	};
	const clearClose = () => {
		if (!closeTimer.current) return;
		clearTimeout(closeTimer.current);
		closeTimer.current = null;
	};
	const clearOpen = () => {
		if (!openTimer.current) return;
		clearTimeout(openTimer.current);
		openTimer.current = null;
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
		if (!canClaimSurface('menu', surfaceId)) return;
		clearOpen();
		clearClose();
		claimSurface({ id: surfaceId, kind: 'menu', ownerId: anchorBlockId });
		setOpen(true);
	};
	const scheduleOpen = () => {
		if (open || openTimer.current) return;
		openTimer.current = setTimeout(() => {
			openTimer.current = null;
			openMenu();
		}, config.surfaceIntentOpenDelayMs);
	};
	const scheduleClose = () => {
		clearOpen();
		clearClose();
		closeTimer.current = setTimeout(() => {
			closeTimer.current = null;
			anchorCaptured.current = false;
			setOpen(false);
			setArmed(false);
			releaseSurface(surfaceId);
			clearAnchorHoverBridge();
		}, closeDelayMs);
	};
	const acquirePointer = (event: React.PointerEvent<HTMLDivElement>) => {
		if (anchorCaptured.current || open) return;
		const lane = laneRef.current;
		if (!lane) return;
		anchorCaptured.current = true;
		const hitAreaRect = event.currentTarget.getBoundingClientRect();
		lane.style.setProperty(
			'--pk-between-block-pointer-x',
			`${event.clientX - hitAreaRect.left}px`,
		);
		setArmed(true);
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
	React.useEffect(() => () => {
		clearOpen();
		clearClose();
		releaseSurface(surfaceId);
		clearAnchorHoverBridge();
	}, [releaseSurface, surfaceId]);
	React.useEffect(() => {
		if (!activeSurface || activeSurface.id === surfaceId || !open) return;
		if (canClaimSurface('menu', surfaceId)) return;
		anchorCaptured.current = false;
		setOpen(false);
		setArmed(false);
		clearAnchorHoverBridge();
	}, [activeSurface, canClaimSurface, open, surfaceId]);

	return (
		<div
			ref={laneRef}
			className="pk-between-block-insert"
			data-next-spacing={nextSpacing}
			data-insert-after-block={anchorBlockId}
			data-armed={armed || undefined}
			data-open={open || undefined}
			data-chrome="true"
			data-composer-surface-owner={anchorBlockId}
			onPointerEnter={(event) => {
				clearClose();
				startAnchorHoverBridge(event.relatedTarget);
			}}
			onPointerLeave={(event) => {
				const anchor = anchorBlock();
				const NodeCtor = anchor?.ownerDocument.defaultView?.Node;
				if (anchor && NodeCtor && event.relatedTarget instanceof NodeCtor) {
					if (anchor.contains(event.relatedTarget)) clearAnchorHoverBridge();
				}
				scheduleClose();
			}}
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
				setArmed(true);
				releaseSurface(surfaceId);
				clearAnchorHoverBridge();
				triggerRef.current?.focus();
			}}
		>
			<div className="pk-between-block-insert__hit-area" onPointerEnter={acquirePointer}>
				<span className="pk-between-block-insert__line" aria-hidden />
				<Button
					ref={triggerRef}
					variant="ghost"
					size="sm"
					className="pk-between-block-insert__trigger"
					aria-label={config.insertDraft.chooserLabel}
					aria-haspopup="menu"
					aria-expanded={open}
					onPointerEnter={scheduleOpen}
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
							anchorCaptured.current = false;
							setOpen(false);
							setArmed(false);
							releaseSurface(surfaceId);
							clearAnchorHoverBridge();
							onSelectInsertType(typeId);
						}}
					/>
				</div>
			)}
		</div>
	);
}
