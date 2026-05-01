import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextMenuPosition {
	top: number;
	left: number;
}

export interface ContextMenuProps {
	/** Filtered items to display */
	items: NavigableMenuItem[];
	/** Currently highlighted index */
	selectedIndex: number;
	/** Position (fixed, in viewport coords) */
	position: ContextMenuPosition;
	/** Whether data is loading */
	isLoading?: boolean;
	/** Callback when an item is picked */
	onSelect: (item: NavigableMenuItem) => void;
	/** Callback to dismiss */
	onClose: () => void;
	/** Callback to move highlight */
	onSelectedIndexChange: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ContextMenu: React.FC<ContextMenuProps> = ({
	items,
	selectedIndex,
	position,
	isLoading = false,
	onSelect,
	onClose,
	onSelectedIndexChange,
}) => {
	const listRef = useRef<HTMLDivElement>(null);

	// Scroll the highlighted row into view whenever it changes
	useLayoutEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.querySelector(`[data-ctx-index="${selectedIndex}"]`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	}, [selectedIndex]);

	// Keyboard navigation — capture phase so we beat CodeMirror / keymap
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					onSelectedIndexChange(Math.min(selectedIndex + 1, items.length - 1));
					break;
				case 'ArrowUp':
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
					break;
				case 'Enter':
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					if (items[selectedIndex]) {
						onSelect(items[selectedIndex]);
					}
					break;
				case 'Escape':
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					onClose();
					break;
			}
		};

		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	}, [selectedIndex, items, onSelect, onClose, onSelectedIndexChange]);

	// Close when clicking outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (listRef.current && !listRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [onClose]);

	// ----- Empty / loading states -----
	if (isLoading) {
		return (
			<div
				className="pktw-fixed pktw-z-[999] pktw-bg-popover pktw-border-2 pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-shadow-[0_8px_24px_rgba(0,0,0,0.3)] pktw-p-3 pktw-min-w-[280px] pktw-max-w-[400px]"
				style={{ top: position.top, left: position.left }}
			>
				<span className="pktw-text-xs pktw-text-[var(--text-muted)]">Loading...</span>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div
				className="pktw-fixed pktw-z-[999] pktw-bg-popover pktw-border-2 pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-shadow-[0_8px_24px_rgba(0,0,0,0.3)] pktw-p-3 pktw-min-w-[280px] pktw-max-w-[400px]"
				style={{ top: position.top, left: position.left }}
			>
				<span className="pktw-text-xs pktw-text-[var(--text-muted)]">No matching files</span>
			</div>
		);
	}

	// ----- Main list -----
	return (
		<div
			ref={listRef}
			className="pktw-fixed pktw-z-[999] pktw-bg-popover pktw-border-2 pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-shadow-[0_8px_24px_rgba(0,0,0,0.3)] pktw-min-w-[280px] pktw-max-w-[400px] pktw-max-h-[300px] pktw-overflow-y-auto pktw-p-1"
			style={{ top: position.top, left: position.left }}
		>
			{items.map((item, i) => {
				const isSelected = i === selectedIndex;

				return (
					<Button
						key={item.id}
						data-ctx-index={i}
						variant="ghost"
						type="button"
						onClick={() => onSelect(item)}
						onMouseEnter={() => onSelectedIndexChange(i)}
						className={cn(
							'pktw-w-full pktw-px-3 pktw-py-2 pktw-text-left pktw-text-sm pktw-transition-colors pktw-h-auto pktw-rounded',
							'hover:pktw-bg-[var(--background-modifier-hover)]',
							isSelected && 'pktw-bg-[var(--interactive-accent)] pktw-text-[var(--text-on-accent)]',
						)}
					>
						<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-w-full">
							{/* Icon */}
							<div className="pktw-flex-shrink-0 pktw-pt-0.5">
								{typeof item.icon === 'function' ? item.icon(isSelected) : item.icon}
							</div>

							{/* Label + path */}
							<div className="pktw-flex-1 pktw-min-w-0">
								<span className="pktw-font-medium pktw-truncate pktw-block pktw-text-[var(--text-normal)]">
									{item.label}
								</span>
								{item.description && (
									<span className={cn(
										'pktw-text-[10px] pktw-truncate pktw-block',
										isSelected ? 'pktw-text-white/70' : 'pktw-text-[var(--text-muted)]',
									)}>
										{item.description}
									</span>
								)}
							</div>

							{/* Folder arrow */}
							{item.showArrow && (
								<span className={cn(
									'pktw-text-sm pktw-flex-shrink-0',
									isSelected ? 'pktw-text-white' : 'pktw-text-[var(--text-muted)]',
								)}>
									&gt;
								</span>
							)}
						</div>
					</Button>
				);
			})}
		</div>
	);
};
