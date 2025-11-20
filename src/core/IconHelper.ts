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

	// Lucide icon paths (common icons)
	const iconPaths: Record<string, string> = {
		chevronRight: 'M9 18l6-6-6-6',
		chevronDown: 'M6 9l6 6 6-6',
		chevronUp: 'M18 15l-6-6-6 6',
		// Arrow icons - more prominent than chevrons
		'arrow-up': 'M12 19V5M5 12l7-7 7 7',
		'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
		folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
		folderOpen: 'M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h12a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z',
		messageCircle: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
		plus: 'M12 5v14m7-7H5',
		refreshCw: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
		'refresh-cw': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
		search: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
		star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
		starEmpty: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
		x: 'M18 6L6 18M6 6l12 12',
		send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
		// Copy icon - two overlapping rectangles (Lucide copy)
		copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1z\nM19 5H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
		// Check icon - checkmark (Lucide check)
		check: 'M20 6L9 17l-5-5',
		// Info icon - circle with 'i' (Lucide info)
		info: 'M22 12A10 10 0 1 1 12 2a10 10 0 0 1 10 10z\nM12 16v-4\nM12 8h.01',
		// File text icon (Lucide file-text)
		'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\nM14 2v6h6\nM16 13H8\nM16 17H8\nM10 9H8',
		// Database icon (Lucide database)
		database: 'M21 5c0 1.657-3.134 3-7 3S7 6.657 7 5s3.134-3 7-3 7 1.343 7 3z\nM21 12c0 1.657-3.134 3-7 3s-7-1.343-7-3\nM21 19c0 1.657-3.134 3-7 3s-7-1.343-7-3\nM7 5v14\nM14 5v14',
		// Book open icon (Lucide book-open)
		'book-open': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\nM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
		// Books icon - stacked books (Lucide library/books)
		books: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20\nM6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z\nM8 7h6\nM8 11h6\nM8 15h6',
		// List icon (Lucide list) - for resources
		list: 'M8 6h13\nM8 12h13\nM8 18h13\nM3 6h.01\nM3 12h.01\nM3 18h.01',
		// Lightbulb icon (Lucide lightbulb) - for insights/summary
		lightbulb: 'M9 21h6\nM12 3a6 6 0 0 1 6 6c0 2.5-1.5 4.5-3 6\nM12 3a6 6 0 0 0-6 6c0 2.5 1.5 4.5 3 6',
		// Lightbulb-on icon (alternative for insights)
		'lightbulb-on': 'M9 21h6\nM12 3a6 6 0 0 1 6 6c0 2.5-1.5 4.5-3 6\nM12 3a6 6 0 0 0-6 6c0 2.5 1.5 4.5 3 6\nM12 9v6',
		// Paperclip icon (Lucide paperclip)
		paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
		// More horizontal icon (Lucide more-horizontal) - three horizontal dots
		moreHorizontal: 'M12 12h.01M19 12h.01M5 12h.01',
		// Alternative name
		'more-horizontal': 'M12 12h.01M19 12h.01M5 12h.01'
	};

	const pathData = iconPaths[iconName];
	if (!pathData) {
		console.warn(`Icon "${iconName}" not found, using placeholder`);
		return container.createSpan({ text: '?' });
	}

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', className);
	svg.setAttribute('width', size.toString());
	svg.setAttribute('height', size.toString());
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', color);
	svg.setAttribute('stroke-width', strokeWidth.toString());
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');

	// Support multiple paths separated by newline (for icons like copy)
	// Split by newline, but preserve spaces within paths
	const paths = pathData.includes('\n') 
		? pathData.split('\n').filter(p => p.trim().length > 0)
		: [pathData];
	
	paths.forEach((pathStr) => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', pathStr.trim());
		svg.appendChild(path);
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

