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
		'arrow-up': 'M18 15l-6-6-6 6\nM12 9v12',
		'arrow-down': 'M6 9l6 6 6-6\nM12 15V3',
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
		'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\nM14 2v6h6\nM16 13H8\nM16 17H8\nM10 9H8'
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

