import { createElement, icons } from 'lucide';

type LucideIcons = typeof icons;
type LucideIconNode = LucideIcons[keyof LucideIcons];
const iconRegistry: Record<string, LucideIconNode> = icons as Record<
	string,
	LucideIconNode
>;

/**
 * Icon helper using Lucide icons
 * Provides SVG icon creation for non-React components
 */
export interface IconOptions {
	size?: number;
	color?: string;
	strokeWidth?: number;
	class?: string;
}

// Icons consumed by the plugin include chevrons for disclosure arrows, search/folder/message glyphs,
// and various utility icons that mirror Lucide names such as `send`, `plus`, `info`, `check`, etc.
// Keep these keys synchronized with UI usage so no one removes them accidentally:
//   chevronRight, chevronDown, chevronUp, arrow-up, arrow-down,
//   folder, folderOpen, messageCircle, plus, refreshCw, refresh-cw,
//   search, star, starEmpty, x, send, copy, check, info, file-text,
//   database, book-open, books, list, lightbulb, lightbulb-on,
//   paperclip, moreHorizontal, more-horizontal
// Keeping the helper in sync ensures the UI reuses the same Lucide symbols everywhere.

/**
 * Normalize the requested icon name into PascalCase.
 */
const normalizeIconName = (rawName: string): string => {
	return rawName
		.trim()
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('');
};

/**
 * Look up Lucide icon nodes by normalized or raw name.
 */
const resolveIconNode = (iconName: string) => {
	const candidate = normalizeIconName(iconName);
	if (candidate && iconRegistry[candidate]) {
		return iconRegistry[candidate];
	}
	return iconRegistry[iconName];
};

/**
 * Create an SVG icon element from Lucide icon data
 */
export function createIcon(
	container: HTMLElement,
	iconName: string,
	options: IconOptions = {}
): HTMLElement {
	const {
		size = 16,
		color = 'currentColor',
		strokeWidth = 2,
		class: className = 'peak-icon'
	} = options;

	const iconNode = resolveIconNode(iconName);
	if (!iconNode) {
		console.warn(`Icon "${iconName}" not found, using placeholder`);
		return container.createSpan({ text: '?' });
	}

	const svg = createElement(iconNode, {
		class: className,
		width: size,
		height: size,
		stroke: color,
		'stroke-width': strokeWidth
	});

	container.appendChild(svg);
	return svg as unknown as HTMLElement;
}

/**
 * Create a chevron icon (right or down)
 */
export function createChevronIcon(
	container: HTMLElement,
	isExpanded: boolean,
	options: IconOptions = {}
): HTMLElement {
	const result = createIcon(container, isExpanded ? 'chevronDown' : 'chevronRight', {
		size: 14,
		...options
	});
	return result;
}

