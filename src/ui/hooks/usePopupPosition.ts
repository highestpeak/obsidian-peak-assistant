import { useState, useEffect, RefObject } from 'react';

/**
 * Hook to calculate popup position (top or bottom) based on available space
 * Automatically selects the direction with more available space to avoid clipping
 * @param containerRef Reference to the container element
 * @param popupRef Optional reference to the popup element (for accurate height calculation)
 * @param enabled Whether to calculate position (e.g., when popup is visible)
 * @param estimatedHeight Estimated height of the popup in pixels (used if popupRef is not available)
 * @param padding Padding from viewport edges in pixels (default: 8)
 * @returns Position state: 'top' | 'bottom'
 */
export function usePopupPosition(
	containerRef: RefObject<HTMLElement>,
	popupRef: RefObject<HTMLElement> | null = null,
	enabled: boolean = true,
	estimatedHeight: number = 400,
	padding: number = 8
): 'top' | 'bottom' {
	const [position, setPosition] = useState<'top' | 'bottom'>('bottom');

	useEffect(() => {
		if (!enabled || !containerRef.current) return;

		const calculatePosition = () => {
			const container = containerRef.current;
			if (!container) return;

			const containerRect = container.getBoundingClientRect();
			
			// Try to get actual height from popup element, otherwise use estimated height
			let popupHeight = estimatedHeight;
			if (popupRef?.current) {
				popupHeight = popupRef.current.offsetHeight || estimatedHeight;
			}

			// Calculate available space with padding
			const spaceBelow = window.innerHeight - containerRect.bottom - padding;
			const spaceAbove = containerRect.top - padding;

			// Choose direction based on available space
			// Prefer the direction with more space, or bottom if equal
			if (spaceAbove > spaceBelow && spaceAbove >= popupHeight) {
				// Enough space above and more than below
				setPosition('top');
			} else if (spaceBelow < popupHeight && spaceAbove >= popupHeight) {
				// Not enough space below but enough above
				setPosition('top');
			} else {
				// Default to bottom (even if space is limited, it's better than top in most cases)
				setPosition('bottom');
			}
		};

		// Calculate position immediately
		calculatePosition();

		// Use requestAnimationFrame to ensure DOM has updated
		const rafId = requestAnimationFrame(() => {
			calculatePosition();
		});

		// Recalculate on resize and scroll
		window.addEventListener('resize', calculatePosition);
		window.addEventListener('scroll', calculatePosition, true);

		return () => {
			cancelAnimationFrame(rafId);
			window.removeEventListener('resize', calculatePosition);
			window.removeEventListener('scroll', calculatePosition, true);
		};
	}, [enabled, containerRef, popupRef, estimatedHeight, padding]);

	return position;
}

