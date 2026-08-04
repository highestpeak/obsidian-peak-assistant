import * as React from 'react';
import { createPortal } from 'react-dom';

interface CollectionActionPosition {
	left: number;
	top: number;
	placement: 'left' | 'right';
}

export function CollectionActionPopover({
	anchorRef,
	children,
	onPointerEnter,
	onPointerLeave,
}: {
	anchorRef: React.RefObject<HTMLDivElement>;
	children: React.ReactNode;
	onPointerEnter: () => void;
	onPointerLeave: () => void;
}): React.ReactElement | null {
	const popoverRef = React.useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = React.useState<CollectionActionPosition | null>(null);
	const ownerDocument = anchorRef.current?.ownerDocument;

	React.useLayoutEffect(() => {
		const rail = anchorRef.current;
		const popover = popoverRef.current;
		const ownerWindow = rail?.ownerDocument.defaultView;
		if (!rail || !popover || !ownerWindow) return;

		const updatePosition = () => {
			const dragHandle = rail.querySelector<HTMLElement>('.pk-composer-drag') ?? rail;
			const anchorRect = dragHandle.getBoundingClientRect();
			const popoverRect = popover.getBoundingClientRect();
			const gap = 8;
			const edge = 8;
			const leftCandidate = anchorRect.left - gap - popoverRect.width;
			const rightCandidate = anchorRect.right + gap;
			const fitsLeft = leftCandidate >= edge;
			const fitsRight = rightCandidate + popoverRect.width <= ownerWindow.innerWidth - edge;
			const placement: CollectionActionPosition['placement'] = fitsLeft || !fitsRight
				? 'left'
				: 'right';
			const desiredLeft = placement === 'left' ? leftCandidate : rightCandidate;
			const left = Math.min(
				Math.max(edge, desiredLeft),
				Math.max(edge, ownerWindow.innerWidth - popoverRect.width - edge),
			);
			const top = Math.min(
				Math.max(edge, anchorRect.top),
				Math.max(edge, ownerWindow.innerHeight - popoverRect.height - edge),
			);
			setPosition({ left, top, placement });
		};

		updatePosition();
		ownerWindow.addEventListener('resize', updatePosition);
		rail.ownerDocument.addEventListener('scroll', updatePosition, true);
		const resizeObserver = new ownerWindow.ResizeObserver(updatePosition);
		resizeObserver.observe(rail);
		resizeObserver.observe(popover);
		return () => {
			ownerWindow.removeEventListener('resize', updatePosition);
			rail.ownerDocument.removeEventListener('scroll', updatePosition, true);
			resizeObserver.disconnect();
		};
	}, [anchorRef]);

	if (!ownerDocument) return null;
	return createPortal(
		<div
			ref={popoverRef}
			className="peak-design-root peak-composer-root pk-collection-action-popover"
			data-positioned={position ? 'true' : undefined}
			data-placement={position?.placement}
			style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
		>
			{children}
		</div>,
		ownerDocument.body,
	);
}
