import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/ui/react/lib/utils';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/ui/component/shared-ui/tooltip';

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
	isTagStyle?: boolean; // For prompt-style tags with colors
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
	isTagStyle = false,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const [selectedItemRect, setSelectedItemRect] = useState<DOMRect | null>(null);

	// Filter out disabled items for navigation
	const enabledItems = items.filter(item => !item.disabled);
	const currentItem = enabledItems[selectedIndex];

	// Get items length and ids for stable dependencies
	const itemsLength = items.length;
	const itemsIds = items.map(item => item.id).join(',');

	// Reset selection when items change
	useEffect(() => {
		setSelectedIndex(0);
		setSelectedItemRect(null);
	}, [itemsIds]); // Use stable string instead of items array

	// Update selected item position when selection changes
	useEffect(() => {
		if (menuRef.current && enabledItems.length > 0) {
			const selectedItem = menuRef.current.querySelector(`[data-item-id="${enabledItems[selectedIndex]?.id}"]`) as HTMLElement;
			if (selectedItem) {
				const rect = selectedItem.getBoundingClientRect();
				setSelectedItemRect(rect);
			}
		}
	}, [selectedIndex, enabledItems.length, itemsIds]); // Use stable dependencies

	// Clear selected item rect when component unmounts or items change
	useEffect(() => {
		return () => {
			setSelectedItemRect(null);
		};
	}, [itemsIds]);

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
				{emptyMessage}
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
							<button
								key={item.id}
								data-item-id={item.id}
								type="button"
								onClick={() => !isDisabled && onSelect(item)}
								disabled={isDisabled}
								className={cn(
									'pktw-w-full pktw-px-3 pktw-py-2 pktw-text-left pktw-transition-colors',
									'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
									isSelected && 'pktw-bg-accent pktw-text-accent-foreground',
									isDisabled && 'pktw-opacity-50 pktw-cursor-not-allowed'
								)}
							>
								<div className="pktw-flex pktw-items-center pktw-gap-2">
									<span
										className={cn(
											'pktw-text-xs pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded pktw-transition-colors pktw-whitespace-nowrap',
											item.color || 'pktw-bg-blue-500/15 pktw-text-blue-700 dark:pktw-bg-blue-500/20 dark:pktw-text-blue-400',
											isSelected && 'pktw-bg-white pktw-text-blue-500 dark:pktw-bg-white dark:pktw-text-blue-500'
										)}
									>
										{item.label}
									</span>
									{item.description && (
										<span className={cn("pktw-text-xs pktw-truncate", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")}>
											{item.description}
										</span>
									)}
									{item.rightIcon && (typeof item.rightIcon === 'function' ? item.rightIcon(isSelected) : item.rightIcon)}
								</div>
							</button>
						);

						// Wrap with tooltip if description exists and is longer than a certain length
						if (item.description && item.description.length > 50) {
							return (
								<TooltipProvider key={item.id}>
									<Tooltip>
										<TooltipTrigger asChild>
											{button}
										</TooltipTrigger>
										<TooltipContent
											side="top"
											align="start"
											className="pktw-max-w-sm pktw-whitespace-pre-wrap pktw-break-words"
											sideOffset={5}
										>
											<div className="pktw-text-sm">
												<div className="pktw-font-medium pktw-mb-1">{item.label}</div>
												<div>{item.description}</div>
											</div>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							);
						}

						return button;
					} else {
						// Regular list style for context items
						return (
							<button
								key={item.id}
								data-item-id={item.id}
								type="button"
								onClick={() => !isDisabled && onSelect(item)}
								disabled={isDisabled}
								className={cn(
									'pktw-w-full pktw-px-3 pktw-py-2 pktw-text-left pktw-text-sm pktw-transition-colors',
									'hover:pktw-bg-accent hover:pktw-text-accent-foreground',
									isSelected && 'pktw-bg-accent pktw-text-accent-foreground',
									isDisabled && 'pktw-opacity-50 pktw-cursor-not-allowed'
								)}
							>
								<div className="pktw-flex pktw-items-center pktw-gap-2">
									{typeof item.icon === 'function' ? item.icon(isSelected) : item.icon}
									<div className="pktw-flex-1 pktw-min-w-0">
										<div className="pktw-font-medium pktw-truncate">
											{item.label}
										</div>
										{item.description && (
											<div className={cn("pktw-text-xs pktw-truncate", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")}>
												{item.description}
											</div>
										)}
									</div>
									{item.rightIcon && (typeof item.rightIcon === 'function' ? item.rightIcon(isSelected) : item.rightIcon)}
								</div>
							</button>
						);
					}
				})}

				{/* Floating description for selected item */}
				{selectedItemRect && enabledItems[selectedIndex]?.description && (() => {
					const POPOVER_WIDTH = 300;
					const POPOVER_HEIGHT = 200; // Approximate max height
					const MARGIN = 8;

					// Calculate available space on left and right
					const spaceOnRight = window.innerWidth - selectedItemRect.right;
					const spaceOnLeft = selectedItemRect.left;

					// Decide position: prefer right, fallback to left
					const showOnRight = spaceOnRight >= POPOVER_WIDTH + MARGIN;
					const showOnLeft = spaceOnLeft >= POPOVER_WIDTH + MARGIN && !showOnRight;

					let left, top;

					if (showOnRight) {
						// Show on the right
						left = selectedItemRect.right + MARGIN;
						top = Math.max(MARGIN, Math.min(selectedItemRect.top, window.innerHeight - POPOVER_HEIGHT - MARGIN));
					} else if (showOnLeft) {
						// Show on the left
						left = selectedItemRect.left - POPOVER_WIDTH - MARGIN;
						top = Math.max(MARGIN, Math.min(selectedItemRect.top, window.innerHeight - POPOVER_HEIGHT - MARGIN));
					} else {
						// Fallback: show below if no space on sides
						left = Math.max(MARGIN, Math.min(selectedItemRect.left, window.innerWidth - POPOVER_WIDTH - MARGIN));
						top = selectedItemRect.bottom + MARGIN;
					}

					return (
						<div
							className="pktw-fixed pktw-z-[9999] pktw-max-w-sm pktw-p-3 pktw-bg-popover pktw-border pktw-border-border pktw-rounded-lg pktw-shadow-xl pktw-text-sm pktw-pointer-events-none"
							style={{
								left,
								top,
							}}
						>
							<div className="pktw-font-medium pktw-mb-2 pktw-text-foreground">
								{enabledItems[selectedIndex].label}
							</div>
							<div className="pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-break-words">
								{enabledItems[selectedIndex].description}
							</div>
						</div>
					);
				})()}
			</div>
		</>
	);
};
