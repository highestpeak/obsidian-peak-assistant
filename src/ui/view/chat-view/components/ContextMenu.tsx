import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { ChevronLeft } from 'lucide-react';
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
	/** Folder drill-down breadcrumb path */
	folderStack?: string[];
	/** Navigate up one folder level */
	onFolderUp?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group items by their `group` field, preserving order. Ungrouped items have key ''. */
function groupItems(items: NavigableMenuItem[]): { group: string; items: { item: NavigableMenuItem; globalIdx: number }[] }[] {
	const groups: { group: string; items: { item: NavigableMenuItem; globalIdx: number }[] }[] = [];
	const groupMap = new Map<string, number>();

	items.forEach((item, i) => {
		const g = item.group ?? '';
		if (groupMap.has(g)) {
			groups[groupMap.get(g)!].items.push({ item, globalIdx: i });
		} else {
			groupMap.set(g, groups.length);
			groups.push({ group: g, items: [{ item, globalIdx: i }] });
		}
	});

	return groups;
}

/** Extract the last path segment for display. */
function folderName(path: string): string {
	const parts = path.split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
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
	folderStack = [],
	onFolderUp,
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
				case 'Backspace':
					if (folderStack.length > 0 && onFolderUp) {
						e.preventDefault();
						e.stopPropagation();
						e.stopImmediatePropagation();
						onFolderUp();
					}
					break;
			}
		};

		document.addEventListener('keydown', handler, true);
		return () => document.removeEventListener('keydown', handler, true);
	}, [selectedIndex, items, onSelect, onClose, onSelectedIndexChange, folderStack, onFolderUp]);

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

	const groups = groupItems(items);

	// ----- Main list -----
	return (
		<div
			ref={listRef}
			className="pktw-fixed pktw-z-[999] pktw-bg-popover pktw-border-2 pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-shadow-[0_8px_24px_rgba(0,0,0,0.3)] pktw-min-w-[280px] pktw-max-w-[400px] pktw-max-h-[300px] pktw-overflow-y-auto pktw-p-1"
			style={{ top: position.top, left: position.left }}
		>
			{/* Breadcrumb bar */}
			{folderStack.length > 0 && onFolderUp && (
				<button
					type="button"
					onClick={onFolderUp}
					className="pktw-flex pktw-items-center pktw-gap-1 pktw-w-full pktw-px-2 pktw-py-1.5 pktw-text-[10px] pktw-text-[var(--text-muted)] hover:pktw-text-[var(--text-normal)] pktw-border-b pktw-border-[var(--background-modifier-border)] pktw-mb-1 pktw-cursor-pointer pktw-bg-transparent"
				>
					<ChevronLeft className="pktw-w-3 pktw-h-3 pktw-flex-shrink-0" />
					<span className="pktw-truncate">
						{folderStack.length === 1
							? 'Vault'
							: folderName(folderStack[folderStack.length - 2])}
					</span>
					<span className="pktw-text-[var(--text-faint)]">/</span>
					<span className="pktw-font-medium pktw-text-[var(--text-normal)] pktw-truncate">
						{folderName(folderStack[folderStack.length - 1])}
					</span>
				</button>
			)}

			{groups.map(({ group, items: groupEntries }) => (
				<div key={group || '__ungrouped'}>
					{group && (
						<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-[var(--text-muted)] pktw-px-3 pktw-py-1.5 pktw-block">
							{group}
						</span>
					)}
					{groupEntries.map(({ item, globalIdx }) => {
						const isSelected = globalIdx === selectedIndex;

						return (
							<Button
								key={item.id}
								data-ctx-index={globalIdx}
								variant="ghost"
								type="button"
								onClick={() => onSelect(item)}
								onMouseEnter={() => onSelectedIndexChange(globalIdx)}
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

									{/* Meta badge */}
									{item.meta && (
										<span className={cn(
											'pktw-text-[9px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-flex-shrink-0 pktw-self-center pktw-font-medium',
											isSelected
												? 'pktw-bg-white/20 pktw-text-white'
												: 'pktw-bg-[var(--background-modifier-hover)] pktw-text-[var(--text-muted)]',
										)}>
											{item.meta}
										</span>
									)}

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
			))}
		</div>
	);
};
