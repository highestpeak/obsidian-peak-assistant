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
	color?: string; // For tag-style items like prompts
	icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode);
	rightIcon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode); // Icon on the right side
	value: string; // The value to insert when selected
	disabled?: boolean;
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
	isTagStyle?: boolean; // For prompt-style tags with colors
	containerRef?: React.RefObject<HTMLElement>; // Reference to container element for position calculation
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
	isTagStyle = false,
	containerRef,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const [selectedItemRect, setSelectedItemRect] = useState<DOMRect | null>(null);

	// Filter out disabled items for navigation - memoized to prevent unnecessary re-renders
	const enabledItems = React.useMemo(() => items.filter(item => !item.disabled), [items]);
	const currentItem = enabledItems[selectedIndex];

	// Get items length and ids for stable dependencies
	const itemsLength = items.length;
	const itemsIds = items.map(item => item.id).join(',');

	// Reset selection when items change
	useEffect(() => {
		setSelectedIndex(0);
		setSelectedItemRect(null);
	}, [itemsIds]); // Use stable string instead of items array

	// Update selected item position when selection changes - use useLayoutEffect to ensure DOM is ready
	React.useLayoutEffect(() => {
		if (menuRef.current && enabledItems.length > 0) {
			const selectedItem = menuRef.current.querySelector(`[data-item-id="${enabledItems[selectedIndex]?.id}"]`) as HTMLElement;
			if (selectedItem) {
				const rect = selectedItem.getBoundingClientRect();
				setSelectedItemRect(rect);
			}
		}
	}, [enabledItems, selectedIndex]);

	// Clear selected item rect when component unmounts or items change
	useEffect(() => {
		return () => {
			setSelectedItemRect(null);
		};
	}, [itemsIds]);

	// Recalculate position on window resize - throttled to avoid excessive updates
	useEffect(() => {
		let timeoutId: NodeJS.Timeout;

		const handleResize = () => {
			// Clear existing timeout
			if (timeoutId) clearTimeout(timeoutId);

			// Debounce the update - trigger recalculation without depending on current values
			timeoutId = setTimeout(() => {
				// Use a fresh calculation instead of depending on stale closure values
				const currentEnabledItems = items.filter(item => !item.disabled);
				const currentSelectedIndex = Math.min(selectedIndex, currentEnabledItems.length - 1);

				if (menuRef.current && currentEnabledItems.length > 0) {
					const selectedItem = menuRef.current.querySelector(`[data-item-id="${currentEnabledItems[currentSelectedIndex]?.id}"]`) as HTMLElement;
					if (selectedItem) {
						const rect = selectedItem.getBoundingClientRect();
						setSelectedItemRect(rect);
					}
				}
			}, 100); // 100ms debounce
		};

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, []); // No dependencies to avoid loops

	// Calculate floating description position and dimensions
	// todo we need to get a better calculation algorithm for the menu position
	const floatingDescription = React.useMemo(() => {
		if (!selectedItemRect || !enabledItems[selectedIndex]?.description) {
			return null;
		}

		const POPOVER_WIDTH = 300;
		const POPOVER_HEIGHT = 200; // Approximate max height
		const MARGIN = 8;

		// Get container bounds for relative positioning (if provided)
		const containerRect = containerRef?.current?.getBoundingClientRect();

		// Get menu container bounds for relative positioning
		const menuRect = menuRef.current?.getBoundingClientRect();
		if (!menuRect) return null;

		// Convert selected item coordinates to relative to menu container
		const relativeItemLeft = selectedItemRect.left - menuRect.left;
		const relativeItemRight = selectedItemRect.right - menuRect.left;

		// Calculate available space within menu container
		const spaceOnRight = menuRect.width - relativeItemRight;
		const spaceOnLeft = relativeItemLeft;

		// For very narrow menus, allow showing outside the menu bounds
		// Check viewport space as fallback
		const viewportWidth = window.innerWidth;
		const viewportSpaceOnRight = viewportWidth - selectedItemRect.right;
		const viewportSpaceOnLeft = selectedItemRect.left;

		const effectiveSpaceOnRight = viewportSpaceOnRight;
		const effectiveSpaceOnLeft = viewportSpaceOnLeft;
		const MIN_WIDTH = 100; // Reduced minimum width since we allow overflow

		// Decide position: prefer right, fallback to left
		const showOnRight = effectiveSpaceOnRight >= MIN_WIDTH;
		const showOnLeft = !showOnRight && effectiveSpaceOnLeft >= MIN_WIDTH;

		let left, top, actualWidth, positioning;

		if (showOnRight) {
			actualWidth = Math.min(POPOVER_WIDTH, effectiveSpaceOnRight - MARGIN);
			// Position in viewport (outside menu bounds)
			left = selectedItemRect.right + MARGIN;
			top = selectedItemRect.top;
			positioning = 'viewport';
		} else if (showOnLeft) {
			actualWidth = Math.min(POPOVER_WIDTH, effectiveSpaceOnLeft - MARGIN);
			// Position in viewport (outside menu bounds)
			left = selectedItemRect.left - actualWidth - MARGIN;
			top = selectedItemRect.top;
			positioning = 'viewport';
		} else {
			// Fallback: show below - always use viewport positioning for below
			actualWidth = Math.min(POPOVER_WIDTH, viewportWidth - selectedItemRect.left - 2 * MARGIN);
			left = Math.max(MARGIN, selectedItemRect.left);
			top = selectedItemRect.bottom;
			positioning = 'viewport';
		}

		// Adjust left position relative to container if containerRef is provided
		if (containerRect) {
			left -= containerRect.left;
		}

		console.debug("[NavigableMenu] popover position debug", {
			selectedItemRect,
			menuRect,
			relativeItemLeft,
			relativeItemRight,
			spaceOnRight,
			spaceOnLeft,
			effectiveSpaceOnRight,
			effectiveSpaceOnLeft,
			showOnRight,
			showOnLeft,
			left,
			top,
			actualWidth,
			positioning,
			POPOVER_WIDTH,
			POPOVER_HEIGHT,
			MIN_WIDTH,
		});

		return {
			left,
			top,
			width: actualWidth,
			positioning,
			content: {
				label: enabledItems[selectedIndex].label,
				description: enabledItems[selectedIndex].description
			}
		};
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

					if (isTagStyle) {
						// Tag style for prompts
						const button = (
							<Button
								key={item.id}
								variant="ghost"
								data-item-id={item.id}
								type="button"
								onClick={() => !isDisabled && onSelect(item)}
								disabled={isDisabled}
								className={cn(
									'pktw-items-start pktw-w-full pktw-px-3 pktw-py-2 pktw-text-left pktw-transition-colors pktw-h-auto',
									'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
									isSelected && 'pktw-bg-accent pktw-text-accent-foreground',
									isDisabled && 'pktw-opacity-50 pktw-cursor-not-allowed'
								)}
							>
								<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-w-full">
									<span
										className={cn(
											'pktw-text-xs pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded pktw-transition-colors pktw-whitespace-nowrap pktw-flex-shrink-0',
											item.color || 'pktw-bg-blue-500/15 pktw-text-blue-700 dark:pktw-bg-blue-500/20 dark:pktw-text-blue-400',
											isSelected && 'pktw-bg-white pktw-text-blue-500 dark:pktw-bg-white dark:pktw-text-blue-500'
										)}
									>
										{item.label}
									</span>
									{item.description && (
										<span className={cn("pktw-text-xs pktw-truncate pktw-flex-1 pktw-min-w-0 pktw-text-left pktw-ml-2", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")}>
											{item.description}
										</span>
									)}
									{item.rightIcon && (typeof item.rightIcon === 'function' ? item.rightIcon(isSelected) : item.rightIcon)}
								</div>
							</Button>
						);



						return button;
					} else {
						// Regular list style for context items
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
									{item.rightIcon && (typeof item.rightIcon === 'function' ? item.rightIcon(isSelected) : item.rightIcon)}
								</div>
							</Button>
						);
					}
				})}

				{/* Floating description for selected item */}
				{floatingDescription && (
					<div
						className={`${floatingDescription.positioning === 'relative' ? 'pktw-absolute' : 'pktw-fixed'} pktw-z-[9999] pktw-max-w-sm pktw-p-3 pktw-bg-popover pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-xl pktw-text-sm pktw-pointer-events-none`}
						style={{
							left: floatingDescription.left,
							top: floatingDescription.top,
							width: floatingDescription.width,
						}}
					>
						<div className="pktw-font-medium pktw-mb-2 pktw-text-foreground">
							{floatingDescription.content.label}
						</div>
						<div className="pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-break-words">
							{floatingDescription.content.description}
						</div>
					</div>
				)}
			</div>
		</>
	);
};
