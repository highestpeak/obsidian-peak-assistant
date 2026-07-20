export interface PromptMenuAnchor {
	top: number;
	bottom: number;
	left: number;
}

export interface PromptMenuViewport {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface PromptMenuPosition {
	top: number;
	left: number;
	placement: 'top' | 'bottom';
	maxHeight: number;
}

/**
 * Position a fixed prompt menu inside the viewport that owns the editor.
 * Keeping this calculation DOM-free makes popout-window behavior testable.
 */
export function calculatePromptMenuPosition(
	anchor: PromptMenuAnchor,
	viewport: PromptMenuViewport,
): PromptMenuPosition {
	const margin = 8;
	const minMenuHeight = 180;
	const maxMenuHeight = 300;
	const viewportBottom = viewport.top + viewport.height;
	const viewportRight = viewport.left + viewport.width;
	const menuWidth = Math.min(400, Math.max(280, viewport.width - margin * 2));
	const spaceAbove = anchor.top - viewport.top;
	const spaceBelow = viewportBottom - anchor.bottom;
	const placement = spaceAbove >= minMenuHeight || spaceAbove >= spaceBelow ? 'top' : 'bottom';
	const top = placement === 'top'
		? Math.max(viewport.top + margin, anchor.top - 6)
		: Math.min(viewportBottom - margin, anchor.bottom + 6);
	const availableHeight = placement === 'top' ? spaceAbove - margin : spaceBelow - margin;
	const maxHeight = Math.max(80, Math.min(maxMenuHeight, availableHeight));
	let left = anchor.left;
	if (left + menuWidth > viewportRight - margin) {
		left = Math.max(viewport.left + margin, viewportRight - menuWidth - margin);
	}
	left = Math.max(viewport.left + margin, left);

	return { top, left, placement, maxHeight };
}
