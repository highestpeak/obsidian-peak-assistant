import * as React from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';

/**
 * Structural rail (WP4): matched 30×30 radius-md disclosure + drag handle
 * (component-consistency §4: "Top-level disclosure and drag are both 30×30,
 * same border, radius, icon weight and shadow"). Expanded shows an UP chevron
 * (向上收起); collapsed shows DOWN (向下展开). The drag handle starts a pointer
 * drag owned by the root (drop target rendering + moveBlock commit).
 */
export interface BlockRailProps {
	folded: boolean;
	foldLabel: string;
	dragLabel: string;
	onToggle: () => void;
	/** Absent ⇒ drag unavailable (no hub); the handle renders disabled + reason. */
	onDragStart?: (ev: React.PointerEvent<HTMLButtonElement>) => void;
	dragDisabledReason?: string;
	onPointerEnter?: () => void;
	onPointerLeave?: () => void;
	onFocusCapture?: () => void;
	/** A unitized list renders its one drag/action handle at the active item. */
	hideDrag?: boolean;
}

export function BlockRail({
	folded,
	foldLabel,
	dragLabel,
	onToggle,
	onDragStart,
	dragDisabledReason,
	onPointerEnter,
	onPointerLeave,
	onFocusCapture,
	hideDrag = false,
}: BlockRailProps): React.ReactElement {
	const Icon = folded ? ChevronDown : ChevronUp;
	return (
		<div
			className="pk-composer-rail"
			data-chrome="true"
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			onFocusCapture={onFocusCapture}
		>
			<IconButton
				label={foldLabel}
				aria-expanded={!folded}
				className="pk-rail-control pk-composer-disclosure"
				onClick={onToggle}
			>
				<Icon size={15} strokeWidth={2} />
			</IconButton>
			{!hideDrag ? (
				<IconButton
					label={dragDisabledReason ? `${dragLabel} — ${dragDisabledReason}` : dragLabel}
					title={dragDisabledReason}
					className="pk-rail-control pk-composer-drag"
					disabled={!onDragStart}
					onPointerDown={onDragStart}
				>
					<GripVertical size={15} strokeWidth={2} />
				</IconButton>
			) : null}
		</div>
	);
}

export interface CollectionActionHandleProps {
	label: string;
	accessibleLabel: string;
	pinned: boolean;
	onPointerEnter: () => void;
	onPointerLeave: () => void;
	onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
	onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * One list-level handle projected beside the current item. It is not repeated
 * per item: ComposerRoot measures one active unit and moves this single button.
 */
export function CollectionActionHandle({
	label,
	accessibleLabel,
	pinned,
	onPointerEnter,
	onPointerLeave,
	onPointerDown,
	onClick,
}: CollectionActionHandleProps): React.ReactElement {
	return (
		<IconButton
			label={accessibleLabel}
			className="pk-composer-collection-handle"
			aria-pressed={pinned}
			data-collection-handle="true"
			data-pinned={pinned || undefined}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			onPointerDown={onPointerDown}
			onClick={onClick}
		>
			<GripVertical size={15} strokeWidth={2} aria-hidden />
			<span className="pk-composer-collection-handle__label">{label}</span>
		</IconButton>
	);
}
