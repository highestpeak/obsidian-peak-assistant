import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '../shared-ui/button';

/**
 * Menu item interface
 */
export interface NavigableMenuItem {
	id: string;
	label: string;
	description?: string;
	icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode);
	showArrow?: boolean; // Whether to show a right arrow
	value: string; // The value to insert when selected
	disabled?: boolean;
	/** Group label for sectioned menus (e.g. "Recent", "My Templates") */
	group?: string;
	/** Display metadata shown as a right-aligned badge (e.g. "1.2k words") */
	meta?: string;
}

/**
 * Navigable menu props
 */
export interface NavigableMenuProps {
	items: NavigableMenuItem[];
	onSelect: (item: NavigableMenuItem) => void;
	onClose: () => void;
	className?: string;
	maxHeight?: string;
	emptyMessage?: string;
	loadingMessage?: string;
	isLoading?: boolean; // Whether the menu is in loading state
}

/**
 * Navigable menu component with keyboard navigation
 */
export const NavigableMenu: React.FC<NavigableMenuProps> = ({
	items,
	onSelect,
	onClose,
	className,
	maxHeight = '200px',
	emptyMessage = 'No items found',
	loadingMessage = 'Loading...',
	isLoading = false,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const [selectedItemRect, setSelectedItemRect] = useState<DOMRect | null>(null);

	// Filter out disabled items for navigation - memoized to prevent unnecessary re-renders
	const enabledItems = React.useMemo(() => items.filter(item => !item.disabled), [items]);
	const currentItem = enabledItems[selectedIndex];

	const itemsIds = items.map(item => item.id).join(',');

	// Reset selection when items change
	useEffect(() => {
		setSelectedIndex(0);
		setSelectedItemRect(null);
	}, [itemsIds]);

	/** Measure the selected item's bounding rect from the DOM. */
	const measureSelectedRect = useCallback(() => {
		if (!menuRef.current || enabledItems.length === 0) return;
		const el = menuRef.current.querySelector(`[data-item-id="${enabledItems[selectedIndex]?.id}"]`) as HTMLElement;
		if (el) setSelectedItemRect(el.getBoundingClientRect());
	}, [enabledItems, selectedIndex]);

	// Update selected item position when selection changes
	React.useLayoutEffect(measureSelectedRect, [measureSelectedRect]);

	// Recalculate position on window resize (debounced)
	useEffect(() => {
		let timeoutId: NodeJS.Timeout;
		const handleResize = () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(measureSelectedRect, 100);
		};
		window.addEventListener('resize', handleResize);
		return () => { window.removeEventListener('resize', handleResize); clearTimeout(timeoutId); };
	}, [measureSelectedRect]);

	// Calculate floating description position and dimensions
	const floatingDescription = React.useMemo(() => {
		if (!selectedItemRect || !enabledItems[selectedIndex]?.description) return null;
		if (!menuRef.current) return null;

		const MAX_W = 300, MAX_H = 200, M = 8, MIN_W = 100;
		const vw = window.innerWidth, vh = window.innerHeight;
		const r = selectedItemRect;
		const spaceR = vw - r.right, spaceL = r.left;

		let left: number, top: number, width: number;
		if (spaceR >= MIN_W) {
			width = Math.min(MAX_W, spaceR - M); left = r.right + M; top = r.top;
		} else if (spaceL >= MIN_W) {
			width = Math.min(MAX_W, spaceL - M); left = r.left - width - M; top = r.top;
		} else {
			width = Math.min(MAX_W, vw - r.left - 2 * M); left = Math.max(M, r.left); top = r.bottom;
		}
		top = Math.max(M, Math.min(top, vh - MAX_H - M));

		return { left, top, width, content: { label: enabledItems[selectedIndex].label, description: enabledItems[selectedIndex].description } };
	}, [selectedItemRect, enabledItems, selectedIndex]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex(prev => (prev + 1) % enabledItems.length);
				break;
			case 'ArrowUp':
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex(prev => (prev - 1 + enabledItems.length) % enabledItems.length);
				break;
			case 'Enter':
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				if (currentItem) {
					onSelect(currentItem);
				}
				break;
			case 'Escape':
				e.preventDefault();
				e.stopPropagation();
				onClose();
				break;
		}
	}, [enabledItems.length, currentItem?.id, onSelect, onClose]); // Use currentItem.id for stable dependency

	// Add keyboard event listener only when there are items (capture phase for higher priority)
	useEffect(() => {
		if (items.length > 0) {
			document.addEventListener('keydown', handleKeyDown, true);
			return () => {
				document.removeEventListener('keydown', handleKeyDown, true);
			};
		}
	}, [handleKeyDown, items.length]);

	// Scroll selected item into view
	useEffect(() => {
		if (menuRef.current && currentItem) {
			const selectedElement = menuRef.current.querySelector(`[data-item-id="${currentItem.id}"]`) as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({
					block: 'nearest',
					behavior: 'smooth'
				});
			}
		}
	}, [selectedIndex, currentItem?.id]); // Use currentItem.id for stable dependency

	if (items.length === 0) {
		return (
			<div className={cn(
				'pktw-flex pktw-items-center pktw-justify-center pktw-p-4 pktw-text-sm pktw-text-muted-foreground',
				className
			)}>
				{isLoading ? loadingMessage : emptyMessage}
			</div>
		);
	}

	return (
		<>
			<div
				ref={menuRef}
				className={cn(
					'pktw-max-h-[200px] pktw-overflow-y-auto pktw-bg-white pktw-border pktw-rounded-md pktw-shadow-lg',
					className
				)}
				style={{ maxHeight }}
			>
				{enabledItems.map((item, index) => {
					const isSelected = index === selectedIndex;
					const isDisabled = item.disabled;

					return (
						<Button
							key={item.id}
							data-item-id={item.id}
							variant="ghost"
							type="button"
							onClick={() => !isDisabled && onSelect(item)}
							disabled={isDisabled}
							className={cn(
								'pktw-w-full pktw-px-3 pktw-py-2 pktw-text-left pktw-text-sm pktw-transition-colors pktw-h-auto',
								'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
								isSelected && 'pktw-bg-accent pktw-text-accent-foreground',
								isDisabled && 'pktw-opacity-50 pktw-cursor-not-allowed'
							)}
						>
							<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-w-full">
								<div className="pktw-flex-shrink-0">
									{typeof item.icon === 'function' ? item.icon(isSelected) : item.icon}
								</div>
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-font-medium pktw-truncate">
										{item.label}
									</div>
									{item.description && (
										<div className={cn("pktw-text-xs pktw-truncate pktw-text-left", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")}>
											{item.description}
										</div>
									)}
								</div>
								{item.showArrow && (
									<span className={cn("pktw-text-sm pktw-flex-shrink-0", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")}>
										&gt;
									</span>
								)}
							</div>
						</Button>
					);
				})}

				{/* Floating description for selected item */}
				{floatingDescription && (
					<div
						className="pktw-fixed pktw-z-[9999] pktw-max-w-sm pktw-p-3 pktw-bg-popover pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-xl pktw-text-sm pktw-pointer-events-none"
						style={{ left: floatingDescription.left, top: floatingDescription.top, width: floatingDescription.width }}
					>
						<div className="pktw-font-medium pktw-mb-2 pktw-text-foreground">{floatingDescription.content.label}</div>
						<div className="pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-break-words">{floatingDescription.content.description}</div>
					</div>
				)}
			</div>
		</>
	);
};
