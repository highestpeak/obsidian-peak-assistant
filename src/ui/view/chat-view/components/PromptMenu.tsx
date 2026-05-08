import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptMenuPosition {
	top: number;
	left: number;
}

export interface PromptMenuProps {
	/** Filtered items to display */
	items: NavigableMenuItem[];
	/** Currently highlighted index */
	selectedIndex: number;
	/** Position (fixed, in viewport coords) */
	position: PromptMenuPosition;
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

export const PromptMenu: React.FC<PromptMenuProps> = ({
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
		const el = listRef.current.querySelector(`[data-prompt-index="${selectedIndex}"]`) as HTMLElement | null;
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
				<span className="pktw-text-xs pktw-text-[var(--text-muted)]">No matching prompts</span>
			</div>
		);
	}

	// ----- Group items -----
	const groups = new Map<string, { item: NavigableMenuItem; globalIdx: number }[]>();
	items.forEach((item, i) => {
		const g = item.group ?? 'Quick Actions';
		if (!groups.has(g)) groups.set(g, []);
		groups.get(g)!.push({ item, globalIdx: i });
	});

	// ----- Main list -----
	return (
		<div
			ref={listRef}
			className="pktw-fixed pktw-z-[999] pktw-bg-popover pktw-border-2 pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-shadow-[0_8px_24px_rgba(0,0,0,0.3)] pktw-min-w-[280px] pktw-max-w-[400px] pktw-max-h-[300px] pktw-overflow-y-auto pktw-p-1"
			style={{ top: position.top, left: position.left }}
		>
			{[...groups.entries()].map(([groupName, groupItems]) => (
				<div key={groupName}>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-[var(--text-muted)] pktw-px-3 pktw-py-1.5 pktw-block">
						{groupName}
					</span>
					{groupItems.map(({ item, globalIdx }) => {
						const isSelected = globalIdx === selectedIndex;
						return (
							<Button
								key={item.id}
								data-prompt-index={globalIdx}
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
									{item.icon && (
										<div className="pktw-flex-shrink-0 pktw-pt-0.5">
											{typeof item.icon === 'function' ? item.icon(isSelected) : item.icon}
										</div>
									)}

									{/* Label + description */}
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

									{/* Template badge for non-Quick-Actions groups */}
									{item.group && item.group !== 'Quick Actions' && (
										<span className={cn(
											'pktw-ml-auto pktw-text-[8px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-flex-shrink-0',
											isSelected
												? 'pktw-bg-white/20 pktw-text-white'
												: 'pktw-bg-[var(--pk-accent-muted,rgba(124,58,237,0.15))] pktw-text-[var(--pk-accent,#7c3aed)]',
										)}>
											Template
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
