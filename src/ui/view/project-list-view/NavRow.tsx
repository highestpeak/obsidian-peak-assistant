import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

/**
 * NavRow — the shared left-column conversation row (mock `.nav-row`, ports
 * `.nav-leading` / `.row-label` / `.row-trailing` / `.row-time` / `.row-menu`
 * from docs/gstack/chat-studio-interactive-2026-07-13/mock.css).
 *
 * One presentational atom for Pinned / Recent / project-child rows so the three
 * lists cannot drift (ui-design.md §6.1). All geometry lives in the
 * `pkstudio-*` CSS classes — no inline style, selected state via `is-selected`
 * class (§7 "no conditional inline style"). The row is a <div> (not <button>)
 * so it sidesteps Obsidian's bare-<button> chrome; only the "…" menu is a
 * <button>, defended with !important in peak-components.css.
 */
export interface NavRowProps {
	/** Leading lucide icon element — sized to 14px by `.pkstudio-nav-leading svg`. */
	leading: React.ReactNode;
	/** Row title (plain string or a typewriter node). */
	label: React.ReactNode;
	/** Trailing timestamp; omitted from the DOM when empty (§5 collapse rule). */
	time?: string;
	selected?: boolean;
	isChild?: boolean;
	draggable?: boolean;
	/** aria-label for the row menu button. */
	menuLabel: string;
	/** native tooltip for the (possibly truncated) label. */
	labelTitle?: string;
	dataConversationId?: string;
	onClick: () => void;
	/** Opens the row action menu — wired to both right-click and the "…" button. */
	onOpenMenu: (e: React.MouseEvent) => void;
	onDragStart?: (e: React.DragEvent) => void;
}

export const NavRow: React.FC<NavRowProps> = ({
	leading,
	label,
	time,
	selected,
	isChild,
	draggable,
	menuLabel,
	labelTitle,
	dataConversationId,
	onClick,
	onOpenMenu,
	onDragStart,
}) => {
	// A11Y-02 — Enter/Space activates the row for keyboard users; the "…" menu
	// button inside also needs to swallow its own key events so pressing Enter
	// on the menu doesn't double-fire the row's onClick.
	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === 'Enter' || e.key === ' ') {
			// Don't hijack keystrokes that originated inside the menu button.
			const target = e.target as HTMLElement | null;
			if (target && target !== e.currentTarget && target.closest('.pkstudio-row-menu')) return;
			e.preventDefault();
			onClick();
		}
	};
	return (
		<div
			className={cn('pkstudio-nav-row', isChild && 'is-child', selected && 'is-selected')}
			data-conversation-id={dataConversationId}
			draggable={draggable}
			role="button"
			tabIndex={0}
			aria-current={selected ? 'true' : undefined}
			aria-label={labelTitle}
			onDragStart={onDragStart}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			onContextMenu={onOpenMenu}
		>
			<span className="pkstudio-nav-leading" aria-hidden>
				{leading}
			</span>
			<span className="pkstudio-row-label" title={labelTitle}>
				{label}
			</span>
			<span className="pkstudio-row-trailing">
				{time && <span className="pkstudio-row-time">{time}</span>}
				<button
					type="button"
					className="pkstudio-row-menu"
					aria-label={menuLabel}
					title={menuLabel}
					onClick={(e) => { e.stopPropagation(); onOpenMenu(e); }}
				>
					<MoreHorizontal aria-hidden />
				</button>
			</span>
		</div>
	);
};
